import { describe, expect, it } from 'vitest'
import { createPolicy } from '../lib/policy'

describe('createPolicy', () => {
  it('defaults: $0.05 per-tx, $0.20 session, $0.05 auto-approve, base-sepolia only', () => {
    const p = createPolicy()
    expect(p.state).toMatchObject({ perTxCapUsd: 0.05, sessionCapUsd: 0.2, autoApproveUnderUsd: 0.05 })
    expect(p.state.allowedNetworks).toEqual(['base-sepolia'])
  })
  it('check refuses per-tx violations before budget', () => {
    const p = createPolicy()
    expect(p.check({ priceUsd: 0.12, network: 'base-sepolia' })).toEqual({ allowed: false, reason: 'per_tx_cap_exceeded' })
  })
  it('check refuses disallowed network', () => {
    const p = createPolicy()
    expect(p.check({ priceUsd: 0.01, network: 'base' })).toEqual({ allowed: false, reason: 'network_not_allowed' })
  })
  it('check refuses when session budget would be exceeded', () => {
    const p = createPolicy()
    p.budget.record(0.18)
    expect(p.check({ priceUsd: 0.04, network: 'base-sepolia' })).toEqual({ allowed: false, reason: 'session_budget_exceeded' })
  })
  it('allows within limits and reflects auto-approve decision', () => {
    const p = createPolicy()
    expect(p.check({ priceUsd: 0.04, network: 'base-sepolia' })).toEqual({ allowed: true, needsConfirm: false })
    p.humanSet({ autoApproveUnderUsd: 0.01 })
    expect(p.check({ priceUsd: 0.04, network: 'base-sepolia' })).toEqual({ allowed: true, needsConfirm: true })
  })
  it('agent lowering is free; raising is capped by human maxima', () => {
    const p = createPolicy()
    p.agentSet({ perTxCapUsd: 0.02, sessionCapUsd: 0.1 })
    expect(p.state.perTxCapUsd).toBeCloseTo(0.02)
    expect(p.state.sessionCapUsd).toBeCloseTo(0.1)
    p.agentSet({ perTxCapUsd: 9, sessionCapUsd: 9 })
    expect(p.state.perTxCapUsd).toBeCloseTo(0.05)
    expect(p.state.sessionCapUsd).toBeCloseTo(0.2)
    p.humanSet({ perTxCapUsd: 0.12, sessionCapUsd: 0.5 })
    expect(p.state.perTxCapUsd).toBeCloseTo(0.12)
    p.agentSet({ perTxCapUsd: 0.3 })
    expect(p.state.perTxCapUsd).toBeCloseTo(0.12)
  })
  it('agent cannot raise auto-approve above human baseline', () => {
    const p = createPolicy()
    p.humanSet({ autoApproveUnderUsd: 0 })
    p.agentSet({ autoApproveUnderUsd: 0.05 })
    expect(p.state.autoApproveUnderUsd).toBeCloseTo(0)
    p.humanSet({ autoApproveUnderUsd: 0.03 })
    p.agentSet({ autoApproveUnderUsd: 0.05 })
    expect(p.state.autoApproveUnderUsd).toBeCloseTo(0.03)
  })
  it('rejects invalid numbers everywhere', () => {
    const p = createPolicy()
    p.humanSet({ perTxCapUsd: Number.NaN, sessionCapUsd: -1 })
    expect(p.state.perTxCapUsd).toBeCloseTo(0.05)
    expect(p.state.sessionCapUsd).toBeCloseTo(0.2)
    expect(p.check({ priceUsd: Number.NaN, network: 'base-sepolia' })).toEqual({ allowed: false, reason: 'per_tx_cap_exceeded' })
  })
})
