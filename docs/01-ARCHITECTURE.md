# Architecture v2 — SpendMCP / Paid Research Workspace

Supersedes v1 (article paywall). SDK primitives (types, 402 detection, budget, EIP-3009 signing, paidFetch) carry over unchanged; the product layer above them is new.

## Components

```
┌───────────────────────────── Browser tab ─────────────────────────────┐
│  Agent host (ChatGPT in-app browser / Chrome 149+)                     │
│      │ calls WebMCP tools                                              │
│      ▼                                                                 │
│  navigator.modelContext ?? document.modelContext                       │
│      ▲ static tools registered on load        ▲ dynamic tools          │
│      │ (discover/preview/quote/policy/        │ (query_premium_dataset │
│      │  purchase/receipts/report_issue)       │  per purchased id)     │
│  ┌───┴───────────────────────────────────────┴───┐                    │
│  │ Workspace commerce layer (apps/workspace)      │                    │
│  │  policy store · approval bridge · ledger ·     │                    │
│  │  dynamic tool registrar · idempotency keys     │                    │
│  └───┬────────────────────────────────────────────┘                    │
│      ▼ uses                                                            │
│  webmcp-x402 SDK (packages/sdk)                                        │
│   parsePaymentRequired · createBudget · buildPaymentHeader ·           │
│   createPaidFetch (402 → policy gate → confirm → sign → retry)         │
│                                                                        │
│  UI: source cards · preview modal · policy panel · approval sheet ·    │
│      spend ledger · mode badge · locked→verified→unlocked states       │
└──────┬─────────────────────────────────────────────────────────────────┘
       ▼ HTTP
  Next.js server (apps/workspace)
   GET  /api/resources                     discovery (free)
   GET  /api/resource/[id]/preview         metadata + sample rows (free)
   POST /api/quote        {resourceId}   → {quoteId, requirements, expiresAt}
   GET  /api/purchase/[quoteId]            402 gate → verify → settle → data grant
   GET  /api/resource/[id]/data?...        requires proven purchase (grant token)
   GET  /api/receipt/[paymentId]           delivery-bound receipt
   POST /api/report-issue                  claim filing
       │ real mode only
       ▼
  x402 facilitator → Base Sepolia (USDC settle)
```

## Commerce flow (quote-bound x402, exact scheme)

1. **Quote.** `get_quote` → `POST /api/quote` → server issues `{quoteId, expiresAt (120s), requirements}` where `requirements` is a standard x402 `accepts` entry whose `resource` is `/api/purchase/{quoteId}` and whose price is the posted price at quote time. Quotes are stored server-side; price cannot drift between quote and purchase.
2. **Policy check.** `purchase_access(quoteId, idempotencyKey)` first re-validates client-side: quote unexpired, network/asset allowlisted, `priceUsd ≤ perTxCapUsd`, `spent + price ≤ sessionCapUsd`. Violations return structured refusals without any signing.
3. **Pay.** paidFetch hits `/api/purchase/{quoteId}` → 402 with the stored requirements → policy gate decides auto / confirm (on-page sheet, 120s timeout) / deny → EIP-3009 `TransferWithAuthorization` signed (bounded: amount, recipient, expiry ≤300s, single-use 32-byte nonce) → retry with `X-PAYMENT`.
4. **Verify + settle (server).** Signature recovers `from`; `to == payTo`, `value ≥ price`, time window valid, nonce unseen, quote exists/unexpired/unconsumed, idempotencyKey unseen (if seen → return the original receipt, 200, **no second settlement**). Mock mode stops after verification (signature is real proof of intent); real mode calls facilitator `/verify` + `/settle` before granting.
5. **Grant + receipt.** Server marks quote consumed, stores the payment record, returns the data-access grant plus `X-PAYMENT-RESPONSE` (base64) and the receipt.
6. **Dynamic registration.** On success the client registers `query_premium_dataset` scoped to that resourceId and flips UI state Locked → Verified → Tool unlocked.

## Receipt = proof of delivery

```json
{
  "paymentId": "pay_…", "quoteId": "q_…", "resourceId": "ev-batt-cells-daily",
  "resourceHash": "sha256:…", "amountUsd": 0.04, "amountAtomic": "40000",
  "asset": "USDC (0x036C…)", "network": "base-sepolia",
  "payer": "0x…", "recipient": "0x…",
  "nonce": "0x…", "idempotencyKey": "…",
  "settlement": { "mode": "mock" | "real", "txHash": "0x…?" },
  "issuedAt": "…", "quoteExpiresAt": "…"
}
```

`resourceHash` = SHA-256 of the exact dataset payload granted; ties what was paid for to what was delivered. `report_delivery_issue(paymentId, reason)` validates the paymentId exists, one claim max, returns claim status — merchant-resolved, no fake automatic refund.

## Dynamic tool lifecycle (the WebMCP leverage)

- Page load registers the 9 static tools (strategy doc lists the surface).
- `registerTool` handles are kept per-resource; after purchase, `query_premium_dataset` for that resource is added. If the host returns unregister handles, they're kept for symmetry; nothing is ever silently re-registered twice (registrar tracks names).
- Feature-detect `navigator.modelContext ?? document.modelContext`; if absent, banner "No WebMCP host detected" and everything remains human-usable.
- Test hook (`NEXT_PUBLIC_TEST=1`): all registered tools mirrored into `window.__spendmcpTools` so Playwright can drive the agent path headlessly.

## Datasets (self-contained, no external APIs)

Three synthetic-but-plausible premium sources on one theme (EV battery price indices) + one free source, defined in `lib/resources.ts` with: id, title, provider, priceAtomic, coverage, freshness, sampleRows (preview), fullData (rows the query tool aggregates), computed sha256. Query tool supports metric selection + date range + simple aggregate so the agent's final analysis is real computation, not a canned string.

## Policy & security model

- Demo wallet: viem key in localStorage, testnet-only labeling, hard-coded testnet chainIds; regenerate/reset button.
- Client enforces policy (SDK budget + per-tx cap + allowlist) AND server enforces posted price + quote binding — neither trusts the other.
- Replay: single-use nonce (server log) + quote consumed-flag + idempotencyKey map. Retry-safe by construction: same idempotencyKey → same receipt.
- Rate limit demo mode per IP (simple token bucket) so judges can't drain anything meaningful.
- In-memory stores (quotes, payments, claims, nonces) with the serverless caveat documented; acceptable for the demo, noted honestly in README.

## Modes

| | Instant Demo Mode (default) | Real x402 Mode |
|---|---|---|
| Signature | real EIP-3009 | real EIP-3009 |
| Verify | full | full + facilitator |
| Settle | skipped (labeled) | Base Sepolia USDC, BaseScan link |
| Judge setup | none | funded demo wallet (faucet link in UI) |
| Switch | `MOCK_MODE=1` | `MOCK_MODE=0` + `FACILITATOR_URL` + `PAY_TO` |

Every receipt and the header badge state the mode explicitly. Real mode is exercised before submission and shown in the video.

## Stack

TypeScript strict everywhere; SDK: viem only, tsup, vitest. App `apps/workspace`: Next.js 16 App Router, Tailwind, vitest (server libs), Playwright (agent-path e2e via test hook). Deploy: Vercel. Package publish = post-polish extraction under own scope, optional.
