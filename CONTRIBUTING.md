# Contributing

SpendMCP is a WebMCP Challenge 2026 entry — small, focused, and reviewed hard. Contributions are welcome after the judging window (Sep 21, 2026); before that, issues are the best way to help.

## Ground rules

- Read `docs/THREAT_MODEL.md` first. Several "obvious improvements" (a refund button, pre-registered premium tools, payment parameters on tools) are deliberately absent — the docs say why.
- Payment details never travel through tool parameters. Any PR adding a URL, amount, recipient, or asset parameter to a WebMCP tool will be declined.
- Tests are the contract: `pnpm -r test` (unit) and `pnpm --filter workspace e2e` (Playwright, spawns its own server on :3100) must stay green, and behavioral changes need a test that fails without them.
- TypeScript strict, no new runtime dependencies in `packages/sdk` beyond viem.

## Setup

```bash
pnpm install
pnpm --filter webmcp-x402 build
pnpm -r test
pnpm --filter workspace dev
```

License: Apache-2.0. By contributing you agree your contributions are licensed under it (see `LICENSE`, `NOTICE`).
