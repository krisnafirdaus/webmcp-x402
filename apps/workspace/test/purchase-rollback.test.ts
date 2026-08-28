import { NextRequest } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPaymentHeader } from 'webmcp-x402'

// Hoisted by vitest — must precede the route import below. First call
// rejects (simulating a facilitator/settlement failure); every call after
// resolves like the real mock-mode settle() would.
vi.mock('../lib/settle', () => ({
  settle: vi.fn()
    .mockRejectedValueOnce(new Error('facilitator down'))
    .mockResolvedValue({ mode: 'mock' as const }),
}))

import { GET as purchaseGET } from '../app/api/purchase/[quoteId]/route'
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

describe('purchase route settlement rollback', () => {
  beforeEach(() => resetStores())

  it('rolls back the nonce and quote consumption when settle() throws, then allows a retry', async () => {
    const q = freshQuote()

    const header1 = await buildPaymentHeader(account, q.requirements)
    const failed = await purchase(q.quoteId, { 'X-PAYMENT': header1 })
    expect(failed.status).toBe(402)
    expect((await failed.json()).error).toBe('settlement_failed')
    expect(stores().quotes.get(q.quoteId)!.consumedBy).toBeUndefined()

    // Fresh header (fresh nonce) on the SAME quote — proves the quote is
    // reusable after rollback, not just that the nonce was released.
    const header2 = await buildPaymentHeader(account, q.requirements)
    const retried = await purchase(q.quoteId, { 'X-PAYMENT': header2 })
    expect(retried.status).toBe(200)
    const retriedBody = await retried.json()
    expect(retriedBody.granted).toBe(true)
  })
})
