import { NextResponse } from 'next/server'
import { priceUsdOf, RESOURCES } from '../../../lib/resources'

export async function GET() {
  const resources = RESOURCES.map((r) => ({
    id: r.id,
    title: r.title,
    provider: r.provider,
    priceUsd: priceUsdOf(r),
    free: r.priceAtomic === '0',
    coverage: r.coverage,
    freshness: r.freshness,
    metrics: r.metrics,
  }))
  return NextResponse.json({ resources })
}
