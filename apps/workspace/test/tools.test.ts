import { describe, expect, it, vi } from 'vitest'
import { createToolRegistrar, type ModelContext, type ModelContextTool } from 'webmcp-x402'
import { makeDatasetTool, makeStaticTools, registerStaticTools, type ToolDeps } from '../lib/tools'

const STATIC_TOOL_NAMES = [
  'discover_paid_resources',
  'get_payment_receipt',
  'get_quote',
  'get_spending_policy',
  'list_unlocked_resources',
  'preview_resource',
  'purchase_access',
  'report_delivery_issue',
  'set_spending_policy',
].sort()

const READ_ONLY_NAMES = [
  'discover_paid_resources',
  'preview_resource',
  'get_quote',
  'get_spending_policy',
  'list_unlocked_resources',
  'get_payment_receipt',
]

function fakeRegistrar() {
  const tools = new Map<string, ModelContextTool>()
  const mc: ModelContext = { registerTool: (t) => void tools.set(t.name, t) }
  return { registrar: createToolRegistrar(mc), tools }
}

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    getQuote: vi.fn(async (resourceId: string) => ({
      ok: true,
      quote: {
        quoteId: 'q_abc123',
        resourceId,
        priceUsd: 0.04,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        purchaseUrl: '/api/purchase/q_abc123',
        policyPreview: { allowed: true, needsConfirm: false },
      },
    })),
    purchase: vi.fn(async () => ({
      ok: true,
      receipt: { paymentId: 'pay_serverabcdefgh' },
      rowCount: 3,
      metrics: ['m'],
      replayed: false,
    })),
    reportIssue: vi.fn(async () => ({ status: 200, body: { ok: true, claim: {} } })),
    requestPolicyRaise: vi.fn(async () => true),
    humanApprovedSet: vi.fn(),
    policyState: vi.fn(() => ({
      perTxCapUsd: 0.05,
      sessionCapUsd: 0.2,
      autoApproveUnderUsd: 0.05,
      spentUsd: 0,
    })),
    agentSetPolicy: vi.fn(),
    receipts: vi.fn(() => []),
    purchasedIds: vi.fn(() => []),
    walletAddress: vi.fn(() => '0xabc'),
    serverPaymentIdFor: vi.fn(() => null),
    mode: 'mock',
    onFirstPurchase: vi.fn(),
    ...overrides,
  }
}

function parse(result: { content: Array<{ type: 'text'; text: string }> }) {
  return JSON.parse(result.content[0].text)
}

function toolNamed(tools: ModelContextTool[], name: string): ModelContextTool {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error(`tool not found: ${name}`)
  return t
}

describe('registerStaticTools', () => {
  it('registers exactly the 9 static tool names', () => {
    const { registrar, tools } = fakeRegistrar()
    registerStaticTools(registrar, makeDeps())
    expect([...tools.keys()].sort()).toEqual(STATIC_TOOL_NAMES)
  })
})

describe('static tool schemas', () => {
  it('every static tool sets additionalProperties: false', () => {
    for (const tool of makeStaticTools(makeDeps())) {
      expect(tool.inputSchema).toMatchObject({ additionalProperties: false })
    }
  })

  it('read-only tools carry readOnlyHint; preview + dataset tool carry untrustedContentHint', () => {
    const tools = makeStaticTools(makeDeps())
    for (const name of READ_ONLY_NAMES) {
      expect(toolNamed(tools, name).annotations?.readOnlyHint).toBe(true)
    }
    expect(toolNamed(tools, 'preview_resource').annotations?.untrustedContentHint).toBe(true)
    expect(makeDatasetTool(makeDeps()).annotations?.untrustedContentHint).toBe(true)

    for (const name of ['purchase_access', 'set_spending_policy', 'report_delivery_issue']) {
      expect(toolNamed(tools, name).annotations?.readOnlyHint).not.toBe(true)
    }
  })
})

