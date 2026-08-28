'use client'

import { useSpendMCP } from './SpendMCPProvider'

const DATASET_TOOL = 'query_premium_dataset'

export function CapabilitySurface() {
  const { registeredToolNames } = useSpendMCP()
  const datasetToolLive = registeredToolNames.includes(DATASET_TOOL)
  const toolCount = registeredToolNames.length

  const steps = [
    { label: 'Discover', detail: '9 base tools' },
    { label: 'Guard & pay', detail: 'Policy enforced' },
    {
      label: 'Unlock',
      detail: datasetToolLive ? 'Premium query live' : 'Premium query locked',
    },
  ]

  return (
    <section
      data-testid="capability-surface"
      aria-labelledby="capability-surface-title"
      className={`flex h-full flex-col justify-between overflow-hidden rounded-2xl border bg-zinc-950 p-5 text-white shadow-sm sm:p-6 ${
        datasetToolLive ? 'border-emerald-500/70' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
            Live WebMCP capability
          </p>
          <h2 id="capability-surface-title" className="mt-2 text-lg font-semibold tracking-tight text-white">
            Payment changes what the agent can do
          </h2>
        </div>
        <span
          data-testid="tool-count"
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs font-semibold ${
            datasetToolLive ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-zinc-200'
          }`}
        >
          {toolCount > 0 ? `${toolCount} tools live` : 'Host not connected'}
        </span>
      </div>

      <div className="mt-7">
        <div data-testid="dynamic-tool-state" aria-live="polite">
          <p className={`text-2xl font-semibold tracking-tight ${datasetToolLive ? 'text-emerald-300' : 'text-white'}`}>
            {datasetToolLive ? 'Premium capability unlocked' : 'One verified payment unlocks tool #10'}
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            {datasetToolLive ? 'Registered after settlement: ' : 'Locked until verified payment: '}
            <code className="text-zinc-200">{DATASET_TOOL}</code>
          </p>
        </div>

        <ol aria-label="SpendMCP workflow" className="mt-6 grid grid-cols-3 gap-2">
          {steps.map((step, index) => {
            const unlockedStep = index === 2
            const active = unlockedStep && datasetToolLive
            return (
              <li key={step.label} className="min-w-0 border-t border-white/15 pt-3">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    active ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-zinc-200'
                  }`}
                >
                  {index + 1}
                </span>
                <p className="mt-2 text-xs font-semibold text-zinc-100">{step.label}</p>
                <p className={`mt-0.5 text-[11px] leading-4 ${active ? 'text-emerald-300' : 'text-zinc-500'}`}>
                  {step.detail}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
