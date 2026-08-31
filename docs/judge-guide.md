# Judge guide — test SpendMCP in under a minute

## 60-second path (no wallet, no funds, no setup)

1. Open the live URL in **ChatGPT's in-app browser** (or Chrome 149+ with the WebMCP flag enabled).
2. Copy the sample prompt from the page header:
   > Compare EV battery pack price trends across the available sources, but don't spend more than $0.20. Prefer the cheapest adequate source.
3. Watch: the agent discovers sources → previews for free → quotes → checks **your** policy → pays $0.04 with a real signed EIP-3009 authorization (settlement simulated in demo mode, clearly labeled) → the capability panel changes from **9 tools to 10** as `query_premium_dataset` registers dynamically → the agent queries the purchased rows and answers.
4. The pricier forecast source ($0.12) exceeds the default $0.05 per-transaction cap — the agent must ask you on the on-page approval sheet. Approve or deny; both paths are handled.

No agent host? The page is fully usable manually: Preview, Buy, the same approval sheet, a query form, and the spend ledger.

## Failure states worth trying (they're features)

- Ask the agent to buy the $0.12 forecast source → structured `per_tx_cap_exceeded` refusal; when it asks to raise your cap, **deny** on the sheet — nothing moves.
- Retry any purchase (same payment id) → the original receipt replays; spend doesn't change.
- Set auto-approve to 0 in the policy panel → every purchase now requires your click.
- Refresh mid-session → unlocked purchases and the ledger survive.

## What to look at

- **Dynamic capability surface**: the tool list genuinely changes after settlement (not a pre-registered tool returning "unauthorized").
- **Human control**: per-transaction cap, session budget, auto-approve threshold — the agent can lower them freely but raising them requires your on-page approval; the approval sheet and ledger are shared state both you and the agent see.
- **Payment integrity**: retry any purchase — the same payment identifier replays the original receipt instead of charging twice. Receipts bind the quote, the dataset's SHA-256, and the settlement, and the receipt/claim flow (`report_delivery_issue`) is honest about being merchant-resolved.
- **Mode badge**: demo vs real settlement is always labeled; in Real x402 Mode receipts link to BaseScan.

## Local run

```bash
pnpm install
pnpm --filter webmcp-x402 build
pnpm -r test                     # 131 unit tests
pnpm --filter workspace dev      # http://localhost:3000
pnpm --filter workspace e2e      # 15 Playwright tests (starts its own server on :3100)
E2E_CHANNEL=chrome E2E_PORT=3218 pnpm --filter workspace e2e  # installed Chrome 149+
# If :3100 is occupied: E2E_PORT=3217 pnpm --filter workspace e2e
```

## Where things live

- WebMCP tools: `apps/workspace/lib/tools.ts` (registration: `components/SpendMCPProvider.tsx`, via `navigator.modelContext ?? document.modelContext`)
- x402 client (402 → policy gate → EIP-3009 sign → retry): `packages/sdk`
- Server commerce (quotes, atomic purchase, idempotent replay, receipts, claims): `apps/workspace/app/api/*`, `apps/workspace/lib/*`
- Security posture, honestly stated: `SECURITY.md`, `docs/THREAT_MODEL.md`
