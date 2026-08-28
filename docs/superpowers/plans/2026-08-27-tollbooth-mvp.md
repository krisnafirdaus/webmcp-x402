# Tollbooth MVP Implementation Plan

> **SUPERSEDED 2026-08-27** by `2026-08-27-spendmcp-v2.md` after judge-perspective review. Tasks 1–5 here remain the authoritative spec for the SDK modules (scaffold, detect, budget, pay, paidFetch) and are referenced by the v2 plan. Tasks 6–14 here are obsolete — do not execute them.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a WebMCP Challenge entry: an x402-paywalled demo site whose paywall is exposed as WebMCP tools with human-in-the-loop budget control, plus a reusable `webmcp-x402` npm SDK.

**Architecture:** pnpm monorepo. `packages/sdk` (pure TS, viem-only dep) implements 402 parsing, EIP-3009 payment signing, budget policy, approval gating, and WebMCP tool registration. `apps/demo` (Next.js 15 App Router) serves articles behind x402 402 responses, verifies signatures server-side (mock mode: no chain; real mode: facilitator settle on Base Sepolia), and renders the wallet drawer + approval sheet. See `docs/01-ARCHITECTURE.md` for flows.

**Tech Stack:** TypeScript strict, viem, vitest, tsup, Next.js 15, Tailwind, Playwright, pnpm workspaces. Node ≥ 20.

**Conventions used below:** All paths relative to repo root `~/Documents/webmcp-x402`. USDC atomic units: `"50000"` = $0.05 (6 decimals). Base Sepolia chainId 84532, USDC asset `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Run tests from repo root with `pnpm --filter webmcp-x402 test -- run <file>` unless stated.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/vitest.config.ts`

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "tollbooth",
  "private": true,
  "scripts": { "test": "pnpm -r test" },
  "packageManager": "pnpm@9.0.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 2: SDK package**

`packages/sdk/package.json`:
```json
{
  "name": "webmcp-x402",
  "version": "0.1.0",
  "description": "Expose x402 (HTTP 402) paywalls as WebMCP tools with human-in-the-loop budgets",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest"
  },
  "keywords": ["webmcp", "x402", "402", "micropayments", "mcp", "agents"],
  "dependencies": { "viem": "^2.21.0" },
  "devDependencies": { "tsup": "^8.0.0", "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

`packages/sdk/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/sdk/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 3: Install**

Run: `cd ~/Documents/webmcp-x402 && pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: monorepo scaffold (pnpm, sdk package)"
```

---

### Task 2: SDK types + 402 detection

**Files:**
- Create: `packages/sdk/src/types.ts`, `packages/sdk/src/detect.ts`
- Test: `packages/sdk/test/detect.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/test/detect.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parsePaymentRequired, pickExact, usd } from '../src/detect'

const reqs = {
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
  resource: '/api/article/a', description: 'Article A', mimeType: 'application/json',
  payTo: '0x1111111111111111111111111111111111111111',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
}
const body = { x402Version: 1, accepts: [reqs], error: 'payment required' }

describe('parsePaymentRequired', () => {
  it('parses a 402 with x402 body', async () => {
    const res = new Response(JSON.stringify(body), { status: 402 })
    const parsed = await parsePaymentRequired(res)
    expect(parsed?.accepts[0]?.maxAmountRequired).toBe('50000')
  })
  it('returns null for non-402', async () => {
    expect(await parsePaymentRequired(new Response('ok', { status: 200 }))).toBeNull()
  })
  it('returns null for 402 without x402 body', async () => {
    expect(await parsePaymentRequired(new Response('nope', { status: 402 }))).toBeNull()
  })
  it('does not consume the body', async () => {
    const res = new Response(JSON.stringify(body), { status: 402 })
    await parsePaymentRequired(res)
    expect((await res.json()).x402Version).toBe(1)
  })
})

describe('helpers', () => {
  it('usd converts atomic USDC', () => { expect(usd(reqs as never)).toBe(0.05) })
  it('pickExact picks first exact scheme', () => {
    expect(pickExact([{ ...reqs, scheme: 'other' }, reqs] as never)?.scheme).toBe('exact')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter webmcp-x402 test -- run test/detect.test.ts`
Expected: FAIL — cannot resolve `../src/detect`.

- [ ] **Step 3: Implement**

`packages/sdk/src/types.ts`:
```ts
export interface PaymentRequirements {
  scheme: string
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType?: string
  payTo: `0x${string}`
  asset: `0x${string}`
  maxTimeoutSeconds?: number
  extra?: { name?: string; version?: string }
}

export interface X402Body {
  x402Version: number
  accepts: PaymentRequirements[]
  error?: string
}

export interface PaymentReceipt {
  amountUsd: number
  resource: string
  nonce: `0x${string}`
  network: string
  txHash?: string
  mode: 'mock' | 'real'
  at: string
}
```

`packages/sdk/src/detect.ts`:
```ts
import type { PaymentRequirements, X402Body } from './types'

export async function parsePaymentRequired(res: Response): Promise<X402Body | null> {
  if (res.status !== 402) return null
  try {
    const body = (await res.clone().json()) as X402Body
    if (typeof body?.x402Version !== 'number' || !Array.isArray(body?.accepts)) return null
    return body
  } catch {
    return null
  }
}

export function pickExact(accepts: PaymentRequirements[]): PaymentRequirements | null {
  return accepts.find((a) => a.scheme === 'exact') ?? null
}

/** USDC has 6 decimals. */
export function usd(req: PaymentRequirements): number {
  return Number(req.maxAmountRequired) / 1_000_000
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter webmcp-x402 test -- run test/detect.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk && git commit -m "feat(sdk): x402 402-response detection and helpers"
```

---

### Task 3: Budget policy

**Files:**
- Create: `packages/sdk/src/budget.ts`
- Test: `packages/sdk/test/budget.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/test/budget.test.ts`:
```ts
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter webmcp-x402 test -- run test/budget.test.ts`
Expected: FAIL — cannot resolve `../src/budget`.

- [ ] **Step 3: Implement**

`packages/sdk/src/budget.ts`:
```ts
export interface BudgetState {
  capUsd: number
  spentUsd: number
  autoApproveUnderUsd: number
}

export type BudgetDecision = 'auto' | 'confirm' | 'deny'

export interface Budget {
  readonly state: BudgetState
  decide(amountUsd: number): BudgetDecision
  record(amountUsd: number): void
  setCap(capUsd: number): void
  setAutoApprove(underUsd: number): void
}

export function createBudget(init: Partial<BudgetState> = {}): Budget {
  const state: BudgetState = { capUsd: 0.5, spentUsd: 0, autoApproveUnderUsd: 0, ...init }
  return {
    get state() {
      return { ...state }
    },
    decide(amountUsd) {
      if (state.spentUsd + amountUsd > state.capUsd + 1e-9) return 'deny'
      if (amountUsd <= state.autoApproveUnderUsd) return 'auto'
      return 'confirm'
    },
    record(amountUsd) {
      state.spentUsd += amountUsd
    },
    setCap(capUsd) {
      state.capUsd = Math.max(capUsd, state.spentUsd)
    },
    setAutoApprove(underUsd) {
      state.autoApproveUnderUsd = Math.max(0, underUsd)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter webmcp-x402 test -- run test/budget.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk && git commit -m "feat(sdk): session budget policy (cap, auto-approve, deny)"
```

