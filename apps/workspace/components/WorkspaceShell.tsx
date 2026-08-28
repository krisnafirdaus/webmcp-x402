'use client'

import { useEffect, useState } from 'react'
import { ApprovalSheet } from './ApprovalSheet'
import { CapabilitySurface } from './CapabilitySurface'
import { Ledger } from './Ledger'
import { ModeBadge } from './ModeBadge'
import { PolicyPanel } from './PolicyPanel'
import { SourceCard, type ResourceSummary } from './SourceCard'

const SAMPLE_PROMPT =
  "Compare EV battery pack price trends across the available sources, but don't spend more than $0.20. Prefer the cheapest adequate source."

const FEATURED_RESOURCE_ID = 'ev-batt-cells-daily'

function SourceCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={`animate-pulse rounded-xl border bg-white p-5 dark:bg-zinc-900 ${
        featured
          ? 'border-emerald-200 ring-1 ring-emerald-100 dark:border-emerald-900 dark:ring-emerald-950'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-4 h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for browsers/contexts without the async Clipboard API.
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — the prompt text is still selectable manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="min-h-10 shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
    >
      {copied ? 'Copied' : 'Copy prompt'}
    </button>
  )
}

export function WorkspaceShell() {
  const [resources, setResources] = useState<ResourceSummary[] | null>(null)

  const featuredResource = resources
    ? (resources.find((resource) => resource.id === FEATURED_RESOURCE_ID) ?? resources.find((resource) => !resource.free) ?? null)
    : null
  const otherResources = resources?.filter((resource) => resource.id !== featuredResource?.id) ?? null

  useEffect(() => {
    let cancelled = false
    fetch('/api/resources')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fetch_failed'))))
      .then((body) => {
        if (!cancelled && Array.isArray(body?.resources)) setResources(body.resources)
      })
      .catch(() => {
        if (!cancelled) setResources([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">SpendMCP</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Agents discover paid data. You set the limits and keep every receipt.
          </p>
        </div>
        <ModeBadge />
      </header>

      <div className="grid items-stretch gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div
          data-testid="sample-prompt"
          className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Start here</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Give your agent one research brief
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The prompt includes a hard session budget and a source-selection rule.
            </p>
          </div>
          <div className="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
            <code className="block text-sm leading-6 text-zinc-800 dark:text-zinc-200">{SAMPLE_PROMPT}</code>
          </div>
          <div className="mt-4 flex justify-end">
            <CopyButton text={SAMPLE_PROMPT} />
          </div>
        </div>
        <CapabilitySurface />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 min-[840px]:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section aria-labelledby="recommended-source-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                1 · Discover
              </p>
              <h2 id="recommended-source-title" className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Best fit for this brief
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cheapest paid source with pack-price coverage</p>
          </div>
          <div data-testid="recommended-source">
            {resources === null ? (
              <SourceCardSkeleton featured />
            ) : featuredResource ? (
              <SourceCard resource={featuredResource} featured />
            ) : (
              <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                No paid sources are available right now.
              </p>
            )}
          </div>
        </section>

        <PolicyPanel />

        <section aria-labelledby="other-sources-title">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Compare</p>
            <h2 id="other-sources-title" className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Other available sources
            </h2>
          </div>
          <div data-testid="other-sources" className="grid gap-4 sm:grid-cols-2">
            {otherResources === null
              ? Array.from({ length: 3 }).map((_, i) => <SourceCardSkeleton key={i} />)
              : otherResources.map((resource) => <SourceCard key={resource.id} resource={resource} />)}
          </div>
        </section>

        <Ledger />
      </div>

      <footer className="border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Open source (Apache-2.0) · x402 + WebMCP · testnet only — no real funds
      </footer>

      <ApprovalSheet />
    </div>
  )
}
