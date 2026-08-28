import { NextRequest, NextResponse } from 'next/server'
import { bySlugOrId, queryRows } from '../../../../../lib/resources'
import { stores } from '../../../../../lib/store'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const resource = bySlugOrId(id)
  if (!resource) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const sp = req.nextUrl.searchParams
  const isFree = resource.priceAtomic === '0'
  if (!isFree) {
    const paymentId = sp.get('paymentId')
    const record = paymentId ? stores().payments.get(paymentId) : undefined
    if (!record || record.resourceId !== resource.id) {
      return NextResponse.json({ error: 'not_purchased' }, { status: 402 })
    }
  }

  const result = queryRows(resource, {
    metric: sp.get('metric') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
  })
  return NextResponse.json(result)
}
