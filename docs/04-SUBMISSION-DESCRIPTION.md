# SpendMCP — Devpost submission copy

## Tagline

Human-controlled payments for paid web tools.

## Short description

SpendMCP is a browser-native payment and permission layer that lets AI agents purchase premium web capabilities within budgets set by a person. In the demo, a research agent compares paid EV-battery datasets, previews them for free, buys the cheapest adequate source with an x402 USDC authorization, and unlocks a new WebMCP query tool. The person controls per-purchase and session limits, handles approval requests on the shared page, and can inspect a delivery-bound receipt for every purchase.

## Full description

### The problem

Research agents can discover valuable information but still fail at the moment of purchase. A normal paywall sends them into signup forms and card checkout built for human hands. Fully autonomous payment is the wrong answer: people need to control what an agent may buy, how much it may spend, and what happened when a request is retried.

SpendMCP turns that dead end into delegated purchasing. The agent decides which source is worth buying; the person defines the economic authority.

The surrounding supply already exists: Coinbase documents pay-per-request APIs and agent-paid access as x402 use cases, and an independent CC BY 4.0 directory snapshot from 2026-08-29 lists 575 services, 3,532 endpoints, and 522 payment-ready services. These figures validate machine-payable supply, not SpendMCP adoption; the reproducible snapshot and caveats are published in `docs/05-IMPACT-EVIDENCE.md`.

### Why this is a strong fit for WebMCP

The important state already lives on the page: available sources, free previews, the person's spending policy, approval requests, unlocked resources, and the receipt ledger. WebMCP lets the person and agent work against that same live state and session through typed tools instead of screen-scraping.

The integration is deliberately non-trivial. Nine discovery, preview, policy, purchase, and receipt tools register at page load. After a verified payment, the page dynamically registers a tenth tool, `query_premium_dataset`. Payment changes the capability surface itself; the premium query tool is not pre-registered behind an authorization error. An on-page panel makes the 9 → 10 tool transition visible to both the person and the judges.

### How it creates a better user experience

The agent can preview coverage, freshness, metrics, sample rows, and price before spending anything. A quote includes the current policy verdict, so an in-policy purchase can complete without interruption while an out-of-policy request is refused or routed to an approval sheet on the page. The person always sees the per-transaction cap, session budget, running spend, wallet mode, and receipt ledger.

Instant Demo Mode requires no account, wallet, or funds. It uses a generated testnet wallet and real EIP-3009 signatures while clearly labeling settlement as simulated. The same workflow also has a Real x402 Mode for Base Sepolia. The entire human flow remains usable without an agent.

### What people and agents can do together now

Before SpendMCP, the agent could recommend a paid source but the task stopped at checkout, or the person had to hand over broad payment authority. With SpendMCP, they split the work cleanly:

- The agent discovers and compares sources, decides what is adequate, requests a quote, and uses purchased data.
- The person sets durable limits, approves exceptions in context, and audits spend and delivery.
- The page enforces the boundary between reasoning and payment, then exposes the newly purchased capability to the agent.

This makes a paid research task completable end to end without hiding economic decisions from the person or forcing them through checkout for every micropurchase.

### How WebMCP and x402 are implemented

The page registers typed JavaScript WebMCP tools through `navigator.modelContext ?? document.modelContext`. Tool inputs use narrow schemas and server-side validation; publisher content is marked untrusted. A successful purchase calls an x402 flow that parses the HTTP 402 requirements, checks the user's policy, produces a bounded EIP-3009 authorization, verifies the signature and quote server-side, consumes a single-use nonce, and returns a receipt bound to the delivered dataset hash.

Authority is separated across five parts: reasoning agent, policy engine, deterministic signer, receipt verifier, and audit ledger. The agent passes opaque resource and quote identifiers; it cannot choose the payment amount, recipient, asset, or network. Idempotency keys make retries return the original receipt instead of charging twice.

### Evidence

- 131 unit tests and 15 Playwright end-to-end tests pass.
- The E2E suite proves the full research flow, dynamic 9 → 10 tool registration, both agent- and human-initiated purchases, approval and denial, replay without re-spend, receipt lookup, delivery claims, refresh persistence, and structured rejection of invalid tool input.
- A stale-session regression proves that a browser cache cannot restore the premium tool after the server's authoritative demo grant is gone.
- A reset regression proves that starting over returns the browser to the nine-tool baseline instead of leaving a stale premium capability registered.
- External market context is limited to cited open evidence; the runtime uses synthetic datasets and makes no publisher-adoption claim.
- The production build compiles cleanly, and the live demo works without signup or funds.
- The repository is public under Apache-2.0 and includes architecture, threat-model, security, judge, and local-run documentation.

## How to test in under a minute

1. Open https://spendmcp-x402.vercel.app in ChatGPT's in-app browser.
2. Copy the prompt shown at the top of the page and send it to the agent.
3. Watch the agent preview sources and purchase the $0.04 dataset under the default policy.
4. Confirm that the capability panel changes from 9 tools to 10 and that `query_premium_dataset` appears.
5. Ask for the $0.12 forecast source and deny the requested policy increase to see the safety boundary.

No wallet, funds, account, or setup is required.

## Technologies used

WebMCP, x402, EIP-3009, USDC on Base Sepolia, TypeScript, Next.js 16, React 19, viem, Vitest, Playwright, Vercel.

## Links

- Live demo: https://spendmcp-x402.vercel.app
- Source: https://github.com/krisnafirdaus/webmcp-x402
- Demo video: https://youtu.be/wgjWTSeXIKM
