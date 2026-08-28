import type { PaymentRequirements, X402Body } from './types'

export async function parsePaymentRequired(res: Response): Promise<X402Body | null> {
  if (res.status !== 402) return null
  try {
    const body = (await res.clone().json()) as X402Body
    if (typeof body?.x402Version !== 'number' || !Array.isArray(body?.accepts)) return null
    const accepts = body.accepts.filter(
      (a) => typeof a?.maxAmountRequired === 'string' && /^\d+$/.test(a.maxAmountRequired),
    )
    return { ...body, accepts }
  } catch {
    return null
  }
}

export function pickExact(accepts: PaymentRequirements[]): PaymentRequirements | null {
  return accepts.find((a) => a.scheme === 'exact') ?? null
}

/** USDC has 6 decimals. */
export function usd(req: PaymentRequirements): number {
  return Number(req.maxAmountRequired) / 1_000_000
}
