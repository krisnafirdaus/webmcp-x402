import { beforeEach, describe, expect, it } from 'vitest'
import { issueQuote, validateQuote } from '../lib/quotes'
import { resetStores, stores } from '../lib/store'

describe('quotes', () => {
  beforeEach(() => resetStores())

  it('issues a quote bound to a premium resource', () => {
    const q = issueQuote('ev-batt-cells-daily')
    expect(q?.quoteId).toMatch(/^q_[a-z0-9]+$/)
    expect(q?.requirements.maxAmountRequired).toBe('40000')
    expect(q?.requirements.resource).toBe(`/api/purchase/${q?.quoteId}`)
    expect(q?.requirements.scheme).toBe('exact')
    expect(q?.requirements.payTo).toMatch(/^0x/)
    expect(q?.expiresAt).toBeGreaterThan(Date.now())
  })
  it('refuses unknown or free resources', () => {
    expect(issueQuote('nope')).toBeNull()
    expect(issueQuote('ev-batt-overview')).toBeNull()
  })
  it('validateQuote: ok, expired, consumed, missing', () => {
    const q = issueQuote('ev-batt-cells-daily')!
    expect(validateQuote(q.quoteId).ok).toBe(true)
    stores().quotes.get(q.quoteId)!.expiresAt = Date.now() - 1
    expect(validateQuote(q.quoteId)).toEqual({ ok: false, error: 'quote_expired' })
    stores().quotes.get(q.quoteId)!.expiresAt = Date.now() + 10_000
    stores().quotes.get(q.quoteId)!.consumedBy = 'pay_x'
    expect(validateQuote(q.quoteId)).toEqual({ ok: false, error: 'quote_consumed' })
    expect(validateQuote('q_missing')).toEqual({ ok: false, error: 'quote_not_found' })
  })
})
