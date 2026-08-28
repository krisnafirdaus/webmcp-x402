import { describe, expect, it } from 'vitest'
import { RESOURCES, bySlugOrId, priceUsdOf, resourceHash, queryRows } from '../lib/resources'

describe('catalog', () => {
  it('has one free and three premium sources', () => {
    expect(RESOURCES.filter((r) => r.priceAtomic === '0')).toHaveLength(1)
    expect(RESOURCES.filter((r) => r.priceAtomic !== '0')).toHaveLength(3)
  })
  it('bySlugOrId finds and misses', () => {
    expect(bySlugOrId(RESOURCES[0].id)?.id).toBe(RESOURCES[0].id)
    expect(bySlugOrId('nope')).toBeNull()
  })
  it('priceUsdOf converts atomic', () => {
    const premium = RESOURCES.find((r) => r.priceAtomic === '40000')!
    expect(priceUsdOf(premium)).toBeCloseTo(0.04)
  })
  it('resourceHash is stable sha256 of full data', async () => {
    const a = await resourceHash(RESOURCES[1])
    const b = await resourceHash(RESOURCES[1])
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })
  it('sampleRows are a strict prefix of fullData and small', () => {
    for (const r of RESOURCES) {
      expect(r.sampleRows.length).toBeLessThanOrEqual(3)
      expect(r.fullData.slice(0, r.sampleRows.length)).toEqual(r.sampleRows)
    }
  })
  it('queryRows filters by metric and range and aggregates', () => {
    const r = RESOURCES.find((x) => x.id === 'ev-batt-cells-daily')!
    const out = queryRows(r, { metric: r.metrics[0], from: '2025-01', to: '2025-12' })
    expect(out.rows.length).toBe(12)
    expect(out.summary.avg).toBeTypeOf('number')
    expect(out.rows.every((row) => row.month >= '2025-01' && row.month <= '2025-12' && row.metric === r.metrics[0])).toBe(true)
    expect(out.summary.first?.month).toBe('2025-01')
    expect(out.summary.last?.month).toBe('2025-12')
  })
})