describe('discover_paid_resources', () => {
  it('filters by case-insensitive substring over title/provider/coverage and forwards the abort signal', async () => {
    const resources = [
      { id: 'a', title: 'Battery Index', provider: 'CellIndex', coverage: 'monthly' },
      { id: 'b', title: 'Weather Data', provider: 'ClimateCo', coverage: 'daily' },
      { id: 'c', title: 'Traffic Feed', provider: 'RoadWatch', coverage: 'battery corridor' },
    ]
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ resources }), { status: 200 }),
    )
    const deps = makeDeps({ fetchImpl })
    const tool = toolNamed(makeStaticTools(deps), 'discover_paid_resources')

    const controller = new AbortController()
    const result = parse(await tool.execute({ query: 'battery' }, { signal: controller.signal }))

    expect(result.resources.map((r: { id: string }) => r.id).sort()).toEqual(['a', 'c'])
    expect(result.hint).toEqual(expect.any(String))
    expect(fetchImpl.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('returns all resources when no query is given', async () => {
    const resources = [{ id: 'a', title: 'A', provider: 'P', coverage: 'C' }]
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ resources }), { status: 200 }))
    const tool = toolNamed(makeStaticTools(makeDeps({ fetchImpl })), 'discover_paid_resources')
    const result = parse(await tool.execute({}))
    expect(result.resources).toHaveLength(1)
  })
})

describe('purchase_access', () => {
  it('uses the same stable clientPaymentId across retries for one resource; different resources get different ids', async () => {
    const purchase = vi.fn(async (_resourceId: string, _clientPaymentId?: string, _quoteId?: string) => ({
      ok: true,
      receipt: { paymentId: 'pay_server1' },
      rowCount: 1,
      metrics: [],
      replayed: false,
    }))
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    await tool.execute({ resourceId: 'res-a' })
    await tool.execute({ resourceId: 'res-a' })
    expect(purchase).toHaveBeenCalledTimes(2)
    const [, id1] = purchase.mock.calls[0]
    const [, id2] = purchase.mock.calls[1]
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^pay_[a-f0-9]+$/)

    await tool.execute({ resourceId: 'res-b' })
    const [, id3] = purchase.mock.calls[2]
    expect(id3).not.toBe(id1)
  })

  it('uses an explicit valid paymentId verbatim and stores it for later retries', async () => {
    const purchase = vi.fn(async (_resourceId: string, _clientPaymentId?: string, _quoteId?: string) => ({
      ok: true,
      receipt: { paymentId: 'pay_server1' },
      rowCount: 1,
      metrics: [],
      replayed: false,
    }))
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    await tool.execute({ resourceId: 'res-a', paymentId: 'pay_explicit12345' })
    expect(purchase.mock.calls[0][1]).toBe('pay_explicit12345')

    // A later retry with no explicit id reuses the stored one.
    await tool.execute({ resourceId: 'res-a' })
    expect(purchase.mock.calls[1][1]).toBe('pay_explicit12345')
  })

  it('rejects an invalid explicit paymentId without calling purchase', async () => {
    const purchase = vi.fn()
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    const result = parse(await tool.execute({ resourceId: 'res-a', paymentId: 'pay_x' }))
    expect(result).toEqual({ ok: false, denied: 'invalid_payment_id' })
    expect(purchase).not.toHaveBeenCalled()
  })

  it('rejects a malformed resourceId or quoteId without calling purchase', async () => {
    const purchase = vi.fn()
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    expect(parse(await tool.execute({ resourceId: 'BAD ID' }))).toEqual({
      ok: false,
      denied: 'invalid_resource_id',
    })
    expect(parse(await tool.execute({ resourceId: 'res-a', quoteId: 'not-a-quote' }))).toEqual({
      ok: false,
      denied: 'invalid_quote_id',
    })
    expect(purchase).not.toHaveBeenCalled()
  })

  it('calls onFirstPurchase on success, and not on failure', async () => {
    const onFirstPurchase = vi.fn()
    const okDeps = makeDeps({
      onFirstPurchase,
      purchase: vi.fn(async () => ({
        ok: true,
        receipt: { paymentId: 'pay_s' },
        rowCount: 1,
        metrics: [],
        replayed: false,
      })),
    })
    await toolNamed(makeStaticTools(okDeps), 'purchase_access').execute({ resourceId: 'res-a' })
    expect(onFirstPurchase).toHaveBeenCalledTimes(1)

    const onFirstPurchaseFail = vi.fn()
    const failDeps = makeDeps({
      onFirstPurchase: onFirstPurchaseFail,
      purchase: vi.fn(async () => ({ ok: false, denied: 'server_refused' })),
    })
    const result = parse(
      await toolNamed(makeStaticTools(failDeps), 'purchase_access').execute({ resourceId: 'res-a' }),
    )
    expect(onFirstPurchaseFail).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, denied: 'server_refused' })
  })
})

