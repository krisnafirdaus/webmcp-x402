# Security Policy

SpendMCP is a hackathon demo (OpenAI WebMCP Challenge 2026) that handles **testnet-only** payments over synthetic data. It is not production payment infrastructure, and its trust boundaries are documented honestly in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Reporting

Found something anyway? Please open a GitHub issue (or contact the maintainer privately for anything sensitive). There is no bug bounty; there are also no real funds anywhere in this system — the demo wallet is a throwaway key holding Base Sepolia test USDC at most.

## Design principles applied

- **Payment details never come from the client or the agent.** Prices, recipients, and assets are bound server-side to a quote; tools only pass opaque ids (`quoteId`, `paymentId`).
- **Signatures are narrow.** EIP-3009 `TransferWithAuthorization` authorizes one bounded transfer (amount, recipient, expiry ≤ 3600s clamped, single-use nonce) — no allowances, no unlimited approvals.
- **The server verifies everything against its own state**: signature recovery, recipient, amount, validity window, network binding (foreign-chain signatures rejected), nonce replay log, quote expiry/consumption (atomic), idempotency replay.
- **The client enforces policy as UX, the server enforces limits as security** (per-IP daily purchase/spend guard; pattern-gated payment identifiers).
- **Untrusted input discipline**: all tool arguments and all HTTP payloads are shape-validated before use; budget arithmetic rejects non-finite/negative amounts; asset allowlist prevents cross-token signature abuse.
- **WebMCP tool invocation is never treated as authenticated identity** (see threat model).

## Out of scope by design

Mainnet anything, real customer funds, multi-instance store consistency, DoS resistance beyond a demo-grade token bucket, and wallet custody beyond a labeled throwaway localStorage key.
