import type { LocalAccount } from 'viem'
import type { Budget } from './budget'
import { parsePaymentRequired, pickExact, usd } from './detect'
import { buildPaymentHeader, decodePaymentHeader } from './pay'
import type { PaymentReceipt, PaymentRequirements } from './types'

export type DenyReason = 'budget_exceeded' | 'user_declined' | 'confirm_timeout' | 'asset_not_allowed'

export class PaymentDeniedError extends Error {
  constructor(
    public reason: DenyReason,
    public amountUsd: number,
    public resource: string,
    public detail?: string,
  ) {
    super(`payment denied (${reason}): $${amountUsd} for ${resource}${detail ? ` — ${detail}` : ''}`)
    this.name = 'PaymentDeniedError'
  }
}

export interface ConfirmDetails {
  amountUsd: number
  resource: string
  description: string
  spentUsd: number
  capUsd: number
}

export interface PaymentEvent {
  amountUsd: number
  resource: string
  receipt: PaymentReceipt
}

/**
 * Canonical USDC per network, lowercased. usd()/budget math assumes 6-decimal
 * USDC — widening this list without revisiting pricing breaks the unit of account.
 */
export const DEFAULT_ALLOWED_ASSETS: Record<string, readonly string[]> = Object.freeze({
  'base-sepolia': ['0x036cbd53842c5426634e7929541ec2318f3dcf7e'],
  base: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
})

export interface PaidFetchOptions {
  account: LocalAccount
  budget: Budget
  /**
   * Human approval gate. Resolve false → PaymentDeniedError('user_declined').
   * A thrown error propagates to the caller — apps implementing an approval
   * timeout should throw PaymentDeniedError('confirm_timeout', …) rather than
   * resolving false. A confirm that never settles blocks all subsequent
   * payments on this instance (payments are serialized), and confirm must not
   * itself trigger a paid fetch on the same instance (non-reentrant queue).
   * Omit = only auto-approved payments succeed.
   */
  confirm?: (details: ConfirmDetails) => Promise<boolean>
  onPayment?: (e: PaymentEvent) => void
  fetchImpl?: typeof fetch
  /** Per-network asset allowlist (addresses compared lowercased). */
  allowedAssets?: Record<string, readonly string[]>
}

function decodeReceiptHeader(
  res: Response,
  fallback: Omit<PaymentReceipt, 'txHash' | 'mode'>,
): PaymentReceipt {
  const raw = res.headers.get('X-PAYMENT-RESPONSE')
  let mode: PaymentReceipt['mode'] = 'mock'
  let txHash: string | undefined
  if (raw) {
    try {
      const text = typeof atob === 'function' ? atob(raw) : (globalThis as any).Buffer.from(raw, 'base64').toString('utf8')
      const parsed = JSON.parse(text)
      if (parsed.mode === 'real') mode = 'real'
      if (typeof parsed.txHash === 'string') txHash = parsed.txHash
    } catch {
      /* keep fallback */
    }
  }
  return { ...fallback, mode, txHash }
}

export function createPaidFetch(opts: PaidFetchOptions) {
  const { account, budget, confirm, onPayment } = opts
  const fetchImpl = opts.fetchImpl ?? fetch
  const allowedAssets = opts.allowedAssets ?? DEFAULT_ALLOWED_ASSETS

  // Payments serialize so decide → confirm → sign → record can't interleave
  // and jointly overspend the budget across the async confirm/settle gap.
  let queue: Promise<unknown> = Promise.resolve()
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function payAndRetry(
    input: string | URL,
    init: RequestInit | undefined,
    req: PaymentRequirements,
  ): Promise<Response> {
    const amountUsd = usd(req)

    const allowed = (allowedAssets[req.network] ?? []).includes(req.asset.toLowerCase())
    if (!allowed) {
      throw new PaymentDeniedError(
        'asset_not_allowed',
        amountUsd,
        req.resource,
        `asset ${req.asset} not allowlisted on ${req.network}`,
      )
    }

    const decision = budget.decide(amountUsd)
    if (decision === 'deny') throw new PaymentDeniedError('budget_exceeded', amountUsd, req.resource)
    if (decision === 'confirm') {
      const ok = confirm
        ? await confirm({
            amountUsd,
            resource: req.resource,
            description: req.description,
            spentUsd: budget.state.spentUsd,
            capUsd: budget.state.capUsd,
          })
        : false
      if (!ok) throw new PaymentDeniedError('user_declined', amountUsd, req.resource)
      // Policy may have changed while the human deliberated; re-check.
      if (budget.decide(amountUsd) === 'deny') {
        throw new PaymentDeniedError('budget_exceeded', amountUsd, req.resource)
      }
    }

    // Address case carries no signing meaning (EIP-712 encodes addresses as raw
    // bytes), but viem's strict validator rejects a non-checksummed mixed/upper
    // string. Lowercase before signing so any casing that cleared the allowlist
    // above also clears buildPaymentHeader's stricter address validation.
    const signingReq: PaymentRequirements = { ...req, asset: req.asset.toLowerCase() as `0x${string}` }
    const header = await buildPaymentHeader(account, signingReq)
    const second = await fetchImpl(input, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init?.headers ?? {})), 'X-PAYMENT': header },
    })
    if (second.ok) {
      budget.record(amountUsd)
      const { authorization } = decodePaymentHeader(header).payload
      try {
        onPayment?.({
          amountUsd,
          resource: req.resource,
          receipt: decodeReceiptHeader(second, {
            amountUsd,
            resource: req.resource,
            nonce: authorization.nonce,
            network: req.network,
            at: new Date().toISOString(),
          }),
        })
      } catch {
        // Money already moved and budget already recorded; an observer that
        // throws must not lose the caller's Response.
      }
    }
    return second
  }

  return async function paidFetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const first = await fetchImpl(input, init)
    const x402 = await parsePaymentRequired(first)
    if (!x402) return first
    const req = pickExact(x402.accepts)
    if (!req) return first
    return serialize(() => payAndRetry(input, init, req))
  }
}
