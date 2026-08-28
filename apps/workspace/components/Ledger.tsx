'use client'

import { safeTxHash, useSpendMCP } from './SpendMCPProvider'

function truncateMiddle(s: string, head = 20, tail = 6): string {
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

export function Ledger() {
  const { receipts, hydrated } = useSpendMCP()
  // Pre-hydration: a restored session's receipts already live in `receipts`
  // (seeded synchronously on the first client render), but the server
  // render this hydrates against always shows the empty-ledger state ([] vs
  // <ul> is a structural mismatch, not just text) — render the SSR-safe
  // empty list for that one render so hydration has nothing to mismatch on.
  const displayReceipts = hydrated ? receipts : []
  const rows = [...displayReceipts].reverse()
  const total = displayReceipts.reduce((sum, r) => sum + r.amountUsd, 0)

  return (
    <section data-testid="ledger-section" aria-labelledby="ledger-title">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">3 · Verify</p>
        <h2 id="ledger-title" className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Receipt ledger
        </h2>
      </div>

      <div
        data-testid="ledger"
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Settlement proof</p>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">${total.toFixed(2)} total</span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No payments yet — ask your agent to buy something.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r, i) => {
              const hash = safeTxHash(r)
              const time = new Date(r.at)
              const hh = String(time.getHours()).padStart(2, '0')
              const mm = String(time.getMinutes()).padStart(2, '0')
              return (
                <li
                  key={`${r.nonce}-${i}`}
                  data-testid="receipt-row"
                  className="rounded-lg border border-zinc-100 px-3 py-3 text-xs dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      ${r.amountUsd.toFixed(2)}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span className="min-w-0 font-mono text-zinc-600 dark:text-zinc-400">
                      {truncateMiddle(r.resource)}
                    </span>
                    <span
                      className={
                        r.mode === 'mock'
                          ? 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }
                    >
                      {r.mode === 'mock' ? 'Demo receipt' : 'Onchain'}
                    </span>
                    <span className="ml-auto text-zinc-500 dark:text-zinc-400">{`${hh}:${mm}`}</span>
                  </div>

                  <ol
                    data-testid="receipt-lifecycle"
                    aria-label="Payment completed, resource unlocked, query tool active"
                    className="mt-3 grid grid-cols-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
                  >
                    {['Paid', 'Unlocked', 'Tool active'].map((label, step) => (
                      <li
                        key={label}
                        className={`relative flex min-w-0 flex-col items-center gap-1 text-center font-medium text-zinc-700 dark:text-zinc-300 ${
                          step > 0
                            ? 'before:absolute before:right-1/2 before:top-1.5 before:h-px before:w-full before:bg-emerald-200 dark:before:bg-emerald-900'
                            : ''
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="relative z-10 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-600 ring-2 ring-white dark:ring-zinc-900"
                        >
                          <span className="h-1 w-1 rounded-full bg-white" />
                        </span>
                        <span>{label}</span>
                      </li>
                    ))}
                  </ol>

                  {hash && (
                    <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
                      <a
                        href={`https://sepolia.basescan.org/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={hash}
                        className="min-h-10 rounded-md border border-zinc-200 px-3 py-2 font-medium text-sky-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-sky-400 dark:hover:bg-zinc-800"
                      >
                        View transaction
                      </a>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          {displayReceipts.length} verified {displayReceipts.length === 1 ? 'payment' : 'payments'} this session
        </p>
      </div>
    </section>
  )
}
