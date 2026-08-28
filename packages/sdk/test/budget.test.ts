import { describe, expect, it } from 'vitest'
import { createBudget } from '../src/budget'

describe('createBudget', () => {
  it('denies over cap', () => {
    const b = createBudget({ capUsd: 0.1 })
    expect(b.decide(0.2)).toBe('deny')
  })
  it('denies when spent + amount exceeds cap', () => {
    const b = createBudget({ capUsd: 0.1 })
    b.record(0.08)
    expect(b.decide(0.05)).toBe('deny')
  })
  it('auto-approves under threshold', () => {
    const b = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.1 })
    expect(b.decide(0.05)).toBe('auto')
  })
  it('requires confirm otherwise', () => {
    const b = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.01 })
    expect(b.decide(0.05)).toBe('confirm')
  })
  it('tracks spend and exposes state copy', () => {
    const b = createBudget({ capUsd: 1 })
    b.record(0.05)
    const s = b.state
    expect(s.spentUsd).toBeCloseTo(0.05)
    ;(s as { spentUsd: number }).spentUsd = 99
    expect(b.state.spentUsd).toBeCloseTo(0.05)
  })
  it('setCap cannot go below spent', () => {
    const b = createBudget({ capUsd: 1 })
    b.record(0.5)
    b.setCap(0.1)
    expect(b.state.capUsd).toBeCloseTo(0.5)
  })
  it('denies NaN amount', () => {
    const b = createBudget({ capUsd: 1 })
    expect(b.decide(NaN)).toBe('deny')
  })
  it('denies negative amount', () => {
    const b = createBudget({ capUsd: 1 })
    expect(b.decide(-0.01)).toBe('deny')
  })
  it('record throws on NaN', () => {
    const b = createBudget({ capUsd: 1 })
    expect(() => b.record(NaN)).toThrow()
  })
  it('record throws on negative amount', () => {
    const b = createBudget({ capUsd: 1 })
    expect(() => b.record(-1)).toThrow()
  })
  it('epsilon accumulation does not falsely deny at the cap boundary', () => {
    const b = createBudget({ capUsd: 0.3 })
    b.record(0.1)
    b.record(0.2)
    expect(b.decide(0)).toBe('auto')
  })
  it('auto-approve boundary is inclusive', () => {
    const b = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.05 })
    expect(b.decide(0.05)).toBe('auto')
  })
  it('setCap(NaN) leaves capUsd unchanged', () => {
    const b = createBudget({ capUsd: 1 })
    b.setCap(NaN)
    expect(b.state.capUsd).toBe(1)
  })
  it('setAutoApprove(-1) leaves autoApproveUnderUsd unchanged', () => {
    const b = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.2 })
    b.setAutoApprove(-1)
    expect(b.state.autoApproveUnderUsd).toBe(0.2)
  })
})
