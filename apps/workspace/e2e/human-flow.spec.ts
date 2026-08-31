import { expect, test } from '@playwright/test'
import { tool, waitForDatasetTool, waitForTools } from './util'

test('badges and sample prompt', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('mode-badge')).toContainText('Instant Demo Mode')
  await expect(page.getByTestId('webmcp-badge')).toContainText('Manual browser mode')
  await expect(page.getByTestId('sample-prompt')).toBeVisible()
  await expect(page.getByTestId('sample-prompt')).toContainText('Compare EV battery pack price trends')
  await expect(page.getByTestId('external-validation-link')).toHaveAttribute(
    'href',
    'https://github.com/krisnafirdaus/webmcp-x402/issues/new?template=external-validation.yml',
  )
})

test('judge-width layout leads with the recommended source and policy', async ({ page }) => {
  await page.setViewportSize({ width: 884, height: 773 })
  await page.goto('/')

  await expect(page.getByTestId('recommended-source')).toContainText('Recommended for this brief')
  const provenance = page.getByTestId('provenance-ev-batt-cells-daily')
  await expect(provenance).toContainText('Coverage')
  await expect(provenance).toContainText('global weighted')
  await expect(provenance).toContainText('Freshness')
  await expect(provenance).toContainText('through 2026-07')
  await expect(page.getByTestId('capability-surface')).toContainText('Discover')
  await expect(page.getByTestId('capability-surface')).toContainText('Guard & pay')
  await expect(page.getByTestId('capability-surface')).toContainText('Unlock')

  const recommendedBox = await page.getByTestId('recommended-source').boundingBox()
  const policyBox = await page.getByTestId('policy-panel').boundingBox()
  const otherSourcesBox = await page.getByTestId('other-sources').boundingBox()
  const ledgerBox = await page.getByTestId('ledger').boundingBox()
  const secondarySourceBox = await page.getByTestId('source-card-ev-batt-materials').boundingBox()
  expect(recommendedBox).not.toBeNull()
  expect(policyBox).not.toBeNull()
  expect(otherSourcesBox).not.toBeNull()
  expect(ledgerBox).not.toBeNull()
  expect(secondarySourceBox).not.toBeNull()
  expect(Math.abs(policyBox!.y - recommendedBox!.y)).toBeLessThan(8)
  expect(policyBox!.x).toBeGreaterThan(recommendedBox!.x)
  expect(Math.abs(ledgerBox!.y - otherSourcesBox!.y)).toBeLessThan(8)
  expect(policyBox!.y).toBeLessThan(secondarySourceBox!.y)

  const policyInputBoxes = await Promise.all(
    ['per-tx-input', 'session-cap-input', 'auto-approve-input'].map((testId) =>
      page.getByTestId(testId).boundingBox(),
    ),
  )
  expect(policyInputBoxes.every(Boolean)).toBe(true)
  const policyInputTopEdges = policyInputBoxes.map((box) => box!.y)
  expect(Math.max(...policyInputTopEdges) - Math.min(...policyInputTopEdges)).toBeLessThan(2)

  await page.getByTestId('buy-ev-batt-cells-daily').click()
  const form = page.getByTestId('query-form-ev-batt-cells-daily')
  await expect(form).toBeVisible({ timeout: 10_000 })
  const runBox = await form.getByRole('button', { name: 'Run' }).boundingBox()
  const reportBox = await form.getByRole('button', { name: 'Report issue' }).boundingBox()
  expect(runBox?.height).toBeGreaterThanOrEqual(40)
  expect(reportBox?.height).toBeGreaterThanOrEqual(40)
})

test('human buy under the auto-approve threshold', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('source-card-ev-batt-cells-daily')).toBeVisible()
  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Locked')
  await expect(page.getByTestId('dynamic-tool-state')).toContainText('Locked until verified payment')

  await page.getByTestId('buy-ev-batt-cells-daily').click()

  // $0.04 <= the default $0.05 auto-approve threshold: no approval sheet.
  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Unlocked', { timeout: 10_000 })
  await expect(page.getByTestId('approve-payment')).toHaveCount(0)
  // Capability follows verified payment, not whether an agent or human
  // initiated it, so a manual Buy must register the dynamic tool too.
  await waitForDatasetTool(page)
  await expect(page.getByTestId('tool-count')).toContainText('10 tools live')
  await expect(page.getByTestId('dynamic-tool-state')).toContainText('Registered after settlement')

  const receipt = page.getByTestId('ledger').getByTestId('receipt-row').first()
  await expect(receipt).toBeVisible()
  const lifecycle = receipt.getByTestId('receipt-lifecycle')
  await expect(lifecycle).toContainText('Paid')
  await expect(lifecycle).toContainText('Unlocked')
  await expect(lifecycle).toContainText('Tool active')
  await expect(receipt).toContainText('Demo receipt')

  const form = page.getByTestId('query-form-ev-batt-cells-daily')
  await expect(form).toBeVisible()
  await form.getByLabel('From').fill('2025-01')
  await form.getByLabel('To').fill('2025-12')
  await form.getByRole('button', { name: 'Run' }).click()
  await expect(form.locator('tbody tr')).toHaveCount(12)
})

