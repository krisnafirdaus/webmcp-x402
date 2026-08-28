import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPaymentHeader } from 'webmcp-x402'
import { issueQuote } from '../lib/quotes'
import { resetStores } from '../lib/store'
import { verifyPayment } from '../lib/verify'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

describe('verifyPayment', () => {
  beforeEach(() => resetStores())

  async function freshReq() {
    return issueQuote('ev-batt-cells-daily')!.requirements
  }

  it('accepts a valid payment header and records the nonce', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const result = await verifyPayment(header, req)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payer).toBe(account.address)
  })
  it('rejects replayed nonce', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    await verifyPayment(header, req)
    const replay = await verifyPayment(header, req)
    expect(replay).toEqual({ ok: false, error: 'nonce_replayed' })
  })
  it('rejects wrong recipient', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, {
      ...req,
      payTo: '0x2222222222222222222222222222222222222222',
    })
    expect(await verifyPayment(header, req)).toEqual({ ok: false, error: 'wrong_recipient' })
  })
  it('rejects underpayment', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, { ...req, maxAmountRequired: '1' })
    expect(await verifyPayment(header, req)).toEqual({ ok: false, error: 'underpaid' })
  })
  it('rejects tampered value (signature over different message)', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.payload.authorization.value = '999999'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    const result = await verifyPayment(tampered, req)
    expect(result).toEqual({ ok: false, error: 'bad_signature' })
  })
  it('rejects garbage header', async () => {
    const req = await freshReq()
    expect((await verifyPayment('not-base64-json', req)).ok).toBe(false)
  })
  it('rejects malformed validBefore instead of throwing', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.payload.authorization.validBefore = 'abc'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    expect(await verifyPayment(tampered, req)).toEqual({ ok: false, error: 'bad_header' })
  })
  it('rejects a hostile network without throwing', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.network = 'ethereum-mainnet-lol'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    await expect(verifyPayment(tampered, req)).resolves.toEqual({ ok: false, error: 'bad_header' })
  })
  it('rejects cross-chain header before doing signature work', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, { ...req, network: 'base' })
    expect(await verifyPayment(header, req)).toEqual({ ok: false, error: 'bad_header' })
  })
  it('rejects a header with the payload key omitted', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    delete decoded.payload
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    expect(await verifyPayment(tampered, req)).toEqual({ ok: false, error: 'bad_header' })
  })
  it('rejects a genuinely expired authorization before signature work', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.payload.authorization.validBefore = '1000'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    expect(await verifyPayment(tampered, req)).toEqual({ ok: false, error: 'expired' })
  })
  it('rejects a numeric-typed value instead of coercing it', async () => {
    const req = await freshReq()
    const header = await buildPaymentHeader(account, req)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    decoded.payload.authorization.value = 40000
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64')
    expect(await verifyPayment(tampered, req)).toEqual({ ok: false, error: 'bad_header' })
  })
})
