import { NextResponse } from 'next/server'
import { receiptOf } from '../../../../lib/receipts'
import { stores } from '../../../../lib/store'

export async function GET(_req: Request, ctx: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await ctx.params
  const s = stores()
  // Accept either the server-issued paymentId or the caller's own client
  // idempotency identifier (X-Payment-Identifier) — both are valid bearer
  // capabilities for the same payment record.
  let record = s.payments.get(paymentId)
  if (!record) {
    const serverId = s.byClientPaymentId.get(paymentId)
    if (serverId) record = s.payments.get(serverId)
  }
  if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ receipt: receiptOf(record) })
}
