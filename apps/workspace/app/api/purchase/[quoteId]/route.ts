import { NextRequest, NextResponse } from 'next/server'
import { receiptOf } from '../../../../lib/receipts'
import { validateQuote } from '../../../../lib/quotes'
import { bySlugOrId, resourceHash } from '../../../../lib/resources'
import { settle } from '../../../../lib/settle'
import { nextId, stores, type PaymentRecord } from '../../../../lib/store'
import { releaseNonce, verifyPayment } from '../../../../lib/verify'

// Amendment 5 demo guard: caps runaway per-IP spend independent of anything
// the client claims about itself.
const IP_DAILY_MAX_COUNT = 25
const IP_DAILY_MAX_ATOMIC = BigInt(2_000_000) // $2.00 in USDC 6-decimals

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'

const dayKeyNow = () => new Date().toISOString().slice(0, 10)

// Bearer-capability boundary: this is the ONLY thing standing between an
// attacker guessing/brute-forcing another client's idempotency key and
// getting their receipt + data grant for free. Any tool-side pattern
// validation is defense-in-depth only — this is the real gate.
const CLIENT_PAYMENT_ID_RE = /^pay_[a-zA-Z0-9_-]{8,128}$/

function paymentResponseHeader(fields: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(fields)).toString('base64')
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await ctx.params
  const clientPaymentIdHeader = req.headers.get('X-Payment-Identifier')

  if (clientPaymentIdHeader && !CLIENT_PAYMENT_ID_RE.test(clientPaymentIdHeader)) {
    return NextResponse.json({ error: 'invalid_payment_identifier' }, { status: 400 })
  }

  // (1) Idempotent replay: matched by the CLIENT's own identifier, resolved
  // before touching rate limits, quote state, or verification.
  if (clientPaymentIdHeader) {
    const existingId = stores().byClientPaymentId.get(clientPaymentIdHeader)
    const record = existingId ? stores().payments.get(existingId) : undefined
    if (record) {
      const resource = bySlugOrId(record.resourceId)!
      const res = NextResponse.json({
        granted: true,
        replayed: true,
        receipt: receiptOf(record),
        data: { rows: resource.fullData, metrics: resource.metrics },
      })
      res.headers.set(
        'X-PAYMENT-RESPONSE',
        paymentResponseHeader({
          success: true,
          mode: record.mode,
          nonce: record.nonce,
          txHash: record.txHash ?? null,
          replayed: true,
        }),
      )
      return res
    }
  }

  // (2) Per-IP demo guard.
  const ip = clientIp(req)
  const today = dayKeyNow()
  const spend = stores().ipSpend.get(ip)
  if (
    spend &&
    spend.dayKey === today &&
    (spend.count >= IP_DAILY_MAX_COUNT || spend.atomicTotal >= IP_DAILY_MAX_ATOMIC)
  ) {
    return NextResponse.json({ error: 'rate_limited', retryAfter: 'tomorrow' }, { status: 429 })
  }

  // (3) Quote must exist, be unexpired, and be unconsumed.
  const check = validateQuote(quoteId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 410 })
  const { quote } = check
  const resource = bySlugOrId(quote.resourceId)
  if (!resource) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // (4) Payment required.
  const paymentHeader = req.headers.get('X-PAYMENT')
  if (!paymentHeader) {
    return NextResponse.json(
      { x402Version: 1, accepts: [quote.requirements], error: 'payment required' },
      { status: 402 },
    )
  }

  // (5) Verify against OUR requirements — never client input.
  const verified = await verifyPayment(paymentHeader, quote.requirements)
  if (!verified.ok) {
    return NextResponse.json(
      { x402Version: 1, accepts: [quote.requirements], error: verified.error },
      { status: 402 },
    )
  }

  // Compute the resource hash BEFORE the atomic consume: it's the only other
  // await in this vicinity, and if it threw AFTER consume/settle it would
  // leave a consumed quote + a settled payment with no record and no
  // rollback path. Doing it here means the only await between consume and
  // record-store is settle(), which already has its own rollback.
  const resourceHashValue = await resourceHash(resource)

  // (6) Atomic consume: read-then-write on quote.consumedBy with no await in
  // between, so no concurrent request can slip in and double-spend the quote.
  if (quote.consumedBy) {
    releaseNonce(verified.nonce)
    return NextResponse.json(
      { x402Version: 1, accepts: [quote.requirements], error: 'quote_consumed' },
      { status: 402 },
    )
  }
  const paymentId = nextId('pay')
  quote.consumedBy = paymentId

  // (7) Settle AFTER consumption; roll back both the nonce and the
  // consumption mark if settlement fails.
  let settlement
  try {
    settlement = await settle(paymentHeader, quote.requirements)
  } catch {
    releaseNonce(verified.nonce)
    quote.consumedBy = undefined
    return NextResponse.json(
      { x402Version: 1, accepts: [quote.requirements], error: 'settlement_failed' },
      { status: 402 },
    )
  }

  // (8) Record the payment and count it against the IP's daily allowance.
  const clientPaymentId = clientPaymentIdHeader ?? verified.nonce
  const record: PaymentRecord = {
    paymentId,
    clientPaymentId,
    quoteId: quote.quoteId,
    resourceId: resource.id,
    resourceHash: resourceHashValue,
    amountAtomic: quote.requirements.maxAmountRequired,
    payer: verified.payer,
    recipient: quote.requirements.payTo,
    nonce: verified.nonce,
    mode: settlement.mode,
    status: 'settled',
    txHash: settlement.txHash,
    issuedAt: new Date().toISOString(),
  }
  stores().payments.set(paymentId, record)
  stores().byClientPaymentId.set(clientPaymentId, paymentId)

  // Re-read (rather than reuse the pre-await `spend`) so this read-modify-write
  // has no await in between, same discipline as the quote consume above —
  // otherwise two concurrent first-purchases-of-the-day for one IP could both
  // see no entry and race to create it, losing an increment.
  const amount = BigInt(record.amountAtomic)
  const currentSpend = stores().ipSpend.get(ip)
  if (currentSpend && currentSpend.dayKey === today) {
    currentSpend.count += 1
    currentSpend.atomicTotal += amount
  } else {
    stores().ipSpend.set(ip, { dayKey: today, count: 1, atomicTotal: amount })
  }

  // (9) Deliver.
  record.status = 'delivered'
  const res = NextResponse.json({
    granted: true,
    replayed: false,
    receipt: receiptOf(record),
    data: { rows: resource.fullData, metrics: resource.metrics },
  })
  res.headers.set(
    'X-PAYMENT-RESPONSE',
    paymentResponseHeader({
      success: true,
      mode: settlement.mode,
      nonce: verified.nonce,
      txHash: settlement.txHash ?? null,
    }),
  )
  return res
}
