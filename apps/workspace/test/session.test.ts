import { describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession, type SessionSnapshot, type StorageLike } from '../lib/session'

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  }
}

const validSnapshot: SessionSnapshot = {
  purchasedIds: ['ev-batt-cells-daily'],
  serverPaymentIds: [['ev-batt-cells-daily', 'pay_abc123']],
  receipts: [
    {
      amountUsd: 0.04,
      resource: 'ev-batt-cells-daily',
      nonce: '0xabc',
      network: 'base-sepolia',
      mode: 'mock',
      at: '2026-08-27T00:00:00.000Z',
    },
  ],
  policy: { perTxCapUsd: 0.05, sessionCapUsd: 0.2, spentUsd: 0.04, autoApproveUnderUsd: 0.05 },
}

describe('loadSession / saveSession', () => {
  it('roundtrips a valid snapshot', () => {
    const storage = fakeStorage()
    saveSession(validSnapshot, storage)
    expect(loadSession(storage)).toEqual(validSnapshot)
  })

  it('returns null when nothing stored', () => {
    expect(loadSession(fakeStorage())).toBeNull()
  })

  it('returns null with no storage available (SSR/private mode)', () => {
    expect(loadSession(null)).toBeNull()
    // saveSession must not throw either.
    expect(() => saveSession(validSnapshot, null)).not.toThrow()
  })

  it('returns null on malformed JSON', () => {
    const storage = fakeStorage({ 'spendmcp.session.v1': '{not json' })
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when policy has a NaN field', () => {
    const storage = fakeStorage()
    saveSession({ ...validSnapshot, policy: { ...validSnapshot.policy, spentUsd: Number.NaN } }, storage)
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when policy has a negative field', () => {
    const storage = fakeStorage()
    saveSession({ ...validSnapshot, policy: { ...validSnapshot.policy, perTxCapUsd: -0.01 } }, storage)
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when purchasedIds has a non-string entry', () => {
    const storage = fakeStorage({
      'spendmcp.session.v1': JSON.stringify({ ...validSnapshot, purchasedIds: [1, 2] }),
    })
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when serverPaymentIds entries are not [string, string] pairs', () => {
    const storage = fakeStorage({
      'spendmcp.session.v1': JSON.stringify({ ...validSnapshot, serverPaymentIds: [['only-one']] }),
    })
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when a receipt is missing required fields', () => {
    const storage = fakeStorage({
      'spendmcp.session.v1': JSON.stringify({ ...validSnapshot, receipts: [{ amountUsd: 0.04 }] }),
    })
    expect(loadSession(storage)).toBeNull()
  })

  it('returns null when the stored value is not an object', () => {
    const storage = fakeStorage({ 'spendmcp.session.v1': JSON.stringify('hello') })
    expect(loadSession(storage)).toBeNull()
  })

  it('clearSession removes the key', () => {
    const storage = fakeStorage()
    saveSession(validSnapshot, storage)
    clearSession(storage)
    expect(loadSession(storage)).toBeNull()
  })
})
