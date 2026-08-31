# Strategy v2 — SpendMCP: Human-Controlled Payments for Paid Web Tools

Supersedes v1 (Tollbooth article paywall — see git history). Revised 2026-08-27 after a judge-perspective review scored v1 at ~6.8–7.2/10 with the core criticism: **WebMCP looked like an accessory to x402, not the heart of the product.** v2 fixes that.

## The one-liner

> A browser-native payment and permission layer that lets agents purchase authorized web capabilities within user-defined budgets.

Never frame this as "bypassing paywalls" — that reads as circumvention. The publisher defines prices, resources, recipients, and which tools unlock. This is infrastructure for legitimate agent commerce. The hero is **delegated payment with visible human control**, not autonomous payment: the WebMCP explainer explicitly says fully autonomous workflows without human oversight are not the goal.

## Why v1 would have lost, and what v2 changes

| v1 weakness | v2 answer |
|---|---|
| "Unlock article" flow = a fetch wrapper could do it; WebMCP trivial | **Dynamic tool lifecycle**: payment changes the capability surface. Before purchase the page registers discovery/quote/policy tools only; after settlement it registers `query_premium_dataset` etc. for that resource. UI mirrors it: Locked → Payment pending → Verified → Tool unlocked. This is only possible with WebMCP's in-page tool registration. |
| Mock-only settlement = "visual prototype" | Dual mode, both first-class: **Instant Demo Mode** (default; demo wallet, real signatures, mock settle, rate-limited) and **Real x402 Mode** (Base Sepolia settlement via facilitator, BaseScan receipt). Prominent mode indicator on every receipt. |
| tx hash presented as security feature | Receipts are **proof of delivery, not just payment**: bind quoteId, resourceId, resourceHash, amount, asset, network, payer, recipient, paymentId/settlementId, idempotencyKey, expiresAt. |
| `request_refund` overclaimed (core x402 has no universal refund) | Honest MVP: `report_delivery_issue(paymentId, reason)` — files a claim the merchant resolves. No fake refund button that only flips a DB flag while claiming funds moved. |
| SDK-first ambition risks Execution | Product first. `packages/sdk` stays an internal workspace package; extract/publish a small package only after the app is polished, under our own scope (never `@webmcp/*` — implies official). |
| "80–100% win odds" framing | Honest: ~2,668 registrants, 10 prizes. Target: be clearly in the "serious candidate" band (8.7–9.2/10 profile), which requires everything in "Must ship" below. |

## The demo: Paid Research Workspace

User says: *"Compare EV battery price trends from the available sources, but don't spend more than $0.20."*

The agent then: discovers 3 premium data sources → previews each (coverage, freshness, sample rows — free) → compares and recommends → gets a quote ($0.04) → checks it against the user's spending policy → auto-pays or asks approval on-page → x402 payment (402 → signed EIP-3009 authorization → verify → settle) → receipt appears in the ledger → **new tool `query_premium_dataset` registers dynamically** → agent queries the data and delivers the analysis → UI shows results + remaining budget.

Three layers visible at once — WebMCP (discovery, shared page state, dynamic tools), x402 (payment + settlement), human-agent collaboration (policy, approval, ledger, audit).

The page must be fully useful to a human without an agent: browse sources, preview, buy with the same policy UI, query purchased data through forms.

## Tool surface

Registered from page load:

```
discover_paid_resources(query?)          → sources with price, coverage, freshness
preview_resource(resourceId)             → free metadata + sample rows
get_quote(resourceId)                    → { quoteId, priceUsd, expiresAt, terms }
set_spending_policy(policy)              → lowers apply instantly; raises need on-page human confirm
get_spending_policy()                    → current policy + session ledger
purchase_access(quoteId, idempotencyKey) → pays via x402 within policy; returns receipt
list_unlocked_resources()                → what's purchased this session
get_payment_receipt(paymentId)           → full delivery-bound receipt
report_delivery_issue(paymentId, reason) → files a claim, returns claim status
```

Registered dynamically after each successful purchase:

```
query_premium_dataset(resourceId, metric?, range?) → actual rows/aggregates
```

`purchase_access` must refuse, with structured reasons: quote expired · price changed · asset/network not allowed · recipient mismatch · per-transaction cap exceeded · session budget exceeded · idempotency key already used (returns the original receipt instead of double-charging) · settlement failed · resource unavailable.

## Spending policy model (the human-control story)

Three modes, user-owned: **ask every time** · **auto-approve under per-tx threshold** · **block when session budget exhausted**. Plus per-transaction cap and session cap; policy panel shows: price, per-tx limit, session remaining, "Allowed by user policy" status. Agent may lower limits; raising triggers the on-page approval sheet. Approval sheet shows amount, resource, running ledger.

## Judge questions the demo must answer by itself

