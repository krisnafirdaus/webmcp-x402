import { verifyTypedData } from 'viem'
import { chainIdFor, decodePaymentHeader, EIP3009_TYPES, type PaymentRequirements } from 'webmcp-x402'
import { stores } from './store'

export type VerifyResult =
  | { ok: true; payer: `0x${string}`; nonce: `0x${string}` }
  | {
      ok: false
      error: 'bad_header' | 'bad_signature' | 'wrong_recipient' | 'underpaid' | 'expired' | 'nonce_replayed'
    }

/**
 * Verifies an X-PAYMENT header against OUR requirements (never trusts
 * client-declared price/recipient). Records the nonce on success — callers
 * that fail settlement afterwards must release it via releaseNonce().
 */
export async function verifyPayment(
  header: string,
  req: PaymentRequirements,
): Promise<VerifyResult> {
  let payload: ReturnType<typeof decodePaymentHeader>
  try {
    payload = decodePaymentHeader(header)
    if (payload.x402Version !== 1 || payload.scheme !== 'exact') return { ok: false, error: 'bad_header' }
  } catch {
    return { ok: false, error: 'bad_header' }
  }

  const inner = payload.payload
  if (!inner || typeof inner !== 'object') return { ok: false, error: 'bad_header' }
  const { authorization: auth, signature } = inner
  if (!auth || typeof auth !== 'object' || typeof signature !== 'string') return { ok: false, error: 'bad_header' }

  // Validate numeric/shape fields up front so a hostile payload returns
  // bad_header instead of throwing inside BigInt() below. typeof checks
  // come before the regex test — RegExp#test coerces its argument to a
  // string, so a JSON *number* would otherwise sail through /^\d+$/.
  if (
    typeof auth.to !== 'string' ||
    typeof auth.from !== 'string' ||
    typeof auth.nonce !== 'string' ||
    typeof auth.value !== 'string' || !/^\d+$/.test(auth.value) ||
    typeof auth.validAfter !== 'string' || !/^\d+$/.test(auth.validAfter) ||
    typeof auth.validBefore !== 'string' || !/^\d+$/.test(auth.validBefore)
  ) {
    return { ok: false, error: 'bad_header' }
  }

  // Network must match OUR requirements, not the client's claim: chainIdFor
  // is only ever called with req.network below (never payload.network), so
  // this also guarantees that call can't throw on an unrecognized network.
  if (payload.network !== req.network) return { ok: false, error: 'bad_header' }

  if (auth.to.toLowerCase() !== req.payTo.toLowerCase()) return { ok: false, error: 'wrong_recipient' }
  if (BigInt(auth.value) < BigInt(req.maxAmountRequired)) return { ok: false, error: 'underpaid' }

  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < BigInt(auth.validAfter) || now > BigInt(auth.validBefore)) return { ok: false, error: 'expired' }
  if (stores().nonces.has(auth.nonce)) return { ok: false, error: 'nonce_replayed' }

  const valid = await verifyTypedData({
    address: auth.from,
    domain: {
      name: req.extra?.name ?? 'USDC',
      version: req.extra?.version ?? '2',
      chainId: chainIdFor(req.network),
      verifyingContract: req.asset,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
    signature,
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'bad_signature' }

  stores().nonces.add(auth.nonce)
  return { ok: true, payer: auth.from, nonce: auth.nonce }
}

export function releaseNonce(nonce: string): void {
  stores().nonces.delete(nonce)
}