---

### Task 4: EIP-3009 payment header

**Files:**
- Create: `packages/sdk/src/pay.ts`
- Test: `packages/sdk/test/pay.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/test/pay.test.ts`:
```ts
import { verifyTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { buildPaymentHeader, chainIdFor, decodePaymentHeader, EIP3009_TYPES } from '../src/pay'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const req = {
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
  resource: '/api/article/a', description: 'Article A',
  payTo: '0x1111111111111111111111111111111111111111' as const,
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
  maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
}

describe('chainIdFor', () => {
  it('maps known networks', () => {
    expect(chainIdFor('base-sepolia')).toBe(84532)
    expect(chainIdFor('base')).toBe(8453)
  })
  it('throws on unknown network', () => {
    expect(() => chainIdFor('mainnet')).toThrow()
  })
})

describe('buildPaymentHeader', () => {
  it('produces a decodable payload with a valid signature', async () => {
    const header = await buildPaymentHeader(account, req)
    const payload = decodePaymentHeader(header)
    expect(payload.x402Version).toBe(1)
    expect(payload.scheme).toBe('exact')
    const { authorization, signature } = payload.payload
    expect(authorization.from).toBe(account.address)
    expect(authorization.to).toBe(req.payTo)
    expect(authorization.value).toBe('50000')
    expect(authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    const ok = await verifyTypedData({
      address: account.address,
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: req.asset },
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from, to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
      signature,
    })
    expect(ok).toBe(true)
  })
  it('uses unique nonces', async () => {
    const a = decodePaymentHeader(await buildPaymentHeader(account, req))
    const b = decodePaymentHeader(await buildPaymentHeader(account, req))
    expect(a.payload.authorization.nonce).not.toBe(b.payload.authorization.nonce)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter webmcp-x402 test -- run test/pay.test.ts`
Expected: FAIL — cannot resolve `../src/pay`.

- [ ] **Step 3: Implement**

`packages/sdk/src/pay.ts`:
```ts
import type { LocalAccount } from 'viem'
import type { PaymentRequirements } from './types'

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

const CHAIN_IDS: Record<string, number> = { 'base-sepolia': 84532, base: 8453 }

export function chainIdFor(network: string): number {
  const id = CHAIN_IDS[network]
  if (!id) throw new Error(`Unsupported x402 network: ${network}`)
  return id
}

export interface PaymentPayload {
  x402Version: 1
  scheme: 'exact'
  network: string
  payload: {
    signature: `0x${string}`
    authorization: {
      from: `0x${string}`
      to: `0x${string}`
      value: string
      validAfter: string
      validBefore: string
      nonce: `0x${string}`
    }
  }
}

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function toBase64(s: string): string {
  if (typeof btoa === 'function') return btoa(s)
  return Buffer.from(s, 'utf8').toString('base64')
}

function fromBase64(s: string): string {
  if (typeof atob === 'function') return atob(s)
  return Buffer.from(s, 'base64').toString('utf8')
}

export async function buildPaymentHeader(
  account: LocalAccount,
  req: PaymentRequirements,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const authorization = {
    from: account.address,
    to: req.payTo,
    value: BigInt(req.maxAmountRequired),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + (req.maxTimeoutSeconds ?? 300)),
    nonce: randomNonce(),
  }
  const signature = await account.signTypedData({
    domain: {
      name: req.extra?.name ?? 'USDC',
      version: req.extra?.version ?? '2',
      chainId: chainIdFor(req.network),
      verifyingContract: req.asset,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: req.network,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
  }
  return toBase64(JSON.stringify(payload))
}

export function decodePaymentHeader(header: string): PaymentPayload {
  return JSON.parse(fromBase64(header)) as PaymentPayload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter webmcp-x402 test -- run test/pay.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk && git commit -m "feat(sdk): EIP-3009 X-PAYMENT header build/decode"
```

---

### Task 5: paidFetch pipeline

**Files:**
- Create: `packages/sdk/src/paidFetch.ts`
- Test: `packages/sdk/test/paidFetch.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/test/paidFetch.test.ts`:
```ts
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'
import { createBudget } from '../src/budget'
import { createPaidFetch, PaymentDeniedError } from '../src/paidFetch'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const body402 = {
  x402Version: 1,
  accepts: [{
    scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '50000',
    resource: '/a', description: 'A',
    payTo: '0x1111111111111111111111111111111111111111',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxTimeoutSeconds: 300, extra: { name: 'USDC', version: '2' },
  }],
}

function fetchScript(...responses: Response[]): typeof fetch {
  let i = 0
  return vi.fn(async () => responses[i++] ?? new Response('exhausted', { status: 500 })) as never
}

const r402 = () => new Response(JSON.stringify(body402), { status: 402 })
const r200 = () =>
  new Response(JSON.stringify({ content: 'secret' }), {
    status: 200,
    headers: { 'X-PAYMENT-RESPONSE': btoa(JSON.stringify({ success: true, mode: 'mock' })) },
  })

describe('createPaidFetch', () => {
  it('passes through non-402 without paying', async () => {
    const f = fetchScript(new Response('free', { status: 200 }))
    const paid = createPaidFetch({ account, budget: createBudget(), fetchImpl: f })
    const res = await paid('/free')
    expect(await res.text()).toBe('free')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('pays and retries on 402 (auto)', async () => {
    const f = fetchScript(r402(), r200())
    const budget = createBudget({ capUsd: 1, autoApproveUnderUsd: 0.1 })
    const onPayment = vi.fn()
    const paid = createPaidFetch({ account, budget, fetchImpl: f, onPayment })
    const res = await paid('/a')
    expect(res.status).toBe(200)
    const second = (f as ReturnType<typeof vi.fn>).mock.calls[1]
    expect((second[1].headers as Record<string, string>)['X-PAYMENT']).toBeTruthy()
    expect(budget.state.spentUsd).toBeCloseTo(0.05)
    expect(onPayment).toHaveBeenCalledOnce()
    expect(onPayment.mock.calls[0][0].receipt.mode).toBe('mock')
  })
  it('asks confirm and respects decline', async () => {
    const f = fetchScript(r402())
    const paid = createPaidFetch({
      account,
      budget: createBudget({ capUsd: 1 }),
      confirm: async () => false,
      fetchImpl: f,
    })
    await expect(paid('/a')).rejects.toThrowError(PaymentDeniedError)
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'user_declined' }).catch(() => {})
  })
  it('denies over budget without calling confirm', async () => {
    const confirm = vi.fn(async () => true)
    const paid = createPaidFetch({
      account,
      budget: createBudget({ capUsd: 0.01 }),
      confirm,
      fetchImpl: fetchScript(r402()),
    })
    await expect(paid('/a')).rejects.toMatchObject({ reason: 'budget_exceeded' })
    expect(confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter webmcp-x402 test -- run test/paidFetch.test.ts`
Expected: FAIL — cannot resolve `../src/paidFetch`.

- [ ] **Step 3: Implement**

