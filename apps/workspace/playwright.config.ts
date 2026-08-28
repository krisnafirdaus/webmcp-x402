import { defineConfig } from '@playwright/test'

const requestedPort = process.env.E2E_PORT ?? '3100'
if (!/^\d{2,5}$/.test(requestedPort) || Number(requestedPort) > 65_535) {
  throw new Error(`E2E_PORT must be a valid TCP port, received: ${requestedPort}`)
}
const baseURL = `http://localhost:${requestedPort}`
const requestedChannel = process.env.E2E_CHANNEL
if (requestedChannel && requestedChannel !== 'chrome') {
  throw new Error(`E2E_CHANNEL must be "chrome" when set, received: ${requestedChannel}`)
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    ...(requestedChannel ? { channel: requestedChannel } : {}),
  },
  webServer: {
    // NOTE: `pnpm dev -- -p 3100` (with the extra `--`) does NOT work on this
    // Next 16 setup — pnpm forwards the literal `--` through to the Next CLI,
    // which then treats it as a positional project-directory argument and
    // fails with "Invalid project directory provided, no such directory:
    // .../apps/workspace/-p". `pnpm dev -p 3100` (no extra `--`) forwards the
    // flag correctly since pnpm already appends trailing args to the script.
    command: `NEXT_PUBLIC_TEST=1 pnpm dev -p ${requestedPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
