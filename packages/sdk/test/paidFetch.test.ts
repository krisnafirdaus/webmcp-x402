import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'
import { createBudget } from '../src/budget'
import { createPaidFetch, DEFAULT_ALLOWED_ASSETS, PaymentDeniedError } from '../src/paidFetch'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

function body402(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 1,
    accepts: [{
      scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
      resource: '/a', description: 'A',
      payTo: '0x1111111111111111111111111111111111111111',
      asset: USDC_SEPOLIA,
      maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
      ...overrides,
    }],
  }
}

const r402 = (overrides?: Record<string, unknown>) =>
  new Response(JSON.stringify(body402(overrides)), { status: 402 })
const r200 = () =>
  new Response(JSON.stringify({ content: 'secret' }), {
    status: 200,
    headers: { 'X-PAYMENT-RESPONSE': btoa(JSON.stringify({ success: true, mode: 'mock' })) },
  })

function fetchScript(...responses: Response[]): typeof fetch {
  let i = 0
  return vi.fn(async () => responses[i++] ?? new Response('exhausted', { status: 500 })) as never
}

describe('createPaidFetch', () => {
  it('passes through non-402 without paying', async () => {
    const f = fetchScript(new Response('free', { status: 200 }))
    const paid = createPaidFetch({ account, budget: createBudget(), fetchImpl: f })
    const res = await paid('/free')
    expect(await res.text()).toBe('free')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('pays and retries on 402 (auto), records spend, emits receipt', async () => {
    const f = fetchScript(r402(), r200())
    const budget = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.1 })
    const onPayment = vi.fn()
    const paid = createPaidFetch({ account, budget, fetchImpl: f, onPayment })
    const res = await paid('/a')
    expect(res.status).toBe(200)
    const secondCall = (f as ReturnType<typeof vi.fn>).mock.calls[1]
    expect((secondCall[1].headers as Record<string, string>)['X-PAYMENT']).toBeTruthy()
    expect(budget.state.spentUsd).toBeCloseTo(0.05)
    expect(onPayment).toHaveBeenCalledOnce()
    const evt = onPayment.mock.calls[0][0]
    expect(evt.receipt.mode).toBe('mock')
    expect(evt.receipt.nonce).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('asks confirm above auto-approve and respects decline (no spend, no retry)', async () => {
    const f = fetchScript(r402())
    const budget = createBudget({ capUsd: 1 })
    const paid = createPaidFetch({ account, budget, confirm: async () => false, fetchImpl: f })
    await expect(paid('/a')).rejects.toMatchObject({ name: 'PaymentDeniedError', reason: 'user_declined' })
    expect(budget.state.spentUsd).toBe(0)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('denies over budget without calling confirm', async () => {
    const confirm = vi.fn(async () => true)
    const paid = createPaidFetch({
      account, budget: createBudget({ capUsd: 0.01 }), confirm, fetchImpl: fetchScript(r402()),
    })
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'budget_exceeded' })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('denies non-allowlisted asset BEFORE confirm/budget (cross-token protection)', async () => {
    const confirm = vi.fn(async () => true)
    const evil = '0x2222222222222222222222222222222222222222'
    const paid = createPaidFetch({
      account, budget: createBudget({ capUsd: 1, autoApproveUnderUsd: 1 }), confirm,
      fetchImpl: fetchScript(r402({ asset: evil, extra: { name: 'EURC', version: '2' } })),
    })
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'asset_not_allowed' })
    expect(confirm).not.toHaveBeenCalled()
    expect(DEFAULT_ALLOWED_ASSETS['base-sepolia']).toContain(USDC_SEPOLIA.toLowerCase())
  })

  it('accepts allowlisted asset case-insensitively and custom allowlists', async () => {
    const f = fetchScript(r402({ asset: USDC_SEPOLIA.toUpperCase().replace('0X', '0x') }), r200())
    const paid = createPaidFetch({
      account, budget: createBudget({ capUsd: 1, autoApproveUnderUsd: 1 }), fetchImpl: f,
    })
    expect((await paid('/a')).status).toBe(200)
  })

  it('serializes concurrent payments: budget checked after prior payment settles', async () => {
    // cap 0.08; two $0.05 payments race. Non-serialized impl: both pass decide → overspend.
    const budget = createBudget({ capUsd: 0.08 })
    let resolveConfirm!: (v: boolean) => void
    const confirm = vi.fn(() => new Promise<boolean>((r) => { resolveConfirm = r }))
    const responses = [r402(), r402(), r200(), r200()]
    // fetch order: first(a)=402, first(b)=402 happen before pay sections; then serialized retries.
    let i = 0
    const f = vi.fn(async () => responses[i++] ?? new Response('x', { status: 500 })) as never
    const paid = createPaidFetch({ account, budget, confirm, fetchImpl: f })
    const pa = paid('/a')
    const pb = paid('/b')
    // let both initial fetches + first pay section start
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    resolveConfirm(true) // approve first payment
    const ra = await pa
    expect(ra.status).toBe(200)
    expect(budget.state.spentUsd).toBeCloseTo(0.05)
    // second payment now enters its pay section: 0.05 + 0.05 > 0.08 → deny, confirm NOT asked again
    await expect(pb).rejects.toMatchObject({ reason: 'budget_exceeded' })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('does not record spend or emit onPayment when the retry response is not ok', async () => {
    const f = fetchScript(r402(), r402())
    const budget = createBudget({ capUsd: 1, autoApproveUnderUsd: 1 })
    const onPayment = vi.fn()
    const paid = createPaidFetch({ account, budget, fetchImpl: f, onPayment })
    const res = await paid('/a')
    expect(res.status).toBe(402)
    expect(budget.state.spentUsd).toBe(0)
    expect(onPayment).not.toHaveBeenCalled()
  })

  it('re-checks budget after confirm resolves in case policy changed during deliberation', async () => {
    const budget = createBudget({ capUsd: 1 })
    const confirm = vi.fn(async () => {
      budget.setCap(0) // floors at spentUsd (0)
      return true
    })
    const f = fetchScript(r402())
    const paid = createPaidFetch({ account, budget, confirm, fetchImpl: f })
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'budget_exceeded' })
    expect(budget.state.spentUsd).toBe(0)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('preserves an existing Headers instance in the retry request', async () => {
    const f = fetchScript(r402(), r200())
    const budget = createBudget({ capUsd: 1, autoApproveUnderUsd: 1 })
    const paid = createPaidFetch({ account, budget, fetchImpl: f })
    await paid('/a', { headers: new Headers({ authorization: 'Bearer t' }) })
    const secondCall = (f as ReturnType<typeof vi.fn>).mock.calls[1]
    const headers = secondCall[1].headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer t')
    expect(headers['X-PAYMENT']).toBeTruthy()
  })

  it('passes through 402 when no accept uses the exact scheme', async () => {
    const f = fetchScript(r402({ scheme: 'other' }))
    const paid = createPaidFetch({ account, budget: createBudget(), fetchImpl: f })
    const res = await paid('/a')
    expect(res.status).toBe(402)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('rejects user_declined when confirm is omitted and the decision requires confirmation', async () => {
    const f = fetchScript(r402())
    const paid = createPaidFetch({ account, budget: createBudget({ capUsd: 1 }), fetchImpl: f })
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'user_declined' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('asset_not_allowed error message names the offending asset', async () => {
    const evil = '0x2222222222222222222222222222222222222222'
    const paid = createPaidFetch({
      account, budget: createBudget({ capUsd: 1, autoApproveUnderUsd: 1 }),
      fetchImpl: fetchScript(r402({ asset: evil, extra: { name: 'EURC', version: '2' } })),
    })
    await expect(paid('/a')).rejects.toThrow(evil)
  })
})