`packages/sdk/src/paidFetch.ts`:
```ts
import type { LocalAccount } from 'viem'
import type { Budget } from './budget'
import { parsePaymentRequired, pickExact, usd } from './detect'
import { buildPaymentHeader, decodePaymentHeader } from './pay'
import type { PaymentReceipt } from './types'

export type DenyReason = 'budget_exceeded' | 'user_declined' | 'confirm_timeout'

export class PaymentDeniedError extends Error {
  constructor(
    public reason: DenyReason,
    public amountUsd: number,
    public resource: string,
  ) {
    super(`payment denied (${reason}): $${amountUsd} for ${resource}`)
    this.name = 'PaymentDeniedError'
  }
}

export interface ConfirmDetails {
  amountUsd: number
  resource: string
  description: string
  spentUsd: number
  capUsd: number
}

export interface PaymentEvent {
  amountUsd: number
  resource: string
  receipt: PaymentReceipt
}

export interface PaidFetchOptions {
  account: LocalAccount
  budget: Budget
  /** Human approval gate. Omit = only auto-approved payments succeed. */
  confirm?: (details: ConfirmDetails) => Promise<boolean>
  onPayment?: (e: PaymentEvent) => void
  fetchImpl?: typeof fetch
}

function decodeReceiptHeader(res: Response, fallback: Omit<PaymentReceipt, 'txHash' | 'mode'>): PaymentReceipt {
  const raw = res.headers.get('X-PAYMENT-RESPONSE')
  let mode: PaymentReceipt['mode'] = 'mock'
  let txHash: string | undefined
  if (raw) {
    try {
      const parsed = JSON.parse(typeof atob === 'function' ? atob(raw) : Buffer.from(raw, 'base64').toString('utf8'))
      if (parsed.mode === 'real') mode = 'real'
      txHash = parsed.txHash
    } catch {
      /* keep fallback */
    }
  }
  return { ...fallback, mode, txHash }
}

export function createPaidFetch(opts: PaidFetchOptions) {
  const { account, budget, confirm, onPayment } = opts
  const fetchImpl = opts.fetchImpl ?? fetch

  return async function paidFetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const first = await fetchImpl(input, init)
    const x402 = await parsePaymentRequired(first)
    if (!x402) return first
    const req = pickExact(x402.accepts)
    if (!req) return first

    const amountUsd = usd(req)
    const decision = budget.decide(amountUsd)
    if (decision === 'deny') throw new PaymentDeniedError('budget_exceeded', amountUsd, req.resource)
    if (decision === 'confirm') {
      const ok = confirm
        ? await confirm({
            amountUsd,
            resource: req.resource,
            description: req.description,
            spentUsd: budget.state.spentUsd,
            capUsd: budget.state.capUsd,
          })
        : false
      if (!ok) throw new PaymentDeniedError('user_declined', amountUsd, req.resource)
    }

    const header = await buildPaymentHeader(account, req)
    const second = await fetchImpl(input, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), 'X-PAYMENT': header },
    })
    if (second.ok) {
      budget.record(amountUsd)
      const { authorization } = decodePaymentHeader(header).payload
      onPayment?.({
        amountUsd,
        resource: req.resource,
        receipt: decodeReceiptHeader(second, {
          amountUsd,
          resource: req.resource,
          nonce: authorization.nonce,
          network: req.network,
          at: new Date().toISOString(),
        }),
      })
    }
    return second
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter webmcp-x402 test -- run test/paidFetch.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk && git commit -m "feat(sdk): paidFetch — 402 detect, budget gate, confirm, pay, retry"
```

---

### Task 6: WebMCP tool registration

**Files:**
- Create: `packages/sdk/src/webmcp.ts`, `packages/sdk/src/index.ts`
- Test: `packages/sdk/test/webmcp.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sdk/test/webmcp.test.ts`:
```ts
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'
import { createBudget } from '../src/budget'
import { registerPaywallTools, type ModelContext, type ModelContextTool } from '../src/webmcp'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)

function fakeMc() {
  const tools = new Map<string, ModelContextTool>()
  const mc: ModelContext = { registerTool: (t) => void tools.set(t.name, t) }
  return { mc, tools }
}

function baseOpts() {
  return {
    account,
    budget: createBudget({ capUsd: 1, autoApproveUnderUsd: 0.1 }),
    network: 'base-sepolia',
    paidFetch: vi.fn(async () => new Response(JSON.stringify({ content: 'secret' }), { status: 200 })),
    receipts: () => [],
    requestRefund: vi.fn(async () => ({ ok: true as const, status: 'refunded' })),
  }
}

async function call(tools: Map<string, ModelContextTool>, name: string, args: Record<string, unknown> = {}) {
  const out = await tools.get(name)!.execute(args)
  return JSON.parse(out.content[0].text)
}

describe('registerPaywallTools', () => {
  it('registers the five tools', () => {
    const { mc, tools } = fakeMc()
    expect(registerPaywallTools(baseOpts(), mc)).toBe(true)
    expect([...tools.keys()].sort()).toEqual([
      'get_wallet_status', 'request_refund', 'set_session_budget', 'unlock_content',
    ])
  })
  it('returns false without a model context', () => {
    expect(registerPaywallTools(baseOpts(), null)).toBe(false)
  })
  it('get_wallet_status reports address and budget', async () => {
    const { mc, tools } = fakeMc()
    registerPaywallTools(baseOpts(), mc)
    const status = await call(tools, 'get_wallet_status')
    expect(status.address).toBe(account.address)
    expect(status.budget.capUsd).toBe(1)
  })
  it('unlock_content returns content on success', async () => {
    const { mc, tools } = fakeMc()
    registerPaywallTools(baseOpts(), mc)
    const out = await call(tools, 'unlock_content', { url: '/api/article/a' })
    expect(out.ok).toBe(true)
    expect(out.content.content).toBe('secret')
  })
  it('unlock_content surfaces structured denial', async () => {
    const { mc, tools } = fakeMc()
    const opts = baseOpts()
    const { PaymentDeniedError } = await import('../src/paidFetch')
    opts.paidFetch = vi.fn(async () => {
      throw new PaymentDeniedError('budget_exceeded', 0.05, '/api/article/a')
    })
    registerPaywallTools(opts, mc)
    const out = await call(tools, 'unlock_content', { url: '/api/article/a' })
    expect(out.ok).toBe(false)
    expect(out.denied).toBe('budget_exceeded')
  })
  it('set_session_budget lowers immediately, never exceeds maxCapUsd', async () => {
    const { mc, tools } = fakeMc()
    const opts = { ...baseOpts(), maxCapUsd: 2 }
    registerPaywallTools(opts, mc)
    const lowered = await call(tools, 'set_session_budget', { capUsd: 0.2 })
    expect(lowered.budget.capUsd).toBeCloseTo(0.2)
    const raised = await call(tools, 'set_session_budget', { capUsd: 50 })
    expect(raised.budget.capUsd).toBeCloseTo(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter webmcp-x402 test -- run test/webmcp.test.ts`
Expected: FAIL — cannot resolve `../src/webmcp`.

- [ ] **Step 3: Implement**

