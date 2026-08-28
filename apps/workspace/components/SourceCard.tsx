'use client'

import { useState } from 'react'
import { useSpendMCP } from './SpendMCPProvider'
import { PreviewModal } from './PreviewModal'

export interface ResourceSummary {
  id: string
  title: string
  provider: string
  priceUsd: number
  free: boolean
  coverage: string
  freshness: string
  metrics: string[]
}

interface QueryResult {
  rows: { month: string; metric: string; value: number }[]
  summary: { count: number; min: number | null; max: number | null; avg: number | null }
}

// Human-readable text for the denial codes purchase() can return: workspace
// policy codes (per_tx_cap_exceeded, session_budget_exceeded) plus SDK-level
// PaymentDeniedError codes (user_declined, confirm_timeout, budget_exceeded,
// asset_not_allowed). Anything not listed here (network_not_allowed,
// wallet_not_ready, quote_failed, server_refused, unexpected_error, ...)
// falls through to a generic message with `detail` shown underneath when
// present.
const DENIAL_MESSAGES: Record<string, string> = {
  per_tx_cap_exceeded: 'Above your per-transaction cap — raise it in the policy panel',
  session_budget_exceeded: 'Session budget exhausted',
  user_declined: 'You declined',
  confirm_timeout: 'Approval timed out',
  budget_exceeded: 'Session budget exhausted',
  asset_not_allowed: 'Payment asset not allowed',
}