1. Only possible because of WebMCP? → dynamic capability surface + shared on-page state/approvals.
2. Why not a backend MCP or x402 fetch wrapper? → tools live where the session, UI state, and the human already are; approvals happen on the page both parties see.
3. What does the human see/control? → policy panel, approval sheet, ledger, mode indicator.
4. Overspend prevention? → per-tx + session caps enforced client-side AND server refuses quotes beyond posted price.
5. Duplicate charges? → idempotencyKey + single-use EIP-3009 nonce; retry returns original receipt.
6. Bad/empty data? → resourceHash in receipt + report_delivery_issue flow, demoable error state.
7. Real transactions or animation? → Real x402 Mode with BaseScan link; demo mode clearly labeled.
8. Testable in one minute without a wallet? → Instant Demo Mode, zero setup.
9. Useful for humans without an agent? → yes, same flows via UI.
10. Can another developer adopt it? → small internal package + integration notes in README (extraction, not the headline).

## Priorities

**Must ship (in order):** one polished use case end-to-end · live URL with zero-setup demo mode · non-trivial WebMCP tools · **dynamic tool registration on payment state** · one real x402 transaction on Base Sepolia · spending policy + approval + ledger · idempotency/duplicate-charge protection · visible delivery-bound receipts · a deliberately demoable error state (expired quote, over-budget refusal) · public repo, license, setup docs · video <3 min with audio.

**If time remains:** extract small reusable package · merchant integration example · compatibility test notes (ChatGPT desktop + Chrome 149).

**Cut without hesitation:** multiple chains · universal wallet abstraction · marketplace · publisher dashboard · DAO/dispute anything · automatic refunds without a real payment lifecycle.

## Official judging criteria mapping

The WebMCP Challenge rules use four equally weighted criteria. WebMCP Leverage is also the first tie-breaker, so judge-facing material should present evidence in this order:

| Criterion | SpendMCP evidence | Remaining risk |
|---|---|---|
| **WebMCP Leverage** | Nine useful tools share live page/session state; a verified purchase dynamically registers `query_premium_dataset`; the on-page panel visibly changes 9 → 10. | Must still be shown clearly in the final video and verified in both supported judge hosts. |
| **Execution** | Zero-setup live app; agent and human paths; policy, approval, ledger, delivery-bound receipts; 131 unit + 15 E2E tests. | Final public video is intentionally left to the submission owner. |
| **Potential Impact** | Solves a specific paid-research failure; official x402 use cases plus an attributed open-directory snapshot establish that machine-payable API supply exists at micropayment prices. | No SpendMCP publisher integration or user-time/cost study yet; evidence must remain market context, not an adoption claim. |
| **Creativity & Ambition** | Combines browser-native tool discovery, delegated micropayment, visible authority boundaries, and payment-driven capability registration. | Agent payments are an emerging category; novelty must be demonstrated through the capability lifecycle, not claimed from x402 alone. |

Source of truth: the current Devpost Official Rules. If the OpenAI landing page, a plugin, or this repository conflicts with those rules, follow the Official Rules.

## Open source & license (advisory pass 2)

Challenge requires a public repo with a clearly detectable OSS license — private/source-available does not qualify. License: **Apache-2.0** (x402's own license; explicit patent grant; commercial use stays open). Business shape after the challenge: open core + managed service (policy engine, wallets, dashboards, audit) — "source free, pay to not operate the infrastructure." Never `@webmcp/*` package scope; use `@spendmcp/*`. Repo ships SECURITY.md, THREAT_MODEL.md, .env.example, judge-guide — judges may score from README + video alone, so both are product surface.

**Tie-breaker note:** with equal weights, WebMCP Leverage is the first tie-breaker — when cutting scope, cut blockchain polish before cutting the tool surface, dynamic registration, or shared-state UX.

## Winner-pattern addendum (advisory pass 3, 2026-08-28)

Cross-hackathon analysis (Claude Opus 4.7/4.8 hackathons, OpenAI Build Week 2026) shows winners share: a narrow painful problem, AI on the genuinely hard part, **explicit authority boundaries** (AI assists, human authorizes — Second Voice, veTriage, Sentinel), evidence over claims (test suites, measurable numbers), one end-to-end workflow, and a demo legible in seconds. Applied here:

- Framing = **research purchasing agent** completing a real analysis under a delegated budget — not "AI pays paywalls."
- The five-part authority split (reasoning agent / policy engine / deterministic signer / receipt verifier / audit ledger) is now named explicitly in README and the closing video slide.
- Evidence is quantified (automated test count incl. the adversarial cases) and failure states are part of the demo: the **safety moment** (over-cap refusal + human deny) has its own 15s in the video script v3.
- Closing line: "WebMCP makes the paid web agent-accessible. x402 makes access programmable. Humans keep economic control."

## Deadline & cadence

Submit Devpost by **Sep 2 evening** (hard close Sep 3, 13:00 PT / Sep 4 ~03:00 WIB). Judging Sep 4–21: app must stay live and free. Day plan: D1–2 SDK core + workspace backend (quotes, purchase, idempotency) · D3 policy + approval + ledger UI · D4 dynamic tools + query tools + error states · D5 deploy, real-mode pass, cross-host test (ChatGPT desktop, Chrome 149) · D6 video + description · D7 submit + buffer.