`packages/sdk/src/webmcp.ts`:
```ts
import type { LocalAccount } from 'viem'
import type { Budget } from './budget'
import { PaymentDeniedError } from './paidFetch'
import type { PaymentReceipt } from './types'

export interface ModelContextTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

export interface ModelContext {
  registerTool(tool: ModelContextTool): unknown
}

/** ChatGPT in-app browser and Chrome 149 may expose the API on different globals. */
export function getModelContext(): ModelContext | null {
  const g = globalThis as Record<string, any>
  return g.navigator?.modelContext ?? g.document?.modelContext ?? null
}

export interface PaywallToolsOptions {
  account: LocalAccount
  budget: Budget
  network: string
  paidFetch: (url: string) => Promise<Response>
  receipts: () => PaymentReceipt[]
  requestRefund: (nonce: string, reason: string) => Promise<{ ok: boolean; status: string }>
  /** Hard ceiling the agent can never raise the cap above (human-owned). */
  maxCapUsd?: number
  mode?: 'mock' | 'real'
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

export function registerPaywallTools(
  opts: PaywallToolsOptions,
  mc: ModelContext | null = getModelContext(),
): boolean {
  if (!mc) return false
  const { account, budget, network, paidFetch, receipts, requestRefund } = opts
  const maxCapUsd = opts.maxCapUsd ?? 5

  mc.registerTool({
    name: 'get_wallet_status',
    description:
      'Get the demo wallet address, network, payment mode, session budget (cap, spent, auto-approve threshold) and payment receipts.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return text({
        address: account.address,
        network,
        mode: opts.mode ?? 'mock',
        budget: budget.state,
        receipts: receipts(),
      })
    },
  })

  mc.registerTool({
    name: 'unlock_content',
    description:
      'Pay for and fetch a paywalled URL on this site using an x402 USDC micropayment. May trigger an on-page human approval sheet; respects the session budget. Returns the content plus a payment receipt, or a structured denial.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Paywalled URL or path on this site' } },
      required: ['url'],
    },
    async execute(args) {
      const url = String(args.url ?? '')
      try {
        const res = await paidFetch(url)
        if (!res.ok) return text({ ok: false, status: res.status, body: await res.text() })
        return text({ ok: true, content: await res.json(), latestReceipt: receipts().at(-1) ?? null })
      } catch (err) {
        if (err instanceof PaymentDeniedError) {
          return text({
            ok: false,
            denied: err.reason,
            amountUsd: err.amountUsd,
            budget: budget.state,
            hint:
              err.reason === 'budget_exceeded'
                ? 'Ask the user to raise the session budget, or call set_session_budget (raises still require human confirmation).'
                : 'The user declined this payment.',
          })
        }
        throw err
      }
    },
  })

  mc.registerTool({
    name: 'set_session_budget',
    description:
      'Adjust the session spending budget. Lowering applies immediately; raising is clamped to the human-set maximum.',
    inputSchema: {
      type: 'object',
      properties: {
        capUsd: { type: 'number', description: 'New session cap in USD' },
        autoApproveUnderUsd: { type: 'number', description: 'Auto-approve payments at or below this USD amount' },
      },
    },
    async execute(args) {
      if (typeof args.capUsd === 'number') budget.setCap(Math.min(args.capUsd, maxCapUsd))
      if (typeof args.autoApproveUnderUsd === 'number') {
        budget.setAutoApprove(Math.min(args.autoApproveUnderUsd, maxCapUsd))
      }
      return text({ budget: budget.state, maxCapUsd })
    },
  })

  mc.registerTool({
    name: 'request_refund',
    description:
      'Request a refund for a past payment by receipt nonce, e.g. when the delivered content was invalid or empty.',
    inputSchema: {
      type: 'object',
      properties: {
        nonce: { type: 'string', description: 'Receipt nonce (0x…) from get_wallet_status' },
        reason: { type: 'string', description: 'Why the content was unsatisfactory' },
      },
      required: ['nonce', 'reason'],
    },
    async execute(args) {
      return text(await requestRefund(String(args.nonce), String(args.reason)))
    },
  })

  return true
}
```

`packages/sdk/src/index.ts`:
```ts
export { createBudget } from './budget'
export type { Budget, BudgetDecision, BudgetState } from './budget'
export { parsePaymentRequired, pickExact, usd } from './detect'
export { buildPaymentHeader, chainIdFor, decodePaymentHeader, EIP3009_TYPES } from './pay'
export type { PaymentPayload } from './pay'
export { createPaidFetch, PaymentDeniedError } from './paidFetch'
export type { ConfirmDetails, PaidFetchOptions, PaymentEvent } from './paidFetch'
export type { PaymentReceipt, PaymentRequirements, X402Body } from './types'
export { getModelContext, registerPaywallTools } from './webmcp'
export type { ModelContext, ModelContextTool, PaywallToolsOptions } from './webmcp'
```

- [ ] **Step 4: Run full SDK suite**

Run: `pnpm --filter webmcp-x402 test -- run`
Expected: all files pass (detect 6, budget 6, pay 4, paidFetch 4, webmcp 6).

- [ ] **Step 5: Build check + commit**

Run: `pnpm --filter webmcp-x402 build`
Expected: `dist/index.js` + `dist/index.d.ts` emitted.

```bash
git add packages/sdk && git commit -m "feat(sdk): WebMCP paywall tools + public API"
```

---

### Task 7: Demo app scaffold + article data

**Files:**
- Create: `apps/demo` via create-next-app
- Create: `apps/demo/lib/articles.ts`, `apps/demo/lib/x402.ts`
- Modify: `apps/demo/package.json` (add SDK dep, vitest)

- [ ] **Step 1: Scaffold Next.js**

Run: `cd ~/Documents/webmcp-x402/apps 2>/dev/null || mkdir -p ~/Documents/webmcp-x402/apps; cd ~/Documents/webmcp-x402 && pnpm create next-app@latest apps/demo --ts --app --tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm`
Expected: scaffold under `apps/demo`, `pnpm install` completes. Name the app `demo` if prompted.

- [ ] **Step 2: Add workspace deps**

In `apps/demo/package.json` add:
```json
"dependencies": { "webmcp-x402": "workspace:*", "viem": "^2.21.0" },
"devDependencies": { "vitest": "^2.1.0" },
"scripts": { "test": "vitest --run" }
```
(merge into existing blocks, keep Next.js entries). Then run `pnpm install` at root.

- [ ] **Step 3: Article data**

`apps/demo/lib/articles.ts`:
```ts
export interface Article {
  slug: string
  title: string
  teaser: string
  priceAtomic: string // USDC 6-decimals; "0" = free
  body: string
}

export const ARTICLES: Article[] = [
  {
    slug: 'welcome',
    title: 'Welcome to Tollbooth Research',
    teaser: 'What this site demonstrates and how to try it with an agent.',
    priceAtomic: '0',
    body: 'Tollbooth Research is a demo publication. Free articles are open; premium articles return HTTP 402 with x402 payment requirements. Ask your agent to read a premium article and watch the approval sheet.',
  },
  {
    slug: 'agent-commerce',
    title: 'The State of Agent Commerce',
    teaser: 'Why HTTP 402 finally matters, 30 years after it was reserved.',
    priceAtomic: '50000',
    body: 'PREMIUM CONTENT: x402 turned HTTP 402 from a reserved status code into a working payment protocol. Agents sign EIP-3009 USDC authorizations bounded by amount, recipient, expiry and a single-use nonce. This article was unlocked by exactly such a payment — check your receipt log for the nonce that paid for it.',
  },
  {
    slug: 'webmcp-primer',
    title: 'WebMCP: Tools, Not Guesswork',
    teaser: 'How sites expose structured tools to in-browser agents.',
    priceAtomic: '50000',
    body: 'PREMIUM CONTENT: WebMCP lets a page register typed tools with the browser agent host. Instead of screen-scraping a paywall, the agent calls unlock_content and gets structured JSON back, including a cryptographic receipt.',
  },
  {
    slug: 'micropayment-economics',
    title: 'Five-Cent Economics',
    teaser: 'What per-article pricing does to publisher revenue models.',
    priceAtomic: '100000',
    body: 'PREMIUM CONTENT ($0.10 tier): Micropayments never worked because checkout friction exceeded the price. An agent with a budget removes the friction while the human keeps the policy. This tier exists to demo the confirm path above the auto-approve threshold.',
  },
]

export const bySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug) ?? null
export const isFree = (a: Article) => a.priceAtomic === '0'
```

