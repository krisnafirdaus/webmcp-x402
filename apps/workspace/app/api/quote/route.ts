import { NextResponse } from 'next/server'
import { issueQuote } from '../../../lib/quotes'
import { bySlugOrId, priceUsdOf } from '../../../lib/resources'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : null

  const quote = resourceId ? issueQuote(resourceId) : null
  if (!quote) return NextResponse.json({ error: 'unknown_or_free_resource' }, { status: 404 })

  const resource = bySlugOrId(quote.resourceId)!
  return NextResponse.json({
    quoteId: quote.quoteId,
    resourceId: quote.resourceId,
    priceUsd: priceUsdOf(resource),
    expiresAt: new Date(quote.expiresAt).toISOString(),
    requirements: quote.requirements,
    purchaseUrl: quote.requirements.resource,
  })
}
