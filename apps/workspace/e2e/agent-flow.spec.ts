import { expect, test } from '@playwright/test'
import { tool, waitForDatasetTool, waitForTools } from './util'

// Tests below share the dev server's in-memory store (see lib/store.ts) but
// each gets a fresh page/browser context, so client-side state (policy,
// purchasedIds, receipts) always starts at defaults. Test 2 depends on the
// payment record test 1 creates server-side, so this whole file is pinned to
// serial execution (Playwright's default for one file already runs tests in
// declared order in one worker — .serial makes that dependency explicit).
test.describe.serial('agent tool flows', () => {
  // Captured in test 1, asserted in test 2: anchors the replay to the exact
  // server payment record the first purchase created (not just self-consistency).
  let firstPaymentId: string

  test('full research flow + dynamic tool moment', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    const discover = await tool(page, 'discover_paid_resources')
    expect(discover.resources.length).toBeGreaterThanOrEqual(4)
    const premium = discover.resources.filter((r: any) => !r.free)
    expect(premium.length).toBeGreaterThan(0)
    for (const r of premium) {
      expect(typeof r.priceUsd).toBe('number')
      expect(r.priceUsd).toBeGreaterThan(0)
    }

    const preview = await tool(page, 'preview_resource', { resourceId: 'ev-batt-cells-daily' })
    expect(preview.sampleRows.length).toBeGreaterThan(0)

    const policy = await tool(page, 'get_spending_policy')
    expect(policy.policy.perTxCapUsd).toBe(0.05)
    expect(policy.payments).toEqual([])

    const quote = await tool(page, 'get_quote', { resourceId: 'ev-batt-cells-daily' })
    expect(quote.ok).toBe(true)
    expect(quote.quote.policyPreview.allowed).toBe(true)
    expect(quote.quote.policyPreview.needsConfirm).toBe(false)

    const beforeKeys = await page.evaluate(() => Object.keys((window as any).__spendmcpTools))
    expect(beforeKeys).not.toContain('query_premium_dataset')
    await expect(page.getByTestId('tool-count')).toContainText('9 tools live')
    await expect(page.getByTestId('dynamic-tool-state')).toContainText('Locked until verified payment')

    const purchase = await tool(page, 'purchase_access', {
      resourceId: 'ev-batt-cells-daily',
      paymentId: 'pay_e2e_agent_001',
    })
    expect(purchase.ok).toBe(true)
    expect(purchase.receipt.resourceHash).toMatch(/^sha256:/)
    expect(purchase.replayed).toBe(false)
    firstPaymentId = purchase.receipt.paymentId

    await waitForDatasetTool(page)
    await expect(page.getByTestId('tool-count')).toContainText('10 tools live')
    await expect(page.getByTestId('dynamic-tool-state')).toContainText('Registered after settlement')

    const query = await tool(page, 'query_premium_dataset', {
      resourceId: 'ev-batt-cells-daily',
      metric: 'pack_usd_per_kwh',
      from: '2025-01',
      to: '2025-12',
    })
    expect(query.summary.count).toBe(12)
    for (const row of query.rows) {
      expect(row.metric).toBe('pack_usd_per_kwh')
      expect(row.month >= '2025-01' && row.month <= '2025-12').toBe(true)
    }

    await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Unlocked')
    await expect(page.getByTestId('ledger').getByTestId('receipt-row').first()).toBeVisible()
  })

  test('replay does not re-spend budget', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    const before = await tool(page, 'get_spending_policy')
    expect(before.policy.spentUsd).toBe(0)

    // Same clientPaymentId as test 1 above — the server resolves this as a
    // replay of the already-settled payment, purely via the client id, not
    // via anything cached on this (fresh) page.
    const purchase = await tool(page, 'purchase_access', {
      resourceId: 'ev-batt-cells-daily',
      paymentId: 'pay_e2e_agent_001',
    })
    expect(purchase.ok).toBe(true)
    expect(purchase.replayed).toBe(true)
    expect(purchase.receipt.paymentId).toBe(firstPaymentId)

    // Refetch by the same client id (the receipt route resolves client ids
    // too) and confirm it's the SAME server payment record as test 1's.
    const receipt = await tool(page, 'get_payment_receipt', { paymentId: 'pay_e2e_agent_001' })
    expect(receipt.receipt.paymentId).toBe(purchase.receipt.paymentId)
    expect(receipt.receipt.clientPaymentId).toBe('pay_e2e_agent_001')

    const after = await tool(page, 'get_spending_policy')
    expect(after.policy.spentUsd).toBe(0)
  })

  test('per-tx refusal, policy raise via sheet, then confirmed purchase', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    const quote = await tool(page, 'get_quote', { resourceId: 'ev-batt-forecasts' })
    expect(quote.ok).toBe(true)
    expect(quote.quote.policyPreview).toEqual({ allowed: false, reason: 'per_tx_cap_exceeded' })

    const denied = await tool(page, 'purchase_access', { resourceId: 'ev-batt-forecasts' })
    expect(denied.ok).toBe(false)
    expect(denied.denied).toBe('per_tx_cap_exceeded')

    // Raise perTxCapUsd — this is a raise, so it needs the human's sign-off
    // via the approval sheet before it takes effect.
    const raisePromise = tool(page, 'set_spending_policy', { perTxCapUsd: 0.15 })
    await expect(page.getByTestId('approve-payment')).toBeVisible()
    await page.getByTestId('approve-payment').click()
    const raiseResult = await raisePromise
    expect(raiseResult.ok).toBe(true)
    expect(raiseResult.policy.perTxCapUsd).toBe(0.15)

    // Now within cap (0.12 <= 0.15) but still above auto-approve (0.05), so
    // purchase_access needs a payment approval this time.
    const purchasePromise = tool(page, 'purchase_access', {
      resourceId: 'ev-batt-forecasts',
      paymentId: 'pay_e2e_agent_003',
    })
    await expect(page.getByTestId('approve-payment')).toBeVisible()
    await page.getByTestId('approve-payment').click()
    const purchaseResult = await purchasePromise
    expect(purchaseResult.ok).toBe(true)

    await waitForDatasetTool(page)
  })

  test('deny path leaves spend untouched', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    // Pure lowering edit — applies immediately, no approval sheet.
    const setResult = await tool(page, 'set_spending_policy', { autoApproveUnderUsd: 0 })
    expect(setResult.ok).toBe(true)
    expect(setResult.policy.autoApproveUnderUsd).toBe(0)

    const purchasePromise = tool(page, 'purchase_access', {
      resourceId: 'ev-batt-cells-daily',
      paymentId: 'pay_e2e_agent_004',
    })
    await expect(page.getByTestId('deny-payment')).toBeVisible()
    await page.getByTestId('deny-payment').click()
    const result = await purchasePromise
    expect(result.ok).toBe(false)
    expect(result.denied).toBe('user_declined')

    const policy = await tool(page, 'get_spending_policy')
    expect(policy.policy.spentUsd).toBe(0)
  })

  test('report_delivery_issue and receipt roundtrip', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    // materials ($0.06) is above both the default per-tx cap (0.05) and
    // auto-approve threshold (0.05) — raise the cap first (sheet), then
    // confirm the purchase itself (a second, separate sheet).
    const raisePromise = tool(page, 'set_spending_policy', { perTxCapUsd: 0.1 })
    await expect(page.getByTestId('approve-payment')).toBeVisible()
    await page.getByTestId('approve-payment').click()
    const raiseResult = await raisePromise
    expect(raiseResult.ok).toBe(true)

    const purchasePromise = tool(page, 'purchase_access', {
      resourceId: 'ev-batt-materials',
      paymentId: 'pay_e2e_agent_005',
    })
    await expect(page.getByTestId('approve-payment')).toBeVisible()
    await page.getByTestId('approve-payment').click()
    const purchaseResult = await purchasePromise
    expect(purchaseResult.ok).toBe(true)

    const receiptResult = await tool(page, 'get_payment_receipt', { paymentId: 'pay_e2e_agent_005' })
    expect(receiptResult.receipt.status).toBe('delivered')
    const serverPaymentId = receiptResult.receipt.paymentId

    // report_delivery_issue's API route (unlike get_payment_receipt's) has
    // no client-id fallback — it requires the SERVER-issued paymentId.
    const firstReport = await tool(page, 'report_delivery_issue', {
      paymentId: serverPaymentId,
      reason: 'rows empty for my range',
    })
    expect(firstReport.status).toBe(200)
    expect(firstReport.body.ok).toBe(true)
    expect(firstReport.body.claim).toBeTruthy()

    const secondReport = await tool(page, 'report_delivery_issue', {
      paymentId: serverPaymentId,
      reason: 'still empty',
    })
    expect(secondReport.status).toBe(409)
    expect(secondReport.body.error).toBe('already_filed')
  })

  test('invalid tool arguments return structured errors, never throw', async ({ page }) => {
    await page.goto('/')
    await waitForTools(page)

    const purchase = await tool(page, 'purchase_access', {})
    expect(purchase.ok).toBe(false)
    expect(purchase.denied).toBe('invalid_resource_id')

    const receipt = await tool(page, 'get_payment_receipt', { paymentId: 'nope' })
    expect(receipt.ok).toBe(false)
    expect(receipt.error).toBe('invalid_payment_id')
  })
})
