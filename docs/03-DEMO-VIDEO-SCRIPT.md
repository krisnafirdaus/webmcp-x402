# Demo video script v3 — 3:00 structure (winner-pattern pass)

Screen recording + voiceover, 1080p, no music. Primary take: ChatGPT desktop with https://spendmcp-x402.vercel.app open. Show `registerTool` code ≥2s somewhere in the middle. End card: live URL + repo. Judges may not watch past 3:00 — front-load.

## 0:00–0:20 — Problem

**Screen:** A research agent asked to compare EV battery price data hits premium sources; checkout/signup forms built for humans; task dies.

**VO:** "Research agents die at the paywall. The data they need is for sale, but checkout is built for human hands — so the task fails, and the publisher earns nothing from agent traffic."

## 0:20–0:40 — Delegation (the human sets policy)

**Screen:** SpendMCP workspace. Policy panel front and center: per-transaction cap $0.05, session budget $0.20, auto-approve ≤ $0.05. Paste the sample prompt: *"Compare EV battery pack price trends across the available sources, but don't spend more than $0.20. Prefer the cheapest adequate source."*

**VO:** "So I delegate the purchasing, not the authority. Before the agent starts, I set the policy: how much per purchase, how much this session, and below what price it doesn't need to ask."

## 0:40–1:30 — The agent works (WebMCP discovery + value judgment)

**Screen:** Agent calls `discover_paid_resources` → `preview_resource` on each (free metadata, sample rows, prices) → visibly compares → `get_quote` shows $0.04 and "Allowed by user policy" → `purchase_access` proceeds without asking (under auto-approve).

**VO:** "This site speaks WebMCP — structured tools, not screen-scraping. The agent discovers three premium sources, previews them for free, judges which is worth the money, and quotes the winner: four cents, inside my policy, so it buys without interrupting me."

## 1:30–2:00 — Payment + capability unlock (the money shot)

**Screen:** Quick mechanics cut: HTTP 402 → signed EIP-3009 authorization → verify → receipt lands in the ledger (mode badge visible). The on-page capability panel visibly changes **9 tools → 10 tools** as `query_premium_dataset` registers; the card flips Locked → Unlocked; agent queries 12 months of data and streams the comparison answer.

**VO:** "Payment is x402: the server answers 402 with its price, a deterministic signer produces a bounded USDC authorization — amount, recipient, expiry, single-use nonce — the server verifies it cryptographically, and here's what only WebMCP can do: the purchase changes the page's capability surface. A new tool just appeared. The agent queries the data it bought and finishes the analysis."

## 2:00–2:30 — Result with provenance + spend accounting

**Screen:** Agent's final answer citing the purchased source; ledger shows receipts (amount, resource hash, mode), session total $0.04 of $0.20, remaining budget.

**VO:** "The answer comes with provenance — which source, what it cost, what's left of the budget. Every receipt binds the quote, the dataset's hash, and the settlement: proof of delivery, not just a transaction id."

## 2:30–2:45 — Safety moment (the refusal)

**Screen:** Agent tries the $0.12 forecast source. Policy check fails on the page: "per_tx_cap_exceeded". Agent asks to raise the cap → **approval sheet appears** → click Deny → structured refusal, nothing charged. (Bonus flash: retrying a purchase replays the same receipt — no double charge.)

**VO:** "And when the agent reaches past my limits, the system refuses — and asking for more authority lands on my screen, not in its own hands. I say no; nothing moves. Retries replay the same payment instead of charging twice."

## 2:45–3:00 — Close

**Screen:** One architecture slide — five boxes: Reasoning agent → Policy engine → Deterministic signer → Receipt verifier → Audit ledger. Then end card: spendmcp-x402.vercel.app + github.com/krisnafirdaus/webmcp-x402.

**VO:** "WebMCP makes the paid web agent-accessible. x402 makes access programmable. Humans keep economic control. SpendMCP — links below."

## Checklist

- [ ] <3:00, audio narration, public YouTube, plays logged-out
- [ ] Dynamic tool moment clearly visible (tool list before/after)
- [ ] Safety moment included (refusal + deny on the sheet)
- [ ] Policy numbers legible at 1080p; mode badge visible in payment cut
- [ ] `registerTool` code on screen ≥2s
- [ ] Architecture slide 5 boxes; closing line verbatim
- [ ] No copyrighted assets; end card with both URLs
