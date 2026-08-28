export interface PaymentRequirements {
  scheme: string
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType?: string
  payTo: `0x${string}`
  asset: `0x${string}`
  maxTimeoutSeconds?: number
  extra?: { name?: string; version?: string }
}

export interface X402Body {
  x402Version: number
  accepts: PaymentRequirements[]
  error?: string
}

export interface PaymentReceipt {
  amountUsd: number
  resource: string
  nonce: `0x${string}`
  network: string
  txHash?: string
  mode: 'mock' | 'real'
  at: string
}
