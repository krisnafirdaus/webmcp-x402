import type { PaymentRequirements } from 'webmcp-x402'

// In-memory, per-server-instance stores. Demo-grade: on serverless each
// instance has its own maps, which weakens replay/idempotency guarantees
// across instances. Documented in README/THREAT_MODEL; fine for the demo.

export interface Quote {
  quoteId: string
  resourceId: string
  requirements: PaymentRequirements
  issuedAt: number
  expiresAt: number
  consumedBy?: string // payment record id
}

export interface PaymentRecord {
  paymentId: string          // server record id (pay_…)
  clientPaymentId: string    // client idempotency value (x402 payment-identifier)
  quoteId: string
  resourceId: string
  resourceHash: string
  amountAtomic: string
  payer: `0x${string}`
  recipient: `0x${string}`
  nonce: `0x${string}`
  mode: 'mock' | 'real'
  status: 'settled' | 'delivered' | 'failed'
  txHash?: string
  issuedAt: string
  claim?: { reason: string; filedAt: string; status: 'received' }
}

interface Stores {
  quotes: Map<string, Quote>
  payments: Map<string, PaymentRecord>       // by paymentId
  byClientPaymentId: Map<string, string>     // clientPaymentId -> paymentId
  nonces: Set<string>
  ipSpend: Map<string, { dayKey: string; count: number; atomicTotal: bigint }>
  counter: number
}

const g = globalThis as unknown as { __spendmcp?: Stores }
g.__spendmcp ??= {
  quotes: new Map(),
  payments: new Map(),
  byClientPaymentId: new Map(),
  nonces: new Set(),
  ipSpend: new Map(),
  counter: 0,
}

export const stores = () => g.__spendmcp!

// Bearer-capability ids (receipt/data URLs are unauthenticated besides the
// id itself) — must be unguessable, not just unique. `counter` is kept on
// Stores/resetStores for now (unused) rather than ripping it out.
export const nextId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`

export const resetStores = () => {
  const s = stores()
  s.quotes.clear()
  s.payments.clear()
  s.byClientPaymentId.clear()
  s.nonces.clear()
  s.ipSpend.clear()
  s.counter = 0
}
