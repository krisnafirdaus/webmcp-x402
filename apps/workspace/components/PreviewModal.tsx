'use client'

import { useEffect, useState } from 'react'

interface PreviewData {
  id: string
  title: string
  provider: string
  priceUsd: number
  free: boolean
  coverage: string
  freshness: string
  metrics: string[]
  sampleRows: { month: string; metric: string; value: number }[]
}

export function PreviewModal({ resourceId, onClose }: { resourceId: string; onClose: () => void }) {
  const [data, setData] = useState<PreviewData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/resource/${resourceId}/preview`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fetch_failed'))))
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [resourceId])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => previousFocus?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="preview-modal-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {data?.title ?? 'Loading…'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            autoFocus
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load preview.</p>}

        {data && (
          <>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data.provider}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-500">Coverage</dt>
                <dd>{data.coverage}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500 dark:text-zinc-500">Freshness</dt>
                <dd>{data.freshness}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.metrics.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {m}
                </span>
              ))}
            </div>

            <table className="mt-4 w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-2">Month</th>
                  <th className="py-1 pr-2">Metric</th>
                  <th className="py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.sampleRows.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">{r.month}</td>
                    <td className="py-1 pr-2">{r.metric}</td>
                    <td className="py-1">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {data.free ? 'FREE' : `$${data.priceUsd.toFixed(2)}`}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Ask your agent to buy this, or use Buy.</p>
          </>
        )}
      </div>
    </div>
  )
}
