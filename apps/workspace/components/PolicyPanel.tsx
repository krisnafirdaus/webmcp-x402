'use client'

import { useEffect, useState } from 'react'
import { createPolicy } from '../lib/policy'
import { useSpendMCP } from './SpendMCPProvider'

// The SSR-safe stand-in for `policy.state` before `hydrated` flips: a fresh
// unconfigured policy, matching what the server (which never sees a
// restored session) renders. Derived from the real defaults rather than
// duplicated as literals, so it can't drift out of sync with lib/policy.ts.
const DEFAULT_POLICY_DISPLAY_STATE = createPolicy().state

function NumberField({
  label,
  testId,
  value,
  onCommit,
}: {
  label: string
  testId: string
  value: number
  onCommit: (n: number) => void
}) {
  // Local text mirrors `value` but isn't overwritten mid-keystroke — only
  // resynced when the committed value actually changes (human edit elsewhere,
  // or an agent-driven policy change flowing back through context).
  const [text, setText] = useState(value.toString())
  useEffect(() => setText(value.toString()), [value])

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600 sm:min-h-10 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        data-testid={testId}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n) && n >= 0) onCommit(n)
        }}
        className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      />
    </label>
  )
}

export function PolicyPanel() {
  const { policy, bumpPolicy, account, pending, resetWallet, hydrated } = useSpendMCP()
  // Pre-hydration, a restored session already lives in policy.state (it's
  // seeded synchronously on the first client render) but the server render
  // this hydrates against never saw it — show the SSR-safe default for that
  // one render so hydration has nothing to mismatch on.
  const state = hydrated ? policy.state : DEFAULT_POLICY_DISPLAY_STATE

  const commit = (patch: Partial<{ perTxCapUsd: number; sessionCapUsd: number; autoApproveUnderUsd: number }>) => {
    policy.humanSet(patch)
    bumpPolicy()
  }

  const short = account ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}` : '—'
  const remaining = Math.max(0, state.sessionCapUsd - state.spentUsd)
  const spentPercent = state.sessionCapUsd > 0 ? Math.min(100, (state.spentUsd / state.sessionCapUsd) * 100) : 0

  const handleReset = () => {
    // Decline any open approval first so it doesn't orphan into the 120s timeout.
    if (pending) pending.resolve(false)
    resetWallet()
  }

  return (
    <section data-testid="policy-section" aria-labelledby="policy-panel-title">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">2 · Control</p>
        <h2 id="policy-panel-title" className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Set the guardrails
        </h2>
      </div>

      <div
        data-testid="policy-panel"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Session status</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Live policy for agent purchases</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">${remaining.toFixed(2)}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">session left</p>
          </div>
        </div>

        <div className="mt-4">
          <div
            role="progressbar"
            aria-label="Session budget used"
            aria-valuemin={0}
            aria-valuemax={state.sessionCapUsd}
            aria-valuenow={state.spentUsd}
            className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          >
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${spentPercent}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            <span>${state.spentUsd.toFixed(2)} spent</span>
            <span>${state.sessionCapUsd.toFixed(2)} budget</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            label="Per purchase"
            testId="per-tx-input"
            value={state.perTxCapUsd}
            onCommit={(n) => commit({ perTxCapUsd: n })}
          />
          <NumberField
            label="Session budget"
            testId="session-cap-input"
            value={state.sessionCapUsd}
            onCommit={(n) => commit({ sessionCapUsd: n })}
          />
          <NumberField
            label="Auto-approve"
            testId="auto-approve-input"
            value={state.autoApproveUnderUsd}
            onCommit={(n) => commit({ autoApproveUnderUsd: n })}
          />
        </div>

        <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
          Purchases at or below{' '}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            ${state.autoApproveUnderUsd.toFixed(2)}
          </strong>{' '}
          proceed automatically on <span className="font-mono">{state.allowedNetworks.join(', ')}</span>.
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            <div className="font-mono" title={account?.address}>
              {short}
            </div>
            <div>testnet demo wallet</div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Start over
          </button>
        </div>
      </div>
    </section>
  )
}