test('human buy needing approval — deny then approve', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('per-tx-input').fill('0.15')

  await page.getByTestId('buy-ev-batt-forecasts').click()
  await expect(page.getByTestId('deny-payment')).toBeVisible()
  await page.getByTestId('deny-payment').click()
  await expect(page.getByTestId('source-card-ev-batt-forecasts')).toContainText('You declined')

  await page.getByTestId('buy-ev-batt-forecasts').click()
  await expect(page.getByTestId('approve-payment')).toBeVisible()
  await page.getByTestId('approve-payment').click()
  await expect(page.getByTestId('state-ev-batt-forecasts')).toContainText('Unlocked', { timeout: 10_000 })
})

test('report delivery issue via the UI prompt', async ({ page }) => {
  await page.goto('/')
  await waitForTools(page) // only needed for the bridge assertion below

  await page.getByTestId('buy-ev-batt-cells-daily').click()
  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Unlocked', { timeout: 10_000 })

  page.once('dialog', (d) => d.accept('bad rows'))
  await page.getByTestId('report-ev-batt-cells-daily').click()

  await expect(page.getByTestId('source-card-ev-batt-cells-daily')).toContainText('Claim filed.', { timeout: 10_000 })

  // Bridge assertion: confirm the claim actually landed server-side, via the
  // test-mode tool bag (available since NEXT_PUBLIC_TEST=1 regardless of
  // which path — UI or agent — made the purchase).
  const policy = await tool(page, 'get_spending_policy')
  const entry = policy.payments.find((p: any) => p.resourceId === 'ev-batt-cells-daily')
  expect(entry?.paymentId).toBeTruthy()
  const receiptResult = await tool(page, 'get_payment_receipt', { paymentId: entry.paymentId })
  expect(receiptResult.receipt.claim).not.toBeNull()
  expect(receiptResult.receipt.claim.reason).toBe('bad rows')
})

test('state survives refresh', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('buy-ev-batt-cells-daily').click()
  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Unlocked', { timeout: 10_000 })
  await expect(page.getByTestId('ledger').getByTestId('receipt-row').first()).toBeVisible()

  await page.reload()

  // Purchase state, ledger, and the dynamic tool must all come back from the
  // localStorage snapshot — the server still has the payment (same process
  // across reload), so this isn't just "the UI remembers", the data is
  // actually queryable again.
  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Unlocked', { timeout: 10_000 })
  await expect(page.getByTestId('ledger').getByTestId('receipt-row').first()).toBeVisible()

  await waitForDatasetTool(page)
  const result = await tool(page, 'query_premium_dataset', { resourceId: 'ev-batt-cells-daily' })
  expect(Array.isArray(result.rows)).toBe(true)
  expect(result.rows.length).toBeGreaterThan(0)
})

test('stale browser grant is cleared before the dynamic tool registers', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'spendmcp.session.v1',
      JSON.stringify({
        purchasedIds: ['ev-batt-cells-daily'],
        serverPaymentIds: [['ev-batt-cells-daily', 'pay_stale00000000']],
        receipts: [
          {
            amountUsd: 0.04,
            resource: 'ev-batt-cells-daily',
            nonce: '0xstale',
            network: 'base-sepolia',
            mode: 'mock',
            at: '2026-08-29T00:00:00.000Z',
          },
        ],
        policy: {
          perTxCapUsd: 0.05,
          sessionCapUsd: 0.2,
          spentUsd: 0.04,
          autoApproveUnderUsd: 0.05,
        },
      }),
    )
  })

  await page.goto('/')
  await waitForTools(page)

  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Locked')
  await expect(page.getByTestId('tool-count')).toContainText('9 tools live')
  await expect(page.getByTestId('ledger')).toContainText('0 verified payments this session')
  const datasetToolPresent = await page.evaluate(
    () => typeof (window as any).__spendmcpTools?.query_premium_dataset === 'function',
  )
  expect(datasetToolPresent).toBe(false)

  // The stale snapshot's policy object was replaced above. A subsequent
  // payment must charge the new live budget, not the discarded old one.
  const purchase = await tool(page, 'purchase_access', { resourceId: 'ev-batt-cells-daily' })
  expect(purchase.ok).toBe(true)
  const policy = await tool(page, 'get_spending_policy')
  expect(policy.policy.spentUsd).toBeCloseTo(0.04)
  await expect(page.getByText('$0.04 spent')).toBeVisible()
})

test('start over removes the purchased capability from the new session', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('buy-ev-batt-cells-daily').click()
  await waitForDatasetTool(page)
  await expect(page.getByTestId('tool-count')).toContainText('10 tools live')

  await page.getByRole('button', { name: 'Start over' }).click()

  await expect(page.getByTestId('state-ev-batt-cells-daily')).toContainText('Locked', { timeout: 10_000 })
  await expect(page.getByTestId('tool-count')).toContainText('9 tools live')
  await waitForTools(page)
  const datasetToolPresent = await page.evaluate(
    () => typeof (window as any).__spendmcpTools?.query_premium_dataset === 'function',
  )
  expect(datasetToolPresent).toBe(false)
})

test('preview modal shows sample rows and closes on Esc', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('preview-ev-batt-materials').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('table')).toBeVisible()
  await expect(page.locator('table tbody tr')).toHaveCount(3)
  const closeBox = await dialog.getByRole('button', { name: 'Close' }).boundingBox()
  expect(closeBox?.width).toBeGreaterThanOrEqual(40)
  expect(closeBox?.height).toBeGreaterThanOrEqual(40)

  await page.keyboard.press('Escape')
  await expect(page.locator('table')).toHaveCount(0)
})
