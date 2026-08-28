import type { LocalAccount } from 'viem'
import type { PaymentRequirements } from './types'

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

const CHAIN_IDS: Record<string, number> = { 'base-sepolia': 84532, base: 8453 }

export function chainIdFor(network: string): number {
  const id = CHAIN_IDS[network]
  if (!id) throw new Error(`Unsupported x402 network: ${network}`)
  return id
}

export interface PaymentPayload {
  x402Version: 1
  scheme: 'exact'
  network: string
  payload: {
    signature: `0x${string}`
    authorization: {
      from: `0x${string}`
      to: `0x${string}`
      value: string
      validAfter: string
      validBefore: string
      nonce: `0x${string}`
    }
  }
}

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function toBase64(s: string): string {
  if (typeof btoa === 'function') return btoa(s)
  return (globalThis as any).Buffer.from(s, 'utf8').toString('base64')
}

function fromBase64(s: string): string {
  if (typeof atob === 'function') return atob(s)
  return (globalThis as any).Buffer.from(s, 'base64').toString('utf8')
}

export async function buildPaymentHeader(
  account: LocalAccount,
  req: PaymentRequirements,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const timeout = Math.min(Math.max(Number(req.maxTimeoutSeconds) || 300, 60), 3600)
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: BigInt(req.maxAmountRequired),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + timeout),
    nonce: randomNonce(),
  }
  const signature = await account.signTypedData({
    domain: {
      name: req.extra?.name ?? 'USDC',
      version: req.extra?.version ?? '2',
      chainId: chainIdFor(req.network),
      verifyingContract: req.asset,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: req.network,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
  }
  return toBase64(JSON.stringify(payload))
}

export function decodePaymentHeader(header: string): PaymentPayload {
  return JSON.parse(fromBase64(header)) as PaymentPayload
}