describe('purchase_access uncertain-outcome handling', () => {
  it('returns settlement_pending with the same stable id when purchase throws and the signal is aborted; never mints a new id on retry', async () => {
    const purchase = vi.fn(async () => {
      throw new Error('network blip')
    })
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')
    const controller = new AbortController()
    controller.abort()

    const result1 = parse(await tool.execute({ resourceId: 'res-a' }, { signal: controller.signal }))
    expect(result1.status).toBe('settlement_pending')
    expect(result1.paymentId).toMatch(/^pay_[a-f0-9]+$/)
    expect(result1.hint).toEqual(expect.any(String))

    const result2 = parse(await tool.execute({ resourceId: 'res-a' }, { signal: controller.signal }))
    expect(result2.paymentId).toBe(result1.paymentId)
  })

  it('returns a generic unexpected_error envelope when purchase throws without an aborted signal', async () => {
    const purchase = vi.fn(async () => {
      throw new Error('boom')
    })
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    const result = parse(await tool.execute({ resourceId: 'res-a' }))
    expect(result).toEqual({ ok: false, denied: 'unexpected_error', detail: expect.any(String) })
  })

  it('augments a resolved unexpected_error denial with paymentId + a retry hint', async () => {
    const purchase = vi.fn(async () => ({ ok: false, denied: 'unexpected_error', detail: 'db hiccup' }))
    const deps = makeDeps({ purchase })
    const tool = toolNamed(makeStaticTools(deps), 'purchase_access')

    const result = parse(await tool.execute({ resourceId: 'res-a' }))
    expect(result.ok).toBe(false)
    expect(result.denied).toBe('unexpected_error')
    expect(result.detail).toBe('db hiccup')
    expect(result.paymentId).toMatch(/^pay_[a-f0-9]+$/)
    expect(result.hint).toEqual(expect.any(String))
  })
})

describe('get_spending_policy', () => {
  it('includes a payments list mapping purchased resourceIds to their server paymentId', async () => {
    const deps = makeDeps({
      purchasedIds: () => ['res-a', 'res-b'],
      serverPaymentIdFor: (id: string) => (id === 'res-a' ? 'pay_serverabcdefgh' : null),
    })
    const tool = toolNamed(makeStaticTools(deps), 'get_spending_policy')

    const result = parse(await tool.execute({}))
    expect(result.payments).toEqual([
      { resourceId: 'res-a', paymentId: 'pay_serverabcdefgh' },
      { resourceId: 'res-b', paymentId: null },
    ])
  })
})

