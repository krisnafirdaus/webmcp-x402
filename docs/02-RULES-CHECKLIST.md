# Submission compliance checklist

Source: https://webmcp.devpost.com/rules + https://openai.com/webmcp-challenge/ (re-checked 2026-08-29). The Devpost Official Rules control if another page conflicts — this is still an extract, not legal advice.

## Deadlines

- [ ] Submitted on Devpost **before Sep 3, 2026 13:00 PT** (target: Sep 2 evening)
- [ ] Judging window Sep 4–21: live app stays up, free access, no breaking deploys

## Required artifacts

- [x] **Live app URL** — https://spendmcp-x402.vercel.app (Vercel, sponsor-listed host; SSO protection disabled — verified public 200, WebMCP tool discovery, simulated purchase, capability transition from 9 to 10 tools, and premium query in ChatGPT's in-app browser). The 15-scenario suite passed in both bundled Chromium and Google Chrome 152, newer than the Chrome 149 target.
- [x] **Public repo** — https://github.com/krisnafirdaus/webmcp-x402 (Apache-2.0 is visible in GitHub's repository navigation; NOTICE, a challenge-period root commit dated 2026-08-28, and setup instructions are present)
- [x] No obvious secrets/private keys in the current tracked tree or single-commit public history; only `.env.example` is tracked. Run a dedicated scanner before final submission if available.
- [x] Repo contains the `modelContext.registerTool()` implementation through `getModelContext()` + `createToolRegistrar()` (`packages/sdk/src/webmcp.ts`)
- [ ] **Video < 3:00**, with audio narration explaining what was built and the WebMCP implementation, public on YouTube, no third-party trademarks/copyrighted music
- [x] **Text description** covering: why WebMCP fits this use case; UX improvements; new human-agent collaboration capabilities; implementation approach (`docs/04-SUBMISSION-DESCRIPTION.md`)
- [x] Free access for judges — no signup wall or funds needed; Instant Demo Mode and its generated testnet wallet are the default

## Eligibility / process

- [ ] This is my only entry, or any additional entries are unique and substantially different
- [ ] Original work started for the challenge (public history begins with the root commit dated Aug 28, 2026 and retains dated follow-up commits; keep equivalent development evidence because the earlier granular history was intentionally squashed)
- [ ] No prior sponsor financial support for this project
- [ ] Country eligible for OpenAI API access

## Judge experience test (run before submitting)

- [ ] Fresh Chrome profile, flag on → open URL → agent can list tools within 10s
- [ ] ChatGPT desktop → in-app browser → sample research prompt → discover → quote → policy check → purchase (one auto, one via approval sheet) → **dynamic tool appears** → analysis delivered, end-to-end < 90s
- [x] Demo-mode purchase requires zero wallet setup; mode badge clearly labeled
- [x] One real Base Sepolia settlement verified; public BaseScan proof is recorded in `docs/05-IMPACT-EVIDENCE.md`
- [x] Idempotent retry: same key twice → same receipt, spend unchanged (unit + E2E)
- [x] Start over clears local session state, reloads the document, regenerates the wallet, and returns the capability surface to nine tools (E2E)
- [ ] Video link plays logged-out, < 3:00, audio present, dynamic-tool moment visible
- [ ] README quick start works on clean clone (`pnpm install && pnpm --filter webmcp-x402 build && pnpm -r test && pnpm --filter workspace dev`)
