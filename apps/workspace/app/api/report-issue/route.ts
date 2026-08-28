import { NextResponse } from 'next/server'
import { stores } from '../../../lib/store'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const paymentId = body?.paymentId
  const reason = body?.reason
  if (typeof paymentId !== 'string' || typeof reason !== 'string' || reason.length > 500) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const record = stores().payments.get(paymentId)
  if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (record.claim) return NextResponse.json({ error: 'already_filed' }, { status: 409 })

  record.claim = { reason, filedAt: new Date().toISOString(), status: 'received' }
  return NextResponse.json({
    ok: true,
    claim: record.claim,
    note: 'Claim recorded; merchant reviews within 24h in a real deployment.',
  })
}
