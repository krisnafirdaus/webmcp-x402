import { bySlugOrId } from './resources'
import { nextId, stores, type Quote } from './store'
import { NETWORK, PAY_TO, QUOTE_TTL_MS, USDC } from './x402'

export function issueQuote(resourceId: string): Quote | null {
  const r = bySlugOrId(resourceId)
  if (!r || r.priceAtomic === '0') return null
  const quoteId = nextId('q')
  const now = Date.now()
  const quote: Quote = {
    quoteId,
    resourceId: r.id,
    issuedAt: now,
    expiresAt: now + QUOTE_TTL_MS,
    requirements: {
      scheme: 'exact',
      network: NETWORK,
      maxAmountRequired: r.priceAtomic,
      resource: `/api/purchase/${quoteId}`,
      description: `Access to ${r.title} (${r.provider})`,
      mimeType: 'application/json',
      payTo: PAY_TO,
      asset: USDC,
      maxTimeoutSeconds: 300,
      extra: { name: 'USDC', version: '2' },
    },
  }
  stores().quotes.set(quoteId, quote)
  return quote
}

export type QuoteCheck =
  | { ok: true; quote: Quote }
  | { ok: false; error: 'quote_not_found' | 'quote_expired' | 'quote_consumed' }

export function validateQuote(quoteId: string): QuoteCheck {
  const quote = stores().quotes.get(quoteId)
  if (!quote) return { ok: false, error: 'quote_not_found' }
  if (Date.now() > quote.expiresAt) return { ok: false, error: 'quote_expired' }
  if (quote.consumedBy) return { ok: false, error: 'quote_consumed' }
  return { ok: true, quote }
}
