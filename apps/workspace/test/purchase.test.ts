import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPaymentHeader } from 'webmcp-x402'
import { GET as receiptGET } from '../app/api/receipt/[paymentId]/route'
import { GET as dataGET } from '../app/api/resource/[id]/data/route'
import { GET as purchaseGET } from '../app/api/purchase/[quoteId]/route'
import { POST as reportIssuePOST } from '../app/api/report-issue/route'
import { issueQuote } from '../lib/quotes'
import { resetStores, stores } from '../lib/store'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

const RESOURCE_ID = 'ev-batt-cells-daily'

const freshQuote = () => issueQuote(RESOURCE_ID)!

async function purchase(quoteId: string, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost/api/purchase/${quoteId}`, { headers })
  return purchaseGET(req, { params: Promise.resolve({ quoteId }) })
}

async function getReceipt(paymentId: string) {
  const req = new NextRequest(`http://localhost/api/receipt/${paymentId}`)
  return receiptGET(req, { params: Promise.resolve({ paymentId }) })
}

async function reportIssue(paymentId: unknown, reason: unknown) {
  const req = new NextRequest('http://localhost/api/report-issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId, reason }),
  })
  return reportIssuePOST(req)
}

describe('purchase route', () => {
  beforeEach(() => resetStores())

  it('no X-PAYMENT header -> 402 with accepts + error', async () => {
    const q = freshQuote()
    const res = await purchase(q.quoteId)
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('payment required')
    expect(body.accepts).toEqual([q.requirements])
  })

  it('happy path -> 200 granted, receipt delivered, nonce + ipSpend recorded', async () => {
    const q = freshQuote()
    const header = await buildPaymentHeader(account, q.requirements)
    const res = await purchase(q.quoteId, { 'X-PAYMENT': header })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.granted).toBe(true)
    expect(body.replayed).toBe(false)
    expect(body.receipt.resourceHash).toMatch(/^sha256:/)
    expect(body.receipt.status).toBe('delivered')
    expect(body.data.rows.length).toBeGreaterThan(0)

    const xpr = res.headers.get('X-PAYMENT-RESPONSE')
    expect(xpr).toBeTruthy()
    const decoded = JSON.parse(Buffer.from(xpr!, 'base64').toString('utf8'))
    expect(decoded).toMatchObject({ success: true, mode: 'mock' })

    expect(stores().quotes.get(q.quoteId)!.consumedBy).toBeTruthy()
    expect(stores().ipSpend.get('local')?.count).toBe(1)
  })

  it('second different payment header on a consumed quote -> 410 quote_consumed', async () => {
    const q = freshQuote()
    const header1 = await buildPaymentHeader(account, q.requirements)
    const first = await purchase(q.quoteId, { 'X-PAYMENT': header1 })
    expect(first.status).toBe(200)

    const header2 = await buildPaymentHeader(account, q.requirements)
    const second = await purchase(q.quoteId, { 'X-PAYMENT': header2 })
    expect(second.status).toBe(410)
    expect((await second.json()).error).toBe('quote_consumed')
  })

  it('idempotent replay via X-Payment-Identifier skips re-verification and re-spend', async () => {
    const q = freshQuote()
    const header = await buildPaymentHeader(account, q.requirements)
    // 'pay_e2e_1' is only 5 chars after the 'pay_' prefix — too short for the
    // /^pay_[a-zA-Z0-9_-]{8,128}$/ gate added below, so this identifier was
    // bumped to keep this test meaningful (the format is enforced elsewhere).
    const first = await purchase(q.quoteId, {
      'X-PAYMENT': header,
      'X-Payment-Identifier': 'pay_e2e_12345678',
    })
    expect(first.status).toBe(200)
    const firstBody = await first.json()

    const replay = await purchase(q.quoteId, { 'X-Payment-Identifier': 'pay_e2e_12345678' })
    expect(replay.status).toBe(200)
    const replayBody = await replay.json()
    expect(replayBody.replayed).toBe(true)
    expect(replayBody.receipt.paymentId).toBe(firstBody.receipt.paymentId)
    expect(stores().ipSpend.get('local')?.count).toBe(1)
  })

  it('malformed X-Payment-Identifier is rejected before any replay lookup', async () => {
    const q = freshQuote()
    const tooShort = await purchase(q.quoteId, { 'X-Payment-Identifier': 'pay_1' })
    expect(tooShort.status).toBe(400)
    expect((await tooShort.json()).error).toBe('invalid_payment_identifier')

    const noPrefix = await purchase(q.quoteId, { 'X-Payment-Identifier': 'x' })
    expect(noPrefix.status).toBe(400)
    expect((await noPrefix.json()).error).toBe('invalid_payment_identifier')
  })

  it('expired quote -> 410 quote_expired', async () => {
    const q = freshQuote()
    stores().quotes.get(q.quoteId)!.expiresAt = Date.now() - 1
    const res = await purchase(q.quoteId)
    expect(res.status).toBe(410)
    expect((await res.json()).error).toBe('quote_expired')
  })

  it('per-IP daily guard -> 429 rate_limited', async () => {
    const q = freshQuote()
    const today = new Date().toISOString().slice(0, 10)
    stores().ipSpend.set('local', { dayKey: today, count: 25, atomicTotal: BigInt(0) })
    const res = await purchase(q.quoteId)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfter: 'tomorrow' })
  })

  it('report-issue: files once, rejects a duplicate claim', async () => {
    const q = freshQuote()
    const header = await buildPaymentHeader(account, q.requirements)
    const bought = await purchase(q.quoteId, { 'X-PAYMENT': header })
    const { receipt } = await bought.json()

    const res1 = await reportIssue(receipt.paymentId, 'bad data')
    expect(res1.status).toBe(200)
    expect((await res1.json()).ok).toBe(true)

    const res2 = await reportIssue(receipt.paymentId, 'still bad')
    expect(res2.status).toBe(409)
    expect((await res2.json()).error).toBe('already_filed')
  })

  it('data route: filtered rows after purchase, 402 without a valid paymentId', async () => {
    const q = freshQuote()
    const header = await buildPaymentHeader(account, q.requirements)
    const bought = await purchase(q.quoteId, { 'X-PAYMENT': header })
    const { receipt } = await bought.json()

    const okReq = new NextRequest(
      `http://localhost/api/resource/${RESOURCE_ID}/data?paymentId=${receipt.paymentId}&metric=pack_usd_per_kwh&from=2025-01&to=2025-12`,
    )
    const ok = await dataGET(okReq, { params: Promise.resolve({ id: RESOURCE_ID }) })
    expect(ok.status).toBe(200)
    const okBody = await ok.json()
    expect(okBody.rows.length).toBeGreaterThan(0)
    expect(okBody.rows.every((r: { metric: string }) => r.metric === 'pack_usd_per_kwh')).toBe(true)

    const deniedReq = new NextRequest(`http://localhost/api/resource/${RESOURCE_ID}/data`)
    const denied = await dataGET(deniedReq, { params: Promise.resolve({ id: RESOURCE_ID }) })
    expect(denied.status).toBe(402)
    expect((await denied.json()).error).toBe('not_purchased')
  })

  it('receipt route resolves by the client payment identifier too, not just the server paymentId', async () => {
    const q = freshQuote()
    const header = await buildPaymentHeader(account, q.requirements)
    const clientId = 'pay_client_12345678'
    const bought = await purchase(q.quoteId, { 'X-PAYMENT': header, 'X-Payment-Identifier': clientId })
    expect(bought.status).toBe(200)
    const { receipt } = await bought.json()

    const byServerId = await getReceipt(receipt.paymentId)
    expect(byServerId.status).toBe(200)
    expect((await byServerId.json()).receipt).toEqual(receipt)

    const byClientId = await getReceipt(clientId)
    expect(byClientId.status).toBe(200)
    expect((await byClientId.json()).receipt).toEqual(receipt)
  })

  it('receipt route 404s for a truly unknown id', async () => {
    const res = await getReceipt('pay_totallyunknown12345678')
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })
})
