import { NextResponse } from 'next/server'
import { bySlugOrId, priceUsdOf } from '../../../../../lib/resources'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const r = bySlugOrId(id)
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({
    id: r.id,
    title: r.title,
    provider: r.provider,
    priceUsd: priceUsdOf(r),
    free: r.priceAtomic === '0',
    coverage: r.coverage,
    freshness: r.freshness,
    metrics: r.metrics,
    sampleRows: r.sampleRows,
  })
}
