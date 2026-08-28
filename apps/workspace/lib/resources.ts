export interface ResourceRow {
  month: string // 'YYYY-MM'
  metric: string
  value: number
}

export interface Resource {
  id: string
  title: string
  provider: string
  priceAtomic: string // USDC 6-decimals; '0' = free
  coverage: string
  freshness: string
  metrics: string[]
  sampleRows: ResourceRow[]
  fullData: ResourceRow[]
}

function months(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/** Deterministic synthetic series: descending trend + provider-specific wobble. */
function series(
  metric: string,
  start: string,
  end: string,
  startValue: number,
  endValue: number,
  wobbleSeed: number,
): ResourceRow[] {
  const ms = months(start, end)
  const n = ms.length - 1 || 1
  return ms.map((month, i) => {
    const base = startValue + ((endValue - startValue) * i) / n
    const wobble = Math.sin(i * wobbleSeed) * (startValue - endValue) * 0.02
    return { month, metric, value: Number((base + wobble).toFixed(2)) }
  })
}

export const RESOURCES: Resource[] = [
  {
    id: 'ev-batt-overview',
    title: 'EV Battery Market Overview',
    provider: 'OpenGrid Notes',
    priceAtomic: '0',
    coverage: 'Annual industry summary, global',
    freshness: 'yearly, through 2025',
    metrics: ['global_demand_gwh'],
    ...(() => {
      const fullData = series('global_demand_gwh', '2022-01', '2025-01', 550, 1200, 3).filter((_, i) => i % 12 === 0)
      return { sampleRows: fullData.slice(0, 3), fullData }
    })(),
  },
  {
    id: 'ev-batt-cells-daily',
    title: 'Battery Pack & Cell Price Index',
    provider: 'CellIndex Pro',
    priceAtomic: '40000', // $0.04
    coverage: 'Monthly pack + cell $/kWh, global weighted',
    freshness: 'monthly, through 2026-07',
    metrics: ['pack_usd_per_kwh', 'cell_usd_per_kwh'],
    ...(() => {
      const fullData = [
        ...series('pack_usd_per_kwh', '2024-01', '2026-07', 151, 78, 3),
        ...series('cell_usd_per_kwh', '2024-01', '2026-07', 107, 54, 5),
      ]
      return { sampleRows: fullData.slice(0, 3), fullData }
    })(),
  },
  {
    id: 'ev-batt-materials',
    title: 'Battery Raw Materials Tracker',
    provider: 'LithiumLens',
    priceAtomic: '60000', // $0.06
    coverage: 'Monthly lithium carbonate + nickel spot, USD/tonne',
    freshness: 'monthly, through 2026-07',
    metrics: ['lithium_carbonate_usd_t', 'nickel_usd_t'],
    ...(() => {
      const fullData = [
        ...series('lithium_carbonate_usd_t', '2024-01', '2026-07', 13500, 9200, 7),
        ...series('nickel_usd_t', '2024-01', '2026-07', 16800, 15100, 11),
      ]
      return { sampleRows: fullData.slice(0, 3), fullData }
    })(),
  },
  {
    id: 'ev-batt-forecasts',
    title: 'Pack Price Forecast 2026–2028',
    provider: 'GigaForecast',
    priceAtomic: '120000', // $0.12 — above the default $0.05 per-tx cap ON PURPOSE (human-approval demo path)
    coverage: 'Monthly pack $/kWh forecast, base scenario',
    freshness: 'quarterly model run, 2026-Q3',
    metrics: ['pack_usd_per_kwh_forecast'],
    ...(() => {
      const fullData = series('pack_usd_per_kwh_forecast', '2026-08', '2028-12', 76, 58, 4)
      return { sampleRows: fullData.slice(0, 3), fullData }
    })(),
  },
]

export const bySlugOrId = (id: string) => RESOURCES.find((r) => r.id === id) ?? null

export const priceUsdOf = (r: Resource) => Number(r.priceAtomic) / 1_000_000

export async function resourceHash(r: Resource): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(r.fullData))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function queryRows(r: Resource, q: { metric?: string; from?: string; to?: string }) {
  const rows = r.fullData.filter(
    (row) =>
      (!q.metric || row.metric === q.metric) &&
      (!q.from || row.month >= q.from) &&
      (!q.to || row.month <= q.to),
  )
  const values = rows.map((x) => x.value)
  const summary = {
    count: rows.length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    avg: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
    first: rows[0] ?? null,
    last: rows.at(-1) ?? null,
  }
  return { rows, summary }
}
