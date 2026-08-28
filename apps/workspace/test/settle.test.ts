import { beforeEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { buildPaymentHeader, type PaymentRequirements } from 'webmcp-x402'

vi.mock('../lib/x402', () => ({
  FACILITATOR_URL: 'https://facilitator.example',
  MOCK_MODE: false,
  NETWORK: 'base-sepolia',
}))

import { settle } from '../lib/settle'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const requirements: PaymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '1000',
  resource: '/api/purchase/q_test',
  description: 'Test resource',
  payTo: '0x1111111111111111111111111111111111111111',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  maxTimeoutSeconds: 300,
  extra: { name: 'USDC', version: '2' },
}

describe('real x402 settlement', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends the decoded v1 payment payload in the facilitator envelope', async () => {
    const paymentHeader = await buildPaymentHeader(account, requirements)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, transaction: `0x${'ab'.repeat(32)}` }), {
        status: 200,
      }),
    )

    await expect(settle(paymentHeader, requirements)).resolves.toEqual({
      mode: 'real',
      txHash: `0x${'ab'.repeat(32)}`,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      x402Version: 1,
      paymentRequirements: requirements,
      paymentPayload: {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: { authorization: { from: account.address } },
      },
    })
    expect(body).not.toHaveProperty('paymentHeader')
    expect(body).not.toHaveProperty('network')
  })

  it('rejects a facilitator response that did not settle onchain', async () => {
    const paymentHeader = await buildPaymentHeader(account, requirements)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, errorReason: 'insufficient_funds', transaction: '' }), {
        status: 200,
      }),
    )

    await expect(settle(paymentHeader, requirements)).rejects.toThrow('insufficient_funds')
  })

  it('rejects a successful-looking response without a valid Base transaction hash', async () => {
    const paymentHeader = await buildPaymentHeader(account, requirements)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, transaction: 'settled' }), { status: 200 }),
    )

    await expect(settle(paymentHeader, requirements)).rejects.toThrow('invalid transaction hash')
  })
})
