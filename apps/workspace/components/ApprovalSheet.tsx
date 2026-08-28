'use client'

import { useSpendMCP } from './SpendMCPProvider'

export function ApprovalSheet() {
  const { pending } = useSpendMCP()
  if (!pending) return null

  const isRaise = pending.kind === 'policy_raise'

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="w-full max-w-md rounded-xl border border-amber-400 bg-white p-5 shadow-xl dark:border-amber-500 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          <span id="approval-title">
          {isRaise ? 'Agent asks to raise your spending policy' : 'Payment approval needed'}
          </span>
        </h2>

        {isRaise ? (
          <>
            <p className="mt-2 text-base font-medium text-zinc-900 dark:text-zinc-50">{pending.description}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Raising limits lets the agent spend more without asking.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Agent wants to pay ${pending.amountUsd.toFixed(2)} USDC
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{pending.description}</p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Session: ${pending.spentUsd.toFixed(2)} of ${pending.capUsd.toFixed(2)}
            </p>
          </>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            data-testid="approve-payment"
            onClick={() => pending.resolve(true)}
            className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Approve
          </button>
          <button
            type="button"
            data-testid="deny-payment"
            onClick={() => pending.resolve(false)}
            className="min-h-11 flex-1 rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-500"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