- [ ] **Step 4: Server x402 config**

`apps/demo/lib/x402.ts`:
```ts
import type { PaymentRequirements } from 'webmcp-x402'

export const NETWORK = 'base-sepolia'
export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
export const PAY_TO = (process.env.PAY_TO ?? '0x1111111111111111111111111111111111111111') as `0x${string}`
export const MOCK_MODE = process.env.MOCK_MODE !== '0'
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'https://x402.org/facilitator'

export function requirementsFor(resource: string, priceAtomic: string, description: string): PaymentRequirements {
  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: priceAtomic,
    resource,
    description,
    mimeType: 'application/json',
    payTo: PAY_TO,
    asset: USDC_BASE_SEPOLIA,
    maxTimeoutSeconds: 300,
    extra: { name: 'USDC', version: '2' },
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(demo): Next.js scaffold, article data, x402 config"
```

---

### Task 8: Server-side payment verification

**Files:**
- Create: `apps/demo/lib/verify.ts`, `apps/demo/lib/store.ts`
- Test: `apps/demo/test/verify.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/demo/test/verify.test.ts`:
```ts
import { privateKeyToAccount } from 'viem/accounts'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPaymentHeader } from 'webmcp-x402'
import { requirementsFor } from '../lib/x402'
import { resetStores } from '../lib/store'
import { verifyPayment } from '../lib/verify'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const req = requirementsFor('/api/article/agent-commerce', '50000', 'test')

describe('verifyPayment', () => {
  beforeEach(() => resetStores())

  it('accepts a valid payment header', async () => {
    const header = await buildPaymentHeader(account, req)
    const result = await verifyPayment(header, req)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payer).toBe(account.address)
  })
  it('rejects replayed nonce', async () => {
    const header = await buildPaymentHeader(account, req)
    await verifyPayment(header, req)
    const replay = await verifyPayment(header, req)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.error).toBe('nonce_replayed')
  })
  it('rejects wrong recipient', async () => {
    const header = await buildPaymentHeader(account, {
      ...req,
      payTo: '0x2222222222222222222222222222222222222222',
    })
    const result = await verifyPayment(header, req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('wrong_recipient')
  })
  it('rejects underpayment', async () => {
    const header = await buildPaymentHeader(account, { ...req, maxAmountRequired: '1' })
    const result = await verifyPayment(header, req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('underpaid')
  })
  it('rejects garbage header', async () => {
    const result = await verifyPayment('not-base64-json', req)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter demo test`
Expected: FAIL — cannot resolve `../lib/verify` / `../lib/store`.

- [ ] **Step 3: Implement**

`apps/demo/lib/store.ts`:
```ts
// In-memory, per-server-instance. Fine for a demo; on serverless each instance
// has its own log, which only weakens replay protection across instances.
export interface PaymentRecord {
  nonce: string
  payer: string
  resource: string
  amountAtomic: string
  at: string
  refunded: boolean
  txHash?: string
}

const g = globalThis as unknown as { __tollbooth?: { payments: Map<string, PaymentRecord> } }
g.__tollbooth ??= { payments: new Map() }

export const payments = () => g.__tollbooth!.payments
export const resetStores = () => payments().clear()
```

`apps/demo/lib/verify.ts`:
```ts
import { verifyTypedData } from 'viem'
import { chainIdFor, decodePaymentHeader, EIP3009_TYPES, type PaymentRequirements } from 'webmcp-x402'
import { payments } from './store'

export type VerifyResult =
  | { ok: true; payer: `0x${string}`; nonce: `0x${string}` }
  | { ok: false; error: 'bad_header' | 'bad_signature' | 'wrong_recipient' | 'underpaid' | 'expired' | 'nonce_replayed' }

export async function verifyPayment(header: string, req: PaymentRequirements): Promise<VerifyResult> {
  let payload: ReturnType<typeof decodePaymentHeader>
  try {
    payload = decodePaymentHeader(header)
    if (payload.x402Version !== 1 || payload.scheme !== 'exact') return { ok: false, error: 'bad_header' }
  } catch {
    return { ok: false, error: 'bad_header' }
  }
  const { authorization: auth, signature } = payload.payload

  // Field checks against OUR requirements (never trust client-declared values).
  if (auth.to.toLowerCase() !== req.payTo.toLowerCase()) return { ok: false, error: 'wrong_recipient' }
  if (BigInt(auth.value) < BigInt(req.maxAmountRequired)) return { ok: false, error: 'underpaid' }
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < BigInt(auth.validAfter) || now > BigInt(auth.validBefore)) return { ok: false, error: 'expired' }
  if (payments().has(auth.nonce)) return { ok: false, error: 'nonce_replayed' }

  const valid = await verifyTypedData({
    address: auth.from,
    domain: {
      name: req.extra?.name ?? 'USDC',
      version: req.extra?.version ?? '2',
      chainId: chainIdFor(payload.network),
      verifyingContract: req.asset,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
    signature,
  }).catch(() => false)
  if (!valid) return { ok: false, error: 'bad_signature' }

  payments().set(auth.nonce, {
    nonce: auth.nonce,
    payer: auth.from,
    resource: req.resource,
    amountAtomic: req.maxAmountRequired,
    at: new Date().toISOString(),
    refunded: false,
  })
  return { ok: true, payer: auth.from, nonce: auth.nonce }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter demo test`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/demo && git commit -m "feat(demo): server-side EIP-3009 verification with replay protection"
```

---

### Task 9: API routes — articles, 402 gate, refund

**Files:**
- Create: `apps/demo/app/api/articles/route.ts`
- Create: `apps/demo/app/api/article/[slug]/route.ts`
- Create: `apps/demo/app/api/refund/route.ts`
- Create: `apps/demo/lib/settle.ts`

- [ ] **Step 1: Free article index**

`apps/demo/app/api/articles/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { ARTICLES, isFree } from '@/lib/articles'

export function GET() {
  return NextResponse.json({
    articles: ARTICLES.map((a) => ({
      slug: a.slug,
      title: a.title,
      teaser: a.teaser,
      free: isFree(a),
      priceUsd: Number(a.priceAtomic) / 1_000_000,
      url: `/api/article/${a.slug}`,
    })),
  })
}
```

- [ ] **Step 2: Settlement helper**

`apps/demo/lib/settle.ts`:
```ts
import { FACILITATOR_URL, MOCK_MODE, NETWORK } from './x402'

export interface SettleOutcome { mode: 'mock' | 'real'; txHash?: string }

