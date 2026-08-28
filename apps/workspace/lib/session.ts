'use client'

import type { PaymentReceipt } from 'webmcp-x402'

const KEY = 'spendmcp.session.v1'

export interface SessionPolicySnapshot {
  perTxCapUsd: number
  sessionCapUsd: number
  spentUsd: number
  autoApproveUnderUsd: number
}

export interface SessionSnapshot {
  purchasedIds: string[]
  serverPaymentIds: [string, string][]
  receipts: PaymentReceipt[]
  policy: SessionPolicySnapshot
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// `localStorage` is an ambient DOM global — referencing it where it doesn't
// exist (SSR, some private-mode configs) throws ReferenceError, not just
// "undefined", so this must go through `typeof` rather than a bare read.
function getStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isNonNegative = (n: unknown): n is number => isFiniteNumber(n) && n >= 0
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function isPaymentIdPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string'
}

// Loose but structural: checks every field the app actually reads
// (SourceCard/Ledger render these directly) without pinning to the SDK's
// exact nonce/txHash formats, which aren't this module's concern.
function isReceipt(v: unknown): v is PaymentReceipt {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    isFiniteNumber(r.amountUsd) &&
    typeof r.resource === 'string' &&
    typeof r.nonce === 'string' &&
    typeof r.network === 'string' &&
    (r.mode === 'mock' || r.mode === 'real') &&
    typeof r.at === 'string' &&
    (r.txHash === undefined || typeof r.txHash === 'string')
  )
}

function isPolicySnapshot(v: unknown): v is SessionPolicySnapshot {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    isNonNegative(p.perTxCapUsd) &&
    isNonNegative(p.sessionCapUsd) &&
    isNonNegative(p.spentUsd) &&
    isNonNegative(p.autoApproveUnderUsd)
  )
}

function isSnapshot(v: unknown): v is SessionSnapshot {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    isStringArray(s.purchasedIds) &&
    Array.isArray(s.serverPaymentIds) &&
    s.serverPaymentIds.every(isPaymentIdPair) &&
    Array.isArray(s.receipts) &&
    s.receipts.every(isReceipt) &&
    isPolicySnapshot(s.policy)
  )
}

/** Returns null on any missing/corrupt/malformed data — callers treat that identically to "no prior session". */
export function loadSession(storage: StorageLike | null = getStorage()): SessionSnapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Best-effort: storage quota errors, private-mode restrictions, etc. are swallowed rather than surfaced. */
export function saveSession(snapshot: SessionSnapshot, storage: StorageLike | null = getStorage()): void {
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // best effort
  }
}

export function clearSession(storage: StorageLike | null = getStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(KEY)
  } catch {
    // best effort
  }
}
