export const NETWORK = 'base-sepolia'
export const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
export const PAY_TO = (process.env.PAY_TO ?? '0x1111111111111111111111111111111111111111') as `0x${string}`
export const MOCK_MODE = process.env.MOCK_MODE !== '0'
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator'
export const QUOTE_TTL_MS = 120_000