/**
 * Mock mode: signature verification already proved payment intent; skip chain.
 * Real mode: forward the payment payload to the x402 facilitator to settle on-chain.
 */
export async function settle(paymentHeader: string, requirements: unknown): Promise<SettleOutcome> {
  if (MOCK_MODE) return { mode: 'mock' }
  const res = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 1,
      paymentHeader,
      paymentRequirements: requirements,
      network: NETWORK,
    }),
  })
  if (!res.ok) throw new Error(`facilitator settle failed: ${res.status}`)
  const data = (await res.json()) as { transaction?: string; txHash?: string }
  return { mode: 'real', txHash: data.txHash ?? data.transaction }
}
```
Note: verify the facilitator request/response field names against https://x402.org docs during Task 13 (real-mode pass); mock mode does not depend on them.

- [ ] **Step 3: The 402 gate**

`apps/demo/app/api/article/[slug]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { bySlug, isFree } from '@/lib/articles'
import { requirementsFor } from '@/lib/x402'
import { verifyPayment } from '@/lib/verify'
import { settle } from '@/lib/settle'
import { payments } from '@/lib/store'

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const article = bySlug(slug)
  if (!article) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const full = { slug: article.slug, title: article.title, content: article.body }
  if (isFree(article)) return NextResponse.json(full)

  const requirements = requirementsFor(
    `/api/article/${slug}`,
    article.priceAtomic,
    `Full article: ${article.title}`,
  )

  const header = req.headers.get('X-PAYMENT')
  if (!header) {
    return NextResponse.json(
      { x402Version: 1, accepts: [requirements], error: 'payment required' },
      { status: 402 },
    )
  }

  const verified = await verifyPayment(header, requirements)
  if (!verified.ok) {
    return NextResponse.json(
      { x402Version: 1, accepts: [requirements], error: verified.error },
      { status: 402 },
    )
  }

  let outcome
  try {
    outcome = await settle(header, requirements)
  } catch {
    payments().delete(verified.nonce) // free the nonce; settlement failed
    return NextResponse.json(
      { x402Version: 1, accepts: [requirements], error: 'settlement_failed' },
      { status: 402 },
    )
  }
  const record = payments().get(verified.nonce)
  if (record && outcome.txHash) record.txHash = outcome.txHash

  const receipt = Buffer.from(
    JSON.stringify({ success: true, network: requirements.network, nonce: verified.nonce, ...outcome }),
  ).toString('base64')
  return NextResponse.json(full, { headers: { 'X-PAYMENT-RESPONSE': receipt } })
}
```

- [ ] **Step 4: Refund endpoint**

`apps/demo/app/api/refund/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { payments } from '@/lib/store'
import { MOCK_MODE } from '@/lib/x402'

/**
 * Demo refund policy: a payment recorded on this server can be refunded once.
 * Mock mode marks the record refunded. Real mode would transfer USDC back from
 * the server wallet — out of MVP scope; respond with a queued status instead.
 */
export async function POST(req: NextRequest) {
  const { nonce, reason } = (await req.json().catch(() => ({}))) as { nonce?: string; reason?: string }
  if (!nonce || !reason) {
    return NextResponse.json({ ok: false, status: 'missing nonce or reason' }, { status: 400 })
  }
  const record = payments().get(nonce)
  if (!record) return NextResponse.json({ ok: false, status: 'unknown_payment' }, { status: 404 })
  if (record.refunded) return NextResponse.json({ ok: false, status: 'already_refunded' }, { status: 409 })
  record.refunded = true
  return NextResponse.json({
    ok: true,
    status: MOCK_MODE ? 'refunded' : 'refund_queued',
    nonce,
    amountAtomic: record.amountAtomic,
    reason,
  })
}
```

- [ ] **Step 5: Manual verification**

Run: `pnpm --filter demo dev &` then:
```bash
curl -s localhost:3000/api/articles | head -c 300
curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/article/agent-commerce   # expect 402
curl -s localhost:3000/api/article/welcome | head -c 200                            # expect content
```
Kill the dev server after.

- [ ] **Step 6: Commit**

```bash
git add apps/demo && git commit -m "feat(demo): article API with x402 402 gate, settle, refund"
```

---

### Task 10: Client wallet + Tollbooth provider (SDK wiring)

**Files:**
- Create: `apps/demo/lib/wallet.ts`
- Create: `apps/demo/components/TollboothProvider.tsx`
- Modify: `apps/demo/app/layout.tsx` (wrap children in provider)

- [ ] **Step 1: Demo wallet (client-only)**

`apps/demo/lib/wallet.ts`:
```ts
'use client'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { LocalAccount } from 'viem'

const KEY = 'tollbooth.demo-key.testnet-only'

/** Testnet-only demo key, generated in the browser, stored in localStorage. */
export function loadDemoAccount(): LocalAccount {
  let pk: `0x${string}` | null = null
  try {
    pk = localStorage.getItem(KEY) as `0x${string}` | null
  } catch { /* storage unavailable */ }
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey()
    try { localStorage.setItem(KEY, pk) } catch { /* best effort */ }
  }
  return privateKeyToAccount(pk)
}

export function resetDemoAccount(): LocalAccount {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  return loadDemoAccount()
}
```

- [ ] **Step 2: Provider — one place that owns budget, receipts, confirm bridge, tool registration**

`apps/demo/components/TollboothProvider.tsx`:
```tsx
'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalAccount } from 'viem'
import {
  createBudget, createPaidFetch, registerPaywallTools,
  type Budget, type ConfirmDetails, type PaymentReceipt,
} from 'webmcp-x402'
import { loadDemoAccount } from '@/lib/wallet'

export interface PendingApproval extends ConfirmDetails {
  resolve: (approved: boolean) => void
}

interface TollboothContextValue {
  account: LocalAccount | null
  budget: Budget | null
  budgetVersion: number
  receipts: PaymentReceipt[]
  pending: PendingApproval | null
  webmcpActive: boolean
  paidFetch: ((url: string) => Promise<Response>) | null
  bumpBudget: () => void
}

const Ctx = createContext<TollboothContextValue | null>(null)
export const useTollbooth = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTollbooth outside provider')
  return v
}

const CONFIRM_TIMEOUT_MS = 120_000