export function SourceCard({ resource, featured = false }: { resource: ResourceSummary; featured?: boolean }) {
  const { purchase, purchasedIds, serverPaymentIdFor, reportIssue, policy } = useSpendMCP()
  const purchased = purchasedIds.includes(resource.id)
  const policyState = policy.state
  const remainingBudget = Math.max(0, policyState.sessionCapUsd - policyState.spentUsd)
  const withinCurrentPolicy = resource.priceUsd <= policyState.perTxCapUsd && resource.priceUsd <= remainingBudget
  const autoApproved = withinCurrentPolicy && resource.priceUsd <= policyState.autoApproveUnderUsd

  const [showPreview, setShowPreview] = useState(false)
  const [buying, setBuying] = useState(false)
  const [denial, setDenial] = useState<{ message: string; detail?: string } | null>(null)
  const [justPaid, setJustPaid] = useState<number | null>(null)

  const [metric, setMetric] = useState(resource.metrics[0] ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [querying, setQuerying] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)

  const [reporting, setReporting] = useState(false)
  const [reportMsg, setReportMsg] = useState<string | null>(null)

  const handleBuy = async () => {
    setBuying(true)
    setDenial(null)
    const result = await purchase(resource.id)
    setBuying(false)
    if (result.ok) {
      setJustPaid(resource.priceUsd)
      return
    }
    const message = DENIAL_MESSAGES[result.denied] ?? `Purchase failed: ${result.denied}`
    setDenial({ message, detail: result.detail })
  }

  const handleRunQuery = async () => {
    const paymentId = serverPaymentIdFor(resource.id)
    if (!paymentId) {
      setQueryError('Receipt reference missing — try buying again.')
      return
    }
    setQuerying(true)
    setQueryError(null)
    try {
      const params = new URLSearchParams({ paymentId })
      if (metric) params.set('metric', metric)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/resource/${resource.id}/data?${params.toString()}`)
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setQueryError('Query failed.')
        return
      }
      setQueryResult(body)
    } catch {
      setQueryError('Query failed.')
    } finally {
      setQuerying(false)
    }
  }

  const handleReport = async () => {
    const paymentId = serverPaymentIdFor(resource.id)
    if (!paymentId) return
    const reason = window.prompt('Describe the issue with this delivery:')
    if (!reason) return
    setReporting(true)
    setReportMsg(null)
    const { body } = await reportIssue(paymentId, reason)
    setReporting(false)
    const ok = Boolean((body as { ok?: boolean } | null)?.ok)
    setReportMsg(ok ? 'Claim filed.' : 'Could not file claim (already filed?).')
  }

  const chip = purchased
    ? { label: 'Unlocked · query tool active', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
    : resource.free
      ? { label: 'Open', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' }
      : { label: 'Locked', className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' }

  const featuredStatus = autoApproved
    ? 'Within policy · auto-approved'
    : withinCurrentPolicy
      ? 'Within policy · asks you first'
      : 'Recommended source · adjust policy'

  return (
    <article
      data-testid={`source-card-${resource.id}`}
      className={`rounded-xl border bg-white p-5 dark:bg-zinc-900 ${
        featured
          ? 'border-emerald-300 ring-1 ring-emerald-100 dark:border-emerald-800 dark:ring-emerald-950'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {featured && (
        <div className="mb-4 flex items-center gap-2 border-b border-emerald-100 pb-3 text-xs dark:border-emerald-950">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-semibold text-emerald-800 dark:text-emerald-300">Recommended for this brief</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="text-zinc-600 dark:text-zinc-400">{purchased ? 'Tool unlocked' : featuredStatus}</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{resource.title}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{resource.provider}</p>
        </div>
        <span
          className={
            resource.free
              ? 'shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }
        >
          {resource.free ? 'FREE' : `$${resource.priceUsd.toFixed(2)}`}
        </span>
      </div>

      <dl
        data-testid={`provenance-${resource.id}`}
        aria-label="Source provenance"
        className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800"
      >
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Coverage</dt>
          <dd className="text-zinc-500 dark:text-zinc-400">{resource.coverage}</dd>
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Freshness</dt>
          <dd className="text-zinc-500 dark:text-zinc-400">{resource.freshness}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <span data-testid={`state-${resource.id}`} className={`rounded-full px-2.5 py-1 text-xs font-medium ${chip.className}`}>
          {chip.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`preview-${resource.id}`}
          onClick={() => setShowPreview(true)}
          className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Preview
        </button>
        {!resource.free && !purchased && (
          <button
            type="button"
            data-testid={`buy-${resource.id}`}
            onClick={handleBuy}
            disabled={buying}
            className="min-h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {buying ? 'Paying…' : `Buy · $${resource.priceUsd.toFixed(2)}`}
          </button>
        )}
      </div>

      {denial && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {denial.message}
          {denial.detail && <div className="mt-0.5 text-red-500 dark:text-red-400">{denial.detail}</div>}
        </div>
      )}

      {justPaid !== null && (
        <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          ✓ Paid ${justPaid.toFixed(2)} — receipt in ledger
        </div>
      )}

      {purchased && (
        <div data-testid={`query-form-${resource.id}`} className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(9rem,1.15fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto]">
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Metric</span>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="min-h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {resource.metrics.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">From</span>
              <input
                type="month"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="min-h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">To</span>
              <input
                type="month"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="min-h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <button
              type="button"
              onClick={handleRunQuery}
              disabled={querying}
              className="min-h-10 justify-self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {querying ? 'Running…' : 'Run'}
            </button>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-testid={`report-${resource.id}`}
              onClick={handleReport}
              disabled={reporting}
              className="min-h-10 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Report issue
            </button>
          </div>

          {queryError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{queryError}</p>}
          {reportMsg && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{reportMsg}</p>}

          {queryResult && (
            <>
              <div className="mt-3 max-h-64 overflow-auto rounded-md border border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                      <th className="px-2 py-1">Month</th>
                      <th className="px-2 py-1">Metric</th>
                      <th className="px-2 py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-2 py-1">{r.month}</td>
                        <td className="px-2 py-1">{r.metric}</td>
                        <td className="px-2 py-1">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {queryResult.summary.count} rows · min {queryResult.summary.min ?? '—'} · max {queryResult.summary.max ?? '—'} · avg{' '}
                {queryResult.summary.avg ?? '—'}
              </p>
            </>
          )}
        </div>
      )}

      {showPreview && <PreviewModal resourceId={resource.id} onClose={() => setShowPreview(false)} />}
    </article>
  )
}
