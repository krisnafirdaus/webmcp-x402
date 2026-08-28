'use client'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { LocalAccount } from 'viem'

const KEY = 'spendmcp.demo-key.testnet-only'

/**
 * Throwaway TESTNET-ONLY demo wallet, generated in the browser, stored in
 * localStorage. Deliberate demo-grade tradeoff (see THREAT_MODEL): never used
 * on mainnet, never holds real funds, resettable.
 */
export function loadDemoAccount(): LocalAccount {
  let pk: `0x${string}` | null = null
  try {
    pk = localStorage.getItem(KEY) as `0x${string}` | null
  } catch { /* storage unavailable (SSR/private mode) */ }
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey()
    try { localStorage.setItem(KEY, pk) } catch { /* best effort */ }
  }
  return privateKeyToAccount(pk)
}

export function resetDemoAccount(): LocalAccount {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  return loadDemoAccount()
}