export function TollboothProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<LocalAccount | null>(null)
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([])
  const [pending, setPending] = useState<PendingApproval | null>(null)
  const [webmcpActive, setWebmcpActive] = useState(false)
  const [budgetVersion, setBudgetVersion] = useState(0)
  const budgetRef = useRef<Budget>(createBudget({ capUsd: 0.5, autoApproveUnderUsd: 0 }))
  const receiptsRef = useRef<PaymentReceipt[]>([])
  const registered = useRef(false)

  useEffect(() => setAccount(loadDemoAccount()), [])

  const paidFetch = useMemo(() => {
    if (!account) return null
    return createPaidFetch({
      account,
      budget: budgetRef.current,
      confirm: (details) =>
        new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => { setPending(null); resolve(false) }, CONFIRM_TIMEOUT_MS)
          setPending({
            ...details,
            resolve: (approved) => { clearTimeout(timer); setPending(null); resolve(approved) },
          })
        }),
      onPayment: (e) => {
        receiptsRef.current = [...receiptsRef.current, e.receipt]
        setReceipts(receiptsRef.current)
        setBudgetVersion((v) => v + 1)
        window.dispatchEvent(new CustomEvent('tollbooth:payment', { detail: e }))
      },
    })
  }, [account])

  useEffect(() => {
    if (!account || !paidFetch || registered.current) return
    const ok = registerPaywallTools({
      account,
      budget: budgetRef.current,
      network: 'base-sepolia',
      mode: process.env.NEXT_PUBLIC_MOCK_MODE === '0' ? 'real' : 'mock',
      maxCapUsd: 5,
      paidFetch,
      receipts: () => receiptsRef.current,
      requestRefund: async (nonce, reason) => {
        const res = await fetch('/api/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce, reason }),
        })
        return (await res.json()) as { ok: boolean; status: string }
      },
    })
    registered.current = ok
    setWebmcpActive(ok)
  }, [account, paidFetch])

  const value = useMemo<TollboothContextValue>(
    () => ({
      account, budget: account ? budgetRef.current : null, budgetVersion,
      receipts, pending, webmcpActive, paidFetch,
      bumpBudget: () => setBudgetVersion((v) => v + 1),
    }),
    [account, budgetVersion, receipts, pending, webmcpActive, paidFetch],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

- [ ] **Step 3: Wrap layout**

In `apps/demo/app/layout.tsx`, wrap `{children}`:
```tsx
import { TollboothProvider } from '@/components/TollboothProvider'
// inside <body>:
<TollboothProvider>{children}</TollboothProvider>
```

- [ ] **Step 4: Build check**

Run: `pnpm --filter demo build`
Expected: compiles. (SDK must be built first: `pnpm --filter webmcp-x402 build`.)

- [ ] **Step 5: Commit**

```bash
git add apps/demo && git commit -m "feat(demo): demo wallet + TollboothProvider wiring SDK and WebMCP tools"
```

---

### Task 11: UI — article pages, approval sheet, wallet drawer

**Files:**
- Create: `apps/demo/components/ApprovalSheet.tsx`, `apps/demo/components/WalletDrawer.tsx`, `apps/demo/components/ArticleReader.tsx`
- Modify: `apps/demo/app/page.tsx`
- Create: `apps/demo/app/article/[slug]/page.tsx`

- [ ] **Step 1: Approval sheet**

`apps/demo/components/ApprovalSheet.tsx`:
```tsx
'use client'
import { useTollbooth } from './TollboothProvider'

export function ApprovalSheet() {
  const { pending } = useTollbooth()
  if (!pending) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl border border-b-0 border-amber-300 bg-white p-5 shadow-2xl dark:bg-zinc-900">
      <p className="text-sm font-semibold text-amber-600">Payment approval needed</p>
      <p className="mt-2 text-lg font-bold">
        Agent wants to pay ${pending.amountUsd.toFixed(2)} USDC
      </p>
      <p className="mt-1 text-sm text-zinc-500">{pending.description}</p>
      <p className="mt-1 text-xs text-zinc-400">
        Session: ${pending.spentUsd.toFixed(2)} spent of ${pending.capUsd.toFixed(2)} cap
      </p>
      <div className="mt-4 flex gap-3">
        <button
          data-testid="approve-payment"
          onClick={() => pending.resolve(true)}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"
        >
          Approve
        </button>
        <button
          data-testid="deny-payment"
          onClick={() => pending.resolve(false)}
          className="flex-1 rounded-lg bg-zinc-200 px-4 py-2 font-semibold dark:bg-zinc-700"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wallet drawer**

`apps/demo/components/WalletDrawer.tsx` — panel showing: wallet address (truncated) + "testnet-only demo wallet" label, mode badge (mock/real), budget cap + spent + auto-approve inputs (write through `budget.setCap` / `budget.setAutoApprove`, then `bumpBudget()`), receipt list (amount, resource, nonce truncated, BaseScan link `https://sepolia.basescan.org/tx/${txHash}` when txHash present), WebMCP status badge (`webmcpActive` ? 'Agent tools registered' : 'No WebMCP host detected'). Use `data-testid="wallet-drawer"`, `budget-cap-input`, `auto-approve-input`. Plain Tailwind card, no external libs.

- [ ] **Step 3: Article reader (human path = same paidFetch)**

`apps/demo/components/ArticleReader.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { PaymentDeniedError } from 'webmcp-x402'
import { useTollbooth } from './TollboothProvider'

export function ArticleReader({ slug, title, teaser, priceUsd, free }: {
  slug: string; title: string; teaser: string; priceUsd: number; free: boolean
}) {
  const { paidFetch } = useTollbooth()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    if (!paidFetch) return
    setBusy(true); setError(null)
    try {
      const res = await paidFetch(`/api/article/${slug}`)
      if (res.ok) setContent((await res.json()).content)
      else setError(`Server said ${res.status}`)
    } catch (e) {
      setError(e instanceof PaymentDeniedError ? `Payment ${e.reason}` : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="prose dark:prose-invert">
      <h1>{title}</h1>
      <p className="lead">{teaser}</p>
      {content ? (
        <p data-testid="article-content">{content}</p>
      ) : free ? null : (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="font-semibold">Premium article — ${priceUsd.toFixed(2)} USDC</p>
          <button data-testid="unlock-button" onClick={unlock} disabled={busy || !paidFetch}
            className="mt-3 rounded-lg bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            {busy ? 'Unlocking…' : `Unlock for $${priceUsd.toFixed(2)}`}
          </button>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
      )}
    </article>
  )
}
```
Free articles: fetch content on mount with the same `paidFetch` (no 402 → passthrough) or plain fetch.

- [ ] **Step 4: Pages**

`apps/demo/app/page.tsx`: server component; import `ARTICLES`; render hero ("Tollbooth Research — a paywall your agent can pay"), instructions block ("Ask your agent: *read the premium article about agent commerce*"), article card list linking to `/article/[slug]` with price badges, `<WalletDrawer/>` + `<ApprovalSheet/>`.

`apps/demo/app/article/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ArticleReader } from '@/components/ArticleReader'
import { ApprovalSheet } from '@/components/ApprovalSheet'
import { WalletDrawer } from '@/components/WalletDrawer'
import { bySlug, isFree } from '@/lib/articles'

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = bySlug(slug)
  if (!article) notFound()
  return (
    <main className="mx-auto max-w-2xl p-6">
      <ArticleReader
        slug={article.slug} title={article.title} teaser={article.teaser}
        priceUsd={Number(article.priceAtomic) / 1_000_000} free={isFree(article)}
      />
      <WalletDrawer />
      <ApprovalSheet />
    </main>
  )
}
```

- [ ] **Step 5: Manual verification (human path, mock mode)**

Run: `pnpm --filter demo dev`, open http://localhost:3000/article/agent-commerce → click Unlock → approval sheet appears → Approve → content renders, receipt appears in drawer. Then set auto-approve to 0.10 in drawer → unlock `webmcp-primer` → no sheet, instant unlock.

- [ ] **Step 6: Commit**

```bash
git add apps/demo && git commit -m "feat(demo): article UI, approval sheet, wallet drawer (human + agent share one payment path)"
```

---

### Task 12: `list_articles` tool + e2e smoke

**Files:**
- Modify: `apps/demo/components/TollboothProvider.tsx` (register site-specific tool)
- Create: `apps/demo/e2e/unlock.spec.ts`, `apps/demo/playwright.config.ts`

- [ ] **Step 1: Site-specific tool**

In `TollboothProvider` registration effect, after `registerPaywallTools(...)`, register one more tool via `getModelContext()`:
```ts
import { getModelContext } from 'webmcp-x402'
// after registerPaywallTools:
getModelContext()?.registerTool({
  name: 'list_articles',
  description: 'List all articles on Tollbooth Research with price and free/premium status.',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const res = await fetch('/api/articles')
    return { content: [{ type: 'text', text: JSON.stringify(await res.json()) }] }
  },
})
```

- [ ] **Step 2: Test hook for e2e/agent-less testing**

Also in the registration effect (guarded by `process.env.NEXT_PUBLIC_TEST === '1'`): collect registered tools into `window.__tollboothTools = { [name]: execute }` by registering through a small wrapper instead of calling `mc.registerTool` directly:
```ts
const toolBag: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {}
const wrap = (mc: ModelContext): ModelContext => ({
  registerTool(tool) {
    toolBag[tool.name] = tool.execute.bind(tool)
    return mc.registerTool(tool)
  },
})
// use wrap(realMc) when NEXT_PUBLIC_TEST === '1'; expose:
;(window as any).__tollboothTools = toolBag
```
When no real modelContext exists AND `NEXT_PUBLIC_TEST === '1'`, register into a stub `{ registerTool() {} }` so the bag still fills (lets Playwright drive tools without a WebMCP host).

- [ ] **Step 3: Playwright config + spec**

`apps/demo/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', screenshot: 'only-on-failure' },
  webServer: {
    command: 'NEXT_PUBLIC_TEST=1 pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
```

`apps/demo/e2e/unlock.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('human unlocks premium article via approval sheet (mock mode)', async ({ page }) => {
  await page.goto('/article/agent-commerce')
  await page.getByTestId('unlock-button').click()
  await expect(page.getByTestId('approve-payment')).toBeVisible()
  await page.getByTestId('approve-payment').click()
  await expect(page.getByTestId('article-content')).toContainText('PREMIUM CONTENT')
})

test('agent tool path: unlock_content pays after approval', async ({ page }) => {
  await page.goto('/article/webmcp-primer')
  const resultPromise = page.evaluate(async () => {
    const tools = (window as any).__tollboothTools
    const out = await tools.unlock_content({ url: '/api/article/webmcp-primer' })
    return JSON.parse((out as any).content[0].text)
  })
  await page.getByTestId('approve-payment').click()
  const result = await resultPromise
  expect(result.ok).toBe(true)
  expect(result.latestReceipt.nonce).toMatch(/^0x/)
})

test('budget deny is structured', async ({ page }) => {
  await page.goto('/article/micropayment-economics')
  const result = await page.evaluate(async () => {
    const tools = (window as any).__tollboothTools
    await tools.set_session_budget({ capUsd: 0.01 })
    const out = await tools.unlock_content({ url: '/api/article/micropayment-economics' })
    return JSON.parse((out as any).content[0].text)
  })
  expect(result.ok).toBe(false)
  expect(result.denied).toBe('budget_exceeded')
})
```

Add to `apps/demo/package.json` devDependencies: `"@playwright/test": "^1.48.0"`; script `"e2e": "playwright test"`. Run `pnpm install` and `pnpm --filter demo exec playwright install chromium`.

- [ ] **Step 4: Run e2e**

Run: `pnpm --filter demo e2e`
Expected: 3 passed (headless).

- [ ] **Step 5: Commit**

```bash
git add apps/demo && git commit -m "feat(demo): list_articles tool, test hooks, Playwright e2e smoke"
```

---

### Task 13: Deploy + cross-host verification + real mode

**Files:**
- Modify: `apps/demo/app/layout.tsx` (metadata: title/description), envs on Vercel

- [ ] **Step 1: Deploy to Vercel**

```bash
cd ~/Documents/webmcp-x402 && npx vercel link && npx vercel --prod
```
Set project root to `apps/demo` (monorepo: Vercel auto-detects with `pnpm`; if not, set Root Directory in dashboard). Env: `MOCK_MODE=1` (default anyway). Expected: production URL live; `curl -s -o /dev/null -w "%{http_code}" https://<url>/api/article/agent-commerce` → 402.

- [ ] **Step 2: Chrome 149 check**

Enable WebMCP flag (`chrome://flags`, search "WebMCP" / "model context"), open the prod URL, confirm drawer badge shows "Agent tools registered", drive the agent (Gemini-in-Chrome or DevTools MCP panel) to call `list_articles` then `unlock_content`. Record findings in `docs/02-RULES-CHECKLIST.md`.

- [ ] **Step 3: ChatGPT desktop check**

Open prod URL in ChatGPT's in-app browser, prompt: "Read the premium article about agent commerce and summarize it." Expect tool discovery → 402 → approval sheet → summary. This is the video take — screen-record it.

- [ ] **Step 4: Real-mode pass (optional but strong)**

Fund demo wallet with Base Sepolia USDC (Circle faucet https://faucet.circle.com, network Base Sepolia). Set `PAY_TO` to a wallet you control, `MOCK_MODE=0`, `NEXT_PUBLIC_MOCK_MODE=0`, verify facilitator settle path; fix `lib/settle.ts` field names against x402.org docs if they differ. Confirm BaseScan link works in receipt log. If facilitator integration fights back for >3h, ship mock-only and say so honestly in the description ("settlement adapter is one function; mock mode proves the protocol").

- [ ] **Step 5: Commit + tag**

```bash
git add -A && git commit -m "chore: deploy config, cross-host verification notes" && git tag v0.1.0
```

---

### Task 14: Publish SDK + submission collateral

- [ ] **Step 1: npm publish**

```bash
cd packages/sdk && pnpm build && npm publish --access public
```
Expected: `webmcp-x402@0.1.0` live. If name taken, fallback `tollbooth-x402` (update demo dep + docs).

- [ ] **Step 2: SDK README**

`packages/sdk/README.md`: the 10-line integration (register tools + one route returning 402), link to live demo + repo. This is judge-facing — keep it sharp.

- [ ] **Step 3: Push repo public**

```bash
gh repo create webmcp-x402 --public --source . --push
```

- [ ] **Step 4: Record video** per `docs/03-DEMO-VIDEO-SCRIPT.md`, upload YouTube public.

- [ ] **Step 5: Submit on Devpost** (form: description from `docs/00-STRATEGY.md` positioning + the four required description points from `docs/02-RULES-CHECKLIST.md`), then run the full judge-experience test list.

---

## Self-review notes

- Spec coverage: 402 detection (T2), micropayment signing (T4), human-in-the-loop + budget (T3, T5, T10, T11), zero-friction mock mode (T8, T9 — `MOCK_MODE=1` default), cross-platform (T13), SDK publish (T14), refund + crypto proof (T8, T9, T6 `request_refund`), video (T14). All original-strategy items have tasks.
- Type consistency: `PaymentRequirements`/`PaymentReceipt` defined once in SDK (T2), imported by demo; `ConfirmDetails` flows T5 → T10 → T11; `ModelContext` T6 → T12.
- Known intentional gaps: real-mode facilitator field names verified in T13 (documented), refund is mark-only (documented in code comment + description), in-memory store caveat commented in T8.
