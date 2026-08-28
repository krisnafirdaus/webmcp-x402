import type { Page } from '@playwright/test'

/**
 * Drives a WebMCP tool through the test-mode bag (window.__spendmcpTools,
 * only present under NEXT_PUBLIC_TEST=1) and parses its JSON text response.
 */
export async function tool(page: Page, name: string, args: Record<string, unknown> = {}): Promise<any> {
  return page.evaluate(
    async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const bag = (window as any).__spendmcpTools as
        | Record<string, (a: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>>
        | undefined
      if (!bag?.[name]) throw new Error(`tool not in bag: ${name}`)
      const out = await bag[name](args)
      return JSON.parse(out.content[0].text)
    },
    { name, args },
  )
}

/** Static tools are all registered together at page load — one key proves the rest. */
export const waitForTools = (page: Page) =>
  page.waitForFunction(() => !!(window as any).__spendmcpTools?.discover_paid_resources)

/** query_premium_dataset only appears after a successful purchase_access call. */
export const waitForDatasetTool = (page: Page) =>
  page.waitForFunction(() => !!(window as any).__spendmcpTools?.query_premium_dataset)
