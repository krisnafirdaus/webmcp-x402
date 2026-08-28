'use client'

import { useSpendMCP } from './SpendMCPProvider'

export function ModeBadge() {
  const { mode, webmcpReady } = useSpendMCP()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        data-testid="mode-badge"
        className={
          mode === 'mock'
            ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            : 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
        }
      >
        {mode === 'mock' ? 'Instant Demo Mode — settlement simulated, signatures real' : 'Real x402 Mode — Base Sepolia'}
      </span>
      <span
        data-testid="webmcp-badge"
        title={
          webmcpReady
            ? undefined
            : 'Tools register at page load; if your agent host injects WebMCP after load, reload the page.'
        }
        className={
          webmcpReady
            ? 'rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300'
            : 'rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }
      >
        {webmcpReady ? 'WebMCP active — agent tools registered' : 'Manual browser mode'}
      </span>
    </div>
  )
}