describe('set_spending_policy', () => {
  it('pure lowering calls agentSetPolicy, not requestPolicyRaise', async () => {
    const agentSetPolicy = vi.fn()
    const requestPolicyRaise = vi.fn(async () => true)
    const deps = makeDeps({ agentSetPolicy, requestPolicyRaise })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    const result = parse(await tool.execute({ perTxCapUsd: 0.02 }))
    expect(agentSetPolicy).toHaveBeenCalledWith({ perTxCapUsd: 0.02 })
    expect(requestPolicyRaise).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('raising asks requestPolicyRaise, then calls humanApprovedSet on approval', async () => {
    const humanApprovedSet = vi.fn()
    const requestPolicyRaise = vi.fn(async () => true)
    const agentSetPolicy = vi.fn()
    const deps = makeDeps({ humanApprovedSet, requestPolicyRaise, agentSetPolicy })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    const result = parse(await tool.execute({ perTxCapUsd: 0.5 }))
    expect(requestPolicyRaise).toHaveBeenCalledTimes(1)
    expect(humanApprovedSet).toHaveBeenCalledWith({ perTxCapUsd: 0.5 })
    expect(agentSetPolicy).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('returns denied without applying anything when the human declines or is busy', async () => {
    const humanApprovedSet = vi.fn()
    const deps = makeDeps({ humanApprovedSet, requestPolicyRaise: vi.fn(async () => false) })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    const result = parse(await tool.execute({ sessionCapUsd: 5 }))
    expect(result).toEqual({
      ok: false,
      denied: 'human_declined_or_busy',
      hint: expect.any(String),
    })
    expect(humanApprovedSet).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range value without calling agentSetPolicy or requestPolicyRaise', async () => {
    const agentSetPolicy = vi.fn()
    const requestPolicyRaise = vi.fn()
    const deps = makeDeps({ agentSetPolicy, requestPolicyRaise })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    const result = parse(await tool.execute({ perTxCapUsd: 999 }))
    expect(result).toEqual({ ok: false, error: 'invalid_policy_value' })
    expect(agentSetPolicy).not.toHaveBeenCalled()
    expect(requestPolicyRaise).not.toHaveBeenCalled()
  })

  it('mixed patch: applies the lowering field immediately even when the raise is declined', async () => {
    const agentSetPolicy = vi.fn()
    const humanApprovedSet = vi.fn()
    const requestPolicyRaise = vi.fn(async () => false)
    const deps = makeDeps({ agentSetPolicy, humanApprovedSet, requestPolicyRaise })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    // sessionCapUsd 0.2 -> 0.1 is a lower; perTxCapUsd 0.05 -> 0.5 is a raise.
    const result = parse(await tool.execute({ sessionCapUsd: 0.1, perTxCapUsd: 0.5 }))

    expect(agentSetPolicy).toHaveBeenCalledWith({ sessionCapUsd: 0.1 })
    expect(requestPolicyRaise).toHaveBeenCalledTimes(1)
    expect(humanApprovedSet).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      denied: 'human_declined_or_busy',
      applied: { sessionCapUsd: 0.1 },
      hint: expect.any(String),
    })
  })

  it('mixed patch: on approval, humanApprovedSet receives only the raise fields', async () => {
    const agentSetPolicy = vi.fn()
    const humanApprovedSet = vi.fn()
    const requestPolicyRaise = vi.fn(async () => true)
    const deps = makeDeps({ agentSetPolicy, humanApprovedSet, requestPolicyRaise })
    const tool = toolNamed(makeStaticTools(deps), 'set_spending_policy')

    const result = parse(await tool.execute({ sessionCapUsd: 0.1, perTxCapUsd: 0.5 }))

    expect(agentSetPolicy).toHaveBeenCalledWith({ sessionCapUsd: 0.1 })
    expect(humanApprovedSet).toHaveBeenCalledWith({ perTxCapUsd: 0.5 })
    expect(result.ok).toBe(true)
  })
})

describe('query_premium_dataset (dynamic tool)', () => {
  it('refuses when the resource has not been purchased, without fetching', async () => {
    const fetchImpl = vi.fn()
    const deps = makeDeps({ purchasedIds: () => [], fetchImpl })
    const tool = makeDatasetTool(deps)

    const result = parse(await tool.execute({ resourceId: 'res-a' }))
    expect(result).toEqual({ ok: false, denied: 'not_purchased', hint: expect.any(String) })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns receipt_missing (not not_purchased) when purchased but the server paymentId was lost, without fetching', async () => {
    const fetchImpl = vi.fn()
    const deps = makeDeps({ purchasedIds: () => ['res-a'], serverPaymentIdFor: () => null, fetchImpl })
    const tool = makeDatasetTool(deps)

    const result = parse(await tool.execute({ resourceId: 'res-a' }))
    expect(result).toEqual({ ok: false, denied: 'receipt_missing', hint: expect.any(String) })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fetches the data route with paymentId + query params and forwards the abort signal when purchased', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ rows: [], summary: null }), { status: 200 }),
    )
    const deps = makeDeps({
      purchasedIds: () => ['res-a'],
      serverPaymentIdFor: () => 'pay_server123456',
      fetchImpl,
    })
    const tool = makeDatasetTool(deps)
    const controller = new AbortController()

    await tool.execute(
      { resourceId: 'res-a', metric: 'pack_usd_per_kwh', from: '2025-01', to: '2025-12' },
      { signal: controller.signal },
    )

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe(
      '/api/resource/res-a/data?paymentId=pay_server123456&metric=pack_usd_per_kwh&from=2025-01&to=2025-12',
    )
    expect(init?.signal).toBe(controller.signal)
  })
})

describe('get_payment_receipt', () => {
  it('rejects an invalid paymentId pattern without fetching', async () => {
    const fetchImpl = vi.fn()
    const deps = makeDeps({ fetchImpl })
    const tool = toolNamed(makeStaticTools(deps), 'get_payment_receipt')

    const result = parse(await tool.execute({ paymentId: 'bad' }))
    expect(result).toEqual({ ok: false, error: 'invalid_payment_id' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('translates a 404 into a structured unknown_payment result', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    const deps = makeDeps({ fetchImpl })
    const tool = toolNamed(makeStaticTools(deps), 'get_payment_receipt')

    const result = parse(await tool.execute({ paymentId: 'pay_abcdefgh12345678' }))
    expect(result).toEqual({ ok: false, error: 'unknown_payment' })
  })
})

describe('report_delivery_issue', () => {
  it('passes through deps.reportIssue on valid args', async () => {
    const reportIssue = vi.fn(async () => ({ status: 200, body: { ok: true, claim: { reason: 'x' } } }))
    const deps = makeDeps({ reportIssue })
    const tool = toolNamed(makeStaticTools(deps), 'report_delivery_issue')

    const result = parse(await tool.execute({ paymentId: 'pay_abcdefgh12345678', reason: 'stale data' }))
    expect(reportIssue).toHaveBeenCalledWith('pay_abcdefgh12345678', 'stale data')
    expect(result).toEqual({ status: 200, body: { ok: true, claim: { reason: 'x' } } })
  })

  it('rejects invalid paymentId/reason without calling deps.reportIssue', async () => {
    const reportIssue = vi.fn()
    const deps = makeDeps({ reportIssue })
    const tool = toolNamed(makeStaticTools(deps), 'report_delivery_issue')

    expect(parse(await tool.execute({ paymentId: 'bad', reason: 'x' }))).toEqual({
      ok: false,
      error: 'invalid_payment_id',
    })
    expect(parse(await tool.execute({ paymentId: 'pay_abcdefgh12345678' }))).toEqual({
      ok: false,
      error: 'invalid_reason',
    })
    expect(reportIssue).not.toHaveBeenCalled()
  })
})

describe('args validation resilience', () => {
  it('every static tool + the dataset tool tolerates {} and junk-typed args without throwing', async () => {
    const deps = makeDeps({ fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })) })
    const tools = [...makeStaticTools(deps), makeDatasetTool(deps)]
    const junkArgsList: unknown[] = [
      {},
      { resourceId: 123 },
      { resourceId: null },
      { resourceId: 'BAD ID WITH SPACES' },
      { paymentId: 42 },
      { paymentId: {} },
      { query: 999 },
      { perTxCapUsd: 'nope' },
      { quoteId: 12345 },
      null,
      undefined,
    ]
    for (const tool of tools) {
      for (const junk of junkArgsList) {
        await expect(tool.execute(junk as never)).resolves.toMatchObject({
          content: [{ type: 'text' }],
        })
      }
    }
  })
})
