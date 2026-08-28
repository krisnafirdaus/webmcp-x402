import { FACILITATOR_URL, MOCK_MODE } from './x402'
import { decodePaymentHeader } from 'webmcp-x402'

export interface SettleOutcome { mode: 'mock' | 'real'; txHash?: string }

const TRANSACTION_HASH_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * Mock mode (default): signature verification already proved payment intent —
 * skip the chain entirely. Real mode: forward to the x402 facilitator.
 * x402 v1 facilitators expect the decoded payment payload alongside the
 * server-authored requirements. The X-PAYMENT transport header itself is not
 * part of the facilitator request envelope.
 */
export async function settle(paymentHeader: string, requirements: unknown): Promise<SettleOutcome> {
  if (MOCK_MODE) return { mode: 'mock' }
  const paymentPayload = decodePaymentHeader(paymentHeader)
  const res = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements: requirements }),
  })
  if (!res.ok) throw new Error(`facilitator settle failed: ${res.status}`)
  const data = (await res.json()) as {
    success?: boolean
    errorReason?: string
    transaction?: string
    txHash?: string
  }
  const txHash = data.txHash ?? data.transaction
  if (!data.success || !txHash || !TRANSACTION_HASH_RE.test(txHash)) {
    throw new Error(`facilitator settle failed: ${data.errorReason ?? 'invalid transaction hash'}`)
  }
  return { mode: 'real', txHash }
}
