import { describe, expect, it } from 'vitest'
import { parsePaymentRequired, pickExact, usd } from '../src/detect'
import type { PaymentRequirements } from '../src/types'

const reqs = {
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
  resource: '/api/article/a', description: 'Article A', mimeType: 'application/json',
  payTo: '0x1111111111111111111111111111111111111111',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
} satisfies PaymentRequirements
const body = { x402Version: 1, accepts: [reqs], error: 'payment required' }

describe('parsePaymentRequired', () => {
  it('parses a 402 with x402 body', async () => {
    const res = new Response(JSON.stringify(body), { status: 402 })
    const parsed = await parsePaymentRequired(res)
    expect(parsed?.accepts[0]?.maxAmountRequired).toBe('50000')
  })
  it('returns null for non-402', async () => {
    expect(await parsePaymentRequired(new Response('ok', { status: 200 }))).toBeNull()
  })
  it('returns null for 402 without x402 body', async () => {
    expect(await parsePaymentRequired(new Response('nope', { status: 402 }))).toBeNull()
  })
  it('does not consume the body', async () => {
    const res = new Response(JSON.stringify(body), { status: 402 })
    await parsePaymentRequired(res)
    expect((await res.json()).x402Version).toBe(1)
  })
  it('filters out accepts entries with non-numeric or negative maxAmountRequired', async () => {
    const dirty = {
      x402Version: 1,
      accepts: [
        { ...reqs, maxAmountRequired: 'abc' },
        { ...reqs, maxAmountRequired: '-50000' },
        { ...reqs, maxAmountRequired: '50000' },
      ],
    }
    const res = new Response(JSON.stringify(dirty), { status: 402 })
    const parsed = await parsePaymentRequired(res)
    expect(parsed?.accepts.length).toBe(1)
  })
  it('returns accepts: [] when every entry is invalid', async () => {
    const dirty = {
      x402Version: 1,
      accepts: [{ ...reqs, maxAmountRequired: 'abc' }, { ...reqs, maxAmountRequired: '-1' }],
    }
    const res = new Response(JSON.stringify(dirty), { status: 402 })
    const parsed = await parsePaymentRequired(res)
    expect(parsed?.accepts).toEqual([])
  })
})

describe('helpers', () => {
  it('usd converts atomic USDC', () => { expect(usd(reqs)).toBe(0.05) })
  it('pickExact picks first exact scheme', () => {
    expect(pickExact([{ ...reqs, scheme: 'other' }, reqs])?.scheme).toBe('exact')
  })
})
