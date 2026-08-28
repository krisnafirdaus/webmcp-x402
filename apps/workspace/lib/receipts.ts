import type { PaymentRecord } from './store'

export function receiptOf(p: PaymentRecord) {
  return {
    paymentId: p.paymentId,
    clientPaymentId: p.clientPaymentId,
    quoteId: p.quoteId,
    resourceId: p.resourceId,
    resourceHash: p.resourceHash,
    amountAtomic: p.amountAtomic,
    amountUsd: Number(p.amountAtomic) / 1_000_000,
    payer: p.payer,
    recipient: p.recipient,
    nonce: p.nonce,
    status: p.status,
    settlement: { mode: p.mode, txHash: p.txHash ?? null },
    issuedAt: p.issuedAt,
    claim: p.claim ?? null,
  }
}
