import { verifyTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { buildPaymentHeader, chainIdFor, decodePaymentHeader, EIP3009_TYPES } from '../src/pay'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const req = {
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
  resource: '/api/article/a', description: 'Article A',
  payTo: '0x1111111111111111111111111111111111111111' as const,
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
  maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
}

describe('chainIdFor', () => {
  it('maps known networks', () => {
    expect(chainIdFor('base-sepolia')).toBe(84532)
    expect(chainIdFor('base')).toBe(8453)
  })
  it('throws on unknown network', () => {
    expect(() => chainIdFor('mainnet')).toThrow()
  })
})

describe('buildPaymentHeader', () => {
  it('produces a decodable payload with a valid signature', async () => {
    const header = await buildPaymentHeader(account, req)
    const payload = decodePaymentHeader(header)
    expect(payload.x402Version).toBe(1)
    expect(payload.scheme).toBe('exact')
    const { authorization, signature } = payload.payload
    expect(authorization.from).toBe(account.address)
    expect(authorization.to).toBe(req.payTo)
    expect(authorization.value).toBe('50000')
    expect(authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    const ok = await verifyTypedData({
      address: account.address,
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: req.asset },
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from, to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature,
    })
    expect(ok).toBe(true)
  })
  it('uses unique nonces', async () => {
    const a = decodePaymentHeader(await buildPaymentHeader(account, req))
    const b = decodePaymentHeader(await buildPaymentHeader(account, req))
    expect(a.payload.authorization.nonce).not.toBe(b.payload.authorization.nonce)
  })
  it('clamps a string maxTimeoutSeconds instead of concatenating it', async () => {
    const badReq: any = { ...req, maxTimeoutSeconds: '600' }
    const payload = decodePaymentHeader(await buildPaymentHeader(account, badReq))
    const { validAfter, validBefore } = payload.payload.authorization
    expect(BigInt(validBefore) - BigInt(validAfter)).toBe(660n)
  })
  it('clamps an oversized maxTimeoutSeconds to the max window', async () => {
    const bigReq = { ...req, maxTimeoutSeconds: 3e9 }
    const payload = decodePaymentHeader(await buildPaymentHeader(account, bigReq))
    const { validAfter, validBefore } = payload.payload.authorization
    expect(BigInt(validBefore) - BigInt(validAfter)).toBe(3660n)
  })
  it('applies safe defaults when extra and maxTimeoutSeconds are absent', async () => {
    const minimalReq = {
      scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
      resource: '/api/article/a', description: 'Article A',
      payTo: '0x1111111111111111111111111111111111111111' as const,
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
    }
    const header = await buildPaymentHeader(account, minimalReq)
    const payload = decodePaymentHeader(header)
    const { authorization, signature } = payload.payload
    expect(BigInt(authorization.validBefore) - BigInt(authorization.validAfter)).toBe(360n)
    const ok = await verifyTypedData({
      address: account.address,
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: minimalReq.asset },
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from, to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature,
    })
    expect(ok).toBe(true)
  })
})
