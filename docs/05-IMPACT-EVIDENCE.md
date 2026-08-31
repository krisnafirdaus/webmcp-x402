# Impact evidence — reproducible, bounded claims

This document separates what SpendMCP proves today from what still needs independent user research. The evidence is public and repeatable; it is not presented as a five-user study or publisher adoption claim.

## Measured result

Verified on 2026-08-31 with Google Chrome 152.0.7977.64 and Playwright 1.62.1:

| Claim | Executable evidence | Result |
| --- | --- | --- |
| Payment changes the agent's usable capability surface | Agent and human purchase flows assert `9 tools live` before payment and `10 tools live` after settlement, with `query_premium_dataset` added dynamically | Pass |
| A retry does not spend twice | The replay scenario reuses the same payment identifier, returns the original receipt, and leaves session spend unchanged | Pass |
| Human authority is enforced | Separate scenarios cover over-cap refusal, explicit deny with zero spend, policy-raise approval, and purchase approval | Pass |
| State survives ordinary navigation | Purchased access, receipts, and policy survive refresh | Pass |
| A browser cache cannot outlive the authoritative grant | A stale saved payment is rejected during restore; the app clears spend, receipts, and the premium tool before WebMCP registration | Pass |
| Delivery accountability remains attached to payment | Receipt lookup and one-claim-per-payment issue reporting complete round trips | Pass |
| Browser compatibility is current | All 15 end-to-end scenarios ran against installed Google Chrome 152 (newer than the Chrome 149 target) | 15/15 pass in 11.4 s |
| Core and adversarial logic is pinned | SDK and workspace Vitest suites cover signatures, asset/network binding, quote expiry, races, rollback, bearer identifiers, and facilitator request shape | 131/131 pass |
| Starting over creates a genuinely fresh capability session | The reset scenario buys access, observes tool 10, starts over, then asserts the resource is locked and only the nine static tools remain | Pass |

## External market context — open evidence, not an adoption claim

SpendMCP's runtime catalog remains synthetic. No third-party commercial dataset, response body, logo, or publisher content is bundled or resold.

The surrounding problem is nevertheless externally observable:

- Coinbase's official x402 documentation names pay-per-request APIs, paid digital content, and AI agents that autonomously pay for API access as first-class use cases: https://docs.cdp.coinbase.com/x402/welcome
- An independent x402 directory snapshot from 2026-08-29 lists **575 services**, **3,532 endpoints**, **522 payment-ready services**, **172 new services in 30 days**, and a **$0.01 median endpoint price**: https://x402-list.com/api/v1/stats

The exact snapshot used here is preserved at [`docs/assets/x402-ecosystem-snapshot-2026-08-29.json`](assets/x402-ecosystem-snapshot-2026-08-29.json). The directory data is CC BY 4.0 and attributed in `NOTICE`.

This evidence establishes that machine-payable API supply exists at micropayment prices. It does **not** establish SpendMCP adoption, publisher willingness to integrate with SpendMCP, market size, or production savings. The directory is independent rather than an official ecosystem census, and payment-ready inventory is not the same as customer demand.

## Base Sepolia settlement proof

A real x402 settlement was completed on Base Sepolia on 2026-08-28 for the `ev-batt-cells-daily` resource:

- Amount: 0.04 testnet USDC (40,000 atomic units)
- Payer: `0x142Fb187Ba6C0D17C79BA3e9cb78b1C26D51A07A`
- Recipient: `0x1111111111111111111111111111111111111111`
- USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Settlement status: successful (`0x1`)
- Transaction: https://sepolia.basescan.org/tx/0xd29ec7c8113b1ee7a392a72e0668bff4bd891314f3796d4f7c9bbe9a64510a19
- Application receipt: `pay_938be1f591da45e4a51d40902486b8e1`, delivered with 62 rows and the premium query tool registered after settlement

The payer balance changed from 20.00 to 19.96 testnet USDC, matching the quoted amount exactly. Testnet assets have no monetary value.

## Reproduce

```bash
pnpm install
pnpm --filter webmcp-x402 build
pnpm -r test
E2E_CHANNEL=chrome E2E_PORT=3218 pnpm --filter workspace e2e
```

The default E2E command uses Playwright's bundled Chromium. Setting `E2E_CHANNEL=chrome` switches the exact same scenarios to the locally installed stable Chrome binary.

## Public verification surface

- Live app: https://spendmcp-x402.vercel.app
- Source and tests: https://github.com/krisnafirdaus/webmcp-x402
- Judge path: open the live app, observe 9 registered tools, buy the $0.04 source in Instant Demo Mode, then observe 10 registered tools and query the unlocked dataset.

## Claim boundary

These results prove implementation behavior, browser compatibility, a publicly repeatable workflow, and the existence of a broader machine-payable API supply. They do **not** yet prove SpendMCP publisher demand, time saved in production, willingness to pay, or usability across an independent participant cohort. Those require external participants; no such numbers should appear in the submission until the study has actually run.

A minimal external protocol is ready: give five participants only the live URL and the sample prompt, record task completion, time to first useful paid row, approval errors, and whether they can explain the budget boundary afterward. The fixed script, coding rules, public response form, and truthful reporting template are documented in [`docs/06-EXTERNAL-VALIDATION.md`](06-EXTERNAL-VALIDATION.md). No independent participant result is claimed until the study has actually run.
