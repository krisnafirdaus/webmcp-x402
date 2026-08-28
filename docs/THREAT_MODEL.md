# Threat Model

Honest accounting of what SpendMCP defends against, what it deliberately does not, and why the residual risk is acceptable for a testnet demo with synthetic data. Written for reviewers and judges; every mitigation below is covered by a unit or e2e test in this repo.

## Assets & context

- **Money:** Base Sepolia test USDC only. The demo wallet is a browser-generated throwaway key. Nothing here can lose real funds.
- **Data:** synthetic EV-battery datasets generated in `apps/workspace/lib/resources.ts`. A "leak" leaks nothing real.
- **Reputation asset:** the integrity of the payment flow itself — this is a payments demo, so a bypass or double-charge is the thing that actually matters.

## Trust boundaries

1. **Agent/tool input → page.** All WebMCP tool arguments are untrusted. Schemas declare constraints (`additionalProperties: false`, patterns, maxLength), but schemas are host cooperation, not enforcement — every `execute()` re-validates before acting. No tool accepts URLs, amounts, recipients, or assets as parameters; payment details resolve server-side from `quoteId`.
2. **Browser → server.** Every HTTP payload is hostile until proven otherwise: X-PAYMENT headers are shape-checked field-by-field (regex before BigInt), signatures verified against **server-built** requirements, the EIP-712 domain is bound to the **server's** network (a base-mainnet signature cannot satisfy a base-sepolia quote), nonces are single-use, quotes are consumed atomically (synchronous check-and-set, no await in the window), settlement failure rolls back both nonce and quote.
3. **Server → client.** Facilitator-supplied `txHash` and receipt fields are treated as display data; the UI builds explorer links only through `safeTxHash()` (`/^0x[0-9a-fA-F]{64}$/`).
4. **WebMCP caller ≠ authenticated identity.** There is no cryptographically verified agent identity in current WebMCP. Authorization here = possession of valid capabilities (quote ids, payment ids) + a verified x402 payment — never "the tool was called, so it must be the user's agent."

## Specific attacks considered and mitigated

| Attack | Mitigation (tested) |
|---|---|
| Malicious 402 body poisons the budget (NaN/negative amounts) | digits-only filter at parse; budget rejects non-finite/negative (deny/throw) |
| Server-supplied `maxTimeoutSeconds` creates a near-eternal signed authorization (incl. string-concat via type lie) | clamped to [60, 3600] via numeric coercion |
| Cross-chain signature reuse (sign for chain A, spend against chain B's quote) | network equality check + domain chainId always from server requirements |
| Cross-token signing (402 names EURC etc. while priced as USDC) | per-network asset allowlist checked before budget/confirm/signing |
| Concurrent payments jointly overspend the session budget | client pay-section serialized per instance; post-confirm re-check |
| Two payments consume one quote (TOCTOU) | atomic `consumedBy` check-and-set before settle; loser's nonce released |
| Replay of a captured X-PAYMENT header | server nonce log (single-use), 410 on consumed quote |
| Double-charge on retry | x402 payment-identifier idempotency: same client id returns the original receipt without verify/settle/spend-count |
| Free unlock by guessing someone's payment identifier | route rejects identifiers not matching `^pay_[a-zA-Z0-9_-]{8,128}$`; client always generates `pay_<uuid-hex>`; server record ids are crypto-random (no enumeration) |
| Prompt-injected agent raises its own spending limits | agent-path policy mutations clamp to human-set baselines; raises require an on-page human approval sheet (two independent layers) |
| Prompt-injected agent pays an attacker's address/amount | impossible by construction: no tool parameter carries recipient/amount/asset; worst case is buying an allowlisted catalog resource within policy |
| Runaway agent drains the demo | per-IP daily guard (25 purchases / $2) server-side; session budget client-side |

## Accepted residual risks (deliberate, demo-grade)

- **Bearer-capability model.** `paymentId`/`clientPaymentId` are bearer tokens; the receipt and data routes are unauthenticated. A leaked id grants access to the (synthetic) dataset and receipt metadata. Ids are unguessable (128-bit), but interception = access. Real deployment would bind capabilities to an authenticated session.
- **Demo wallet key in localStorage.** Intentional zero-friction tradeoff, testnet-only, prominently labeled, resettable. Never do this with real funds.
- **In-memory stores** (quotes, payments, nonces, claims, ip guard). Per-server-instance; on serverless, replay/idempotency guarantees weaken across instances and state resets on redeploy. Fine for a demo; a real system needs a database with the same atomicity discipline (`UNIQUE(quote_id)`, `UNIQUE(client_payment_id)`).
- **X-Forwarded-For is spoofable** and the per-IP guard is not atomic across awaits; UTC day rollover allows a boundary reset. It is runaway-loop protection, not adversary-proof rate limiting.
- **One-shot tool registration.** Tools register at page load; a host injecting `modelContext` after load needs a reload (badge tooltip says so).
- **Claims are merchant-resolved status records**, not automatic refunds. Core x402 has no universal refund primitive; we do not fake one.
- **Payment lifecycle is a 3-state field** (`settled`/`delivered`/`failed`) rather than the full state machine a production system would want; the full machine is documented as future work here.

## Future work (beyond the challenge)

Authenticated sessions binding capabilities; durable store with row-level atomicity; signed offers & receipts per the x402 extension; facilitator failover; real refund lifecycle via authorization/capture; per-merchant allowlists in the client policy.
