'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { LocalAccount } from 'viem'
import {
  createPaidFetch,
  createToolRegistrar,
  getModelContext,
  PaymentDeniedError,
  type ConfirmDetails,
  type PaymentEvent,
  type PaymentReceipt,
  type ToolRegistrar,
} from 'webmcp-x402'
import { createPolicy, type Policy, type PolicyState } from '../lib/policy'
import { clearSession, loadSession, saveSession, type SessionSnapshot } from '../lib/session'
import { makeDatasetTool, registerStaticTools, type ToolDeps } from '../lib/tools'
import { loadDemoAccount, resetDemoAccount } from '../lib/wallet'

const CLIENT_PAYMENT_ID_RE = /^pay_[a-zA-Z0-9_-]{8,128}$/
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * receipt.txHash is server-controlled but still untrusted input to the UI
 * layer — never build an explorer href without this check. Accepts both the
 * SDK's flat PaymentReceipt shape (txHash at the top level) and the server
 * route's nested settlement shape (txHash under settlement), since Task 12
 * may render receipts sourced from either.
 */
export function safeTxHash(
  receipt: { txHash?: string | null; settlement?: { txHash?: string | null } } | null | undefined,
): string | null {
  const hash = receipt?.txHash ?? receipt?.settlement?.txHash
  return typeof hash === 'string' && TX_HASH_RE.test(hash) ? hash : null
}

export interface QuotePreview {
  quoteId: string
  resourceId: string
  priceUsd: number
  expiresAt: string
  purchaseUrl: string
  policyPreview: ReturnType<Policy['check']>
}

export type QuoteResult =
  | { ok: true; quote: QuotePreview }
  | { ok: false; error: 'quote_failed'; status?: number }

export type PurchaseResult =
  | { ok: true; receipt: unknown; rowCount: number; metrics: string[]; replayed: boolean }
  | { ok: false; denied: string; detail?: string; policy?: PolicyState; status?: number }

interface CachedQuote {
  priceUsd: number
  network: string
  purchaseUrl: string
  resourceId: string
  expiresAt: number // ms since epoch, parsed once at cache time
}

// 2s skew margin: treat a quote as expired slightly before the server would,
// so a purchase attempt doesn't race the server's own expiry check.
const QUOTE_EXPIRY_SKEW_MS = 2000

export type PendingApproval = ConfirmDetails & {
  kind: 'payment' | 'policy_raise'
  resolve(approved: boolean): void
}

interface SpendMCPContextValue {
  account: LocalAccount | null
  policy: Policy
  policyVersion: number
  bumpPolicy: () => void
  receipts: PaymentReceipt[]
  pending: PendingApproval | null
  purchase: (resourceId: string, clientPaymentId?: string, quoteId?: string) => Promise<PurchaseResult>
  getQuote: (resourceId: string) => Promise<QuoteResult>
  reportIssue: (paymentId: string, reason: string) => Promise<{ status: number; body: unknown }>
  purchasedIds: string[]
  /** Server-issued paymentId for a purchased resource (null until a successful purchase records it). */
  serverPaymentIdFor: (resourceId: string) => string | null
  mode: 'mock' | 'real'
  webmcpReady: boolean
  /** Exact tool names accepted by the current WebMCP registrar. */
  registeredToolNames: string[]
  requestPolicyRaise: (details: { description: string; amountUsd: number }) => Promise<boolean>
  resetWallet: () => void
  /**
   * False for exactly one render (both on the server and the first client
   * render), true from then on. A restored session makes `policy.state` /
   * `receipts` differ between server and client from that very first client
   * render (see SpendMCPProvider's `initialSession`) — consumers that
   * display those values directly (PolicyPanel, Ledger) must gate on this to
   * avoid a hydration mismatch, showing the SSR-safe default for one tick
   * before revealing the restored values.
   */
  hydrated: boolean
}

const SpendMCPContext = createContext<SpendMCPContextValue | null>(null)

export function useSpendMCP(): SpendMCPContextValue {
  const ctx = useContext(SpendMCPContext)
  if (!ctx) throw new Error('useSpendMCP must be used within a SpendMCPProvider')
  return ctx
}

export function SpendMCPProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<LocalAccount | null>(null)
  useEffect(() => {
    setAccount(loadDemoAccount())
  }, [])
  // Mirrors `account` for tool closures that must stay live across a
  // resetWallet() without the static tool set (registered once) going stale.
  const accountRef = useRef<LocalAccount | null>(null)
  useEffect(() => {
    accountRef.current = account
  }, [account])

  // Snapshot of a prior session (purchases, receipts, policy), if any. Read
  // once via a lazy useState initializer so it runs synchronously during the
  // very first CLIENT render — before the registration effect below ever
  // gets a chance to read purchasedIdsRef — rather than in an effect, which
  // would fire a render too late for that ordering to hold. SSR always sees
  // no `localStorage` and gets null, matching the pre-persistence defaults;
  // a real snapshot only shows up starting with the first CLIENT render,
  // which can differ from the server-rendered HTML when one exists (a
  // hydration mismatch risk on refresh, accepted deliberately here — see the
  // e2e run notes for whether it needed a mounted-flag gate in practice).
  const [initialSession] = useState<SessionSnapshot | null>(() => loadSession())

  const policyRef = useRef<Policy | undefined>(undefined)
  // spentUsd can only be set at Budget construction (no setter exists), so a
  // restored session must flow in here, not via humanSet/agentSet afterward.
  if (!policyRef.current) policyRef.current = createPolicy(initialSession?.policy)
  const [policyVersion, setPolicyVersion] = useState(0)
  const bumpPolicy = useCallback(() => setPolicyVersion((v) => v + 1), [])

  const [receipts, setReceipts] = useState<PaymentReceipt[]>(() => initialSession?.receipts ?? [])
  const receiptsRef = useRef<PaymentReceipt[]>(receipts)
  const appendReceipt = useCallback((receipt: PaymentReceipt) => {
    receiptsRef.current = [...receiptsRef.current, receipt]
    setReceipts(receiptsRef.current)
  }, [])

  const [purchasedIds, setPurchasedIds] = useState<string[]>(() => initialSession?.purchasedIds ?? [])
  const purchasedIdsRef = useRef<string[]>(purchasedIds)
  const appendPurchasedId = useCallback((resourceId: string) => {
    if (purchasedIdsRef.current.includes(resourceId)) return
    purchasedIdsRef.current = [...purchasedIdsRef.current, resourceId]
    setPurchasedIds(purchasedIdsRef.current)
  }, [])

  const [pending, setPending] = useState<PendingApproval | null>(null)
  // Synchronous mirror of `pending` — confirm()/requestPolicyRaise() need to
  // read "what's showing right now" before their first await, which a piece
  // of React state (stale inside a memoized callback) can't give them.
  const pendingRef = useRef<PendingApproval | null>(null)

  const showPending = useCallback((entry: PendingApproval) => {
    pendingRef.current = entry
    setPending(entry)
  }, [])

  // Every timeout handler and resolve wrapper clears through here, gated on
  // object identity, so a slot that has already been superseded by a newer
  // entry can never null out that newer entry (the orphaned-timer clobber).
  const clearPendingIfCurrent = useCallback((entry: PendingApproval) => {
    if (pendingRef.current === entry) pendingRef.current = null
    setPending((p) => (p === entry ? null : p))
  }, [])

  const [webmcpReady, setWebmcpReady] = useState(false)
  const [registeredToolNames, setRegisteredToolNames] = useState<string[]>([])

  // See SpendMCPContextValue.hydrated: flips true right after the first
  // client commit, i.e. after hydration is safely behind us.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const quoteCache = useRef(new Map<string, CachedQuote>())

  const confirm = useCallback(
    (details: ConfirmDetails) =>
      new Promise<boolean>((resolve, reject) => {
        // Payment confirms are serialized by the SDK, so at most one is ever
        // in flight — but a policy_raise prompt may already be showing.
        // Bump it out of the way (declined) so the payment sheet takes over.
        const existing = pendingRef.current
        if (existing && existing.kind === 'policy_raise') {
          existing.resolve(false)
        }
        let timer: ReturnType<typeof setTimeout>
        const entry: PendingApproval = {
          ...details,
          kind: 'payment',
          resolve: (ok) => {
            clearTimeout(timer)
            clearPendingIfCurrent(entry)
            resolve(ok)
          },
        }
        timer = setTimeout(() => {
          clearPendingIfCurrent(entry)
          reject(new PaymentDeniedError('confirm_timeout', details.amountUsd, details.resource))
        }, 120_000)
        showPending(entry)
      }),
    [clearPendingIfCurrent, showPending],
  )

  const requestPolicyRaise = useCallback(
    (details: { description: string; amountUsd: number }) =>
      new Promise<boolean>((resolve) => {
        // Only one prompt is ever shown. If anything is already pending — a
        // payment confirm, or another raise — this ask is refused outright
        // as "busy" rather than clobbering what's showing.
        if (pendingRef.current) {
          resolve(false)
          return
        }
        let timer: ReturnType<typeof setTimeout>
        const entry: PendingApproval = {
          amountUsd: details.amountUsd,
          resource: '',
          description: details.description,
          spentUsd: policyRef.current!.state.spentUsd,
          capUsd: policyRef.current!.state.sessionCapUsd,
          kind: 'policy_raise',
          resolve: (ok) => {
            clearTimeout(timer)
            clearPendingIfCurrent(entry)
            resolve(ok)
          },
        }
        timer = setTimeout(() => {
          clearPendingIfCurrent(entry)
          resolve(false)
        }, 120_000)
        showPending(entry)
      }),
    [clearPendingIfCurrent, showPending],
  )

  const paidFetch = useMemo(() => {
    if (!account) return null
    return createPaidFetch({
      account,
      budget: policyRef.current!.budget,
      confirm,
      onPayment: (e: PaymentEvent) => {
        appendReceipt(e.receipt)
        bumpPolicy()
      },
    })
  }, [account, confirm, appendReceipt, bumpPolicy])

  const getQuote = useCallback(async (resourceId: string): Promise<QuoteResult> => {
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId }),
      })
      if (!res.ok) return { ok: false, error: 'quote_failed', status: res.status }
      const body = await res.json().catch(() => null)
      if (!body || typeof body.quoteId !== 'string' || typeof body.priceUsd !== 'number') {
        return { ok: false, error: 'quote_failed', status: res.status }
      }

      const parsedExpiry = Date.parse(body.expiresAt)
      quoteCache.current.set(body.quoteId, {
        priceUsd: body.priceUsd,
        network: body.requirements?.network,
        purchaseUrl: body.purchaseUrl,
        resourceId: body.resourceId,
        // An unparsable expiresAt is treated as already-expired rather than
        // cached forever.
        expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now(),
      })

      const quote: QuotePreview = {
        quoteId: body.quoteId,
        resourceId: body.resourceId,
        priceUsd: body.priceUsd,
        expiresAt: body.expiresAt,
        purchaseUrl: body.purchaseUrl,
        policyPreview: policyRef.current!.check({
          priceUsd: body.priceUsd,
          network: body.requirements?.network,
        }),
      }
      return { ok: true, quote }
    } catch {
      return { ok: false, error: 'quote_failed' }
    }
  }, [])

  const purchase = useCallback(
    async (resourceId: string, clientPaymentId?: string, quoteId?: string): Promise<PurchaseResult> => {
      // Fail fast, before spending a round-trip on a quote we can't act on.
      if (!paidFetch) {
        return { ok: false, denied: 'wallet_not_ready' }
      }

      let cached = quoteId ? quoteCache.current.get(quoteId) : undefined
      // A cached quote for a DIFFERENT resource, or one expired (within a 2s
      // skew margin), is not usable here — treat it as a miss and fall
      // through to fetching a fresh one below. This is what makes
      // purchase_access's "transparently re-quotes when expired" true.
      if (cached && (cached.resourceId !== resourceId || Date.now() > cached.expiresAt - QUOTE_EXPIRY_SKEW_MS)) {
        cached = undefined
      }

      if (!cached) {
        const q = await getQuote(resourceId)
        if (!q.ok) return { ok: false, denied: 'quote_failed', status: q.status }
        cached = quoteCache.current.get(q.quote.quoteId)
        if (!cached) return { ok: false, denied: 'quote_failed' }
      }

      const check = policyRef.current!.check({ priceUsd: cached.priceUsd, network: cached.network })
      if (!check.allowed) {
        return { ok: false, denied: check.reason, policy: policyRef.current!.state }
      }

      const id =
        clientPaymentId && CLIENT_PAYMENT_ID_RE.test(clientPaymentId)
          ? clientPaymentId
          : 'pay_' + crypto.randomUUID().replace(/-/g, '')

      try {
        const res = await paidFetch(cached.purchaseUrl, {
          headers: { 'X-Payment-Identifier': id },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          return {
            ok: false,
            denied: 'server_refused',
            status: res.status,
            detail: body && typeof body.error === 'string' ? body.error : undefined,
          }
        }
        // Money has already moved at this point (200 from the purchase
        // route). A malformed/empty body must still be reported as success —
        // returning an error here would invite the caller to retry with a
        // fresh pay_ id and double-spend.
        appendPurchasedId(resourceId)
        const body = await res.json().catch(() => null)
        if (!body) {
          return { ok: true, receipt: null, rowCount: 0, metrics: [], replayed: false }
        }
        return {
          ok: true,
          receipt: body.receipt,
          rowCount: Array.isArray(body.data?.rows) ? body.data.rows.length : 0,
          metrics: body.data?.metrics ?? [],
          replayed: Boolean(body.replayed),
        }
      } catch (err) {
        if (err instanceof PaymentDeniedError) {
          return {
            ok: false,
            denied: err.reason,
            detail: err.detail,
            policy: policyRef.current!.state,
          }
        }
        return { ok: false, denied: 'unexpected_error', detail: String(err) }
      }
    },
    [getQuote, paidFetch, appendPurchasedId],
  )

  const reportIssue = useCallback(async (paymentId: string, reason: string) => {
    const res = await fetch('/api/report-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, reason }),
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  }, [])

  const mode: 'mock' | 'real' = process.env.NEXT_PUBLIC_MOCK_MODE === '0' ? 'real' : 'mock'

  // --- Task 11: WebMCP tool surface -----------------------------------
  //
  // `purchase` changes identity whenever `paidFetch` does (account load,
  // resetWallet), but the static tools below are registered exactly ONCE
  // (Amendment 12: no unregister). purchaseRef is the live-dispatch
  // indirection that keeps purchase_access correct across a wallet reset
  // without re-registering anything.
  const purchaseRef = useRef(purchase)
  useEffect(() => {
    purchaseRef.current = purchase
  }, [purchase])

  // resourceId -> server paymentId, written from the receipt on a successful
  // purchase. Backs query_premium_dataset's server-side lookup.
  const serverPaymentIdRef = useRef(new Map<string, string>(initialSession?.serverPaymentIds ?? []))
  // Bumped whenever serverPaymentIdRef is mutated. This mutation happens
  // imperatively (a ref, not React state) strictly AFTER the appendReceipt/
  // appendPurchasedId renders below for the same purchase (it depends on the
  // receipt returned by that purchase), so without its own version counter
  // the save effect's [receipts, purchasedIds, policyVersion] deps could fire
  // — and persist — one render too early, dropping the just-completed
  // resourceId -> paymentId mapping from the snapshot.
  const [serverPaymentIdVersion, setServerPaymentIdVersion] = useState(0)

  const registrarRef = useRef<ToolRegistrar | null>(null)
  const depsRef = useRef<ToolDeps | undefined>(undefined)

  const registerDatasetTool = useCallback(() => {
    const registrar = registrarRef.current
    const deps = depsRef.current
    if (!registrar || !deps) return
    if (registrar.register(makeDatasetTool(deps))) {
      setRegisteredToolNames(registrar.names())
    }
  }, [])

  const purchaseAndTrack = useCallback(
    async (resourceId: string, clientPaymentId?: string, quoteId?: string) => {
      const result = await purchaseRef.current(resourceId, clientPaymentId, quoteId)
      if (result.ok) {
        const paymentId = (result.receipt as { paymentId?: unknown } | null)?.paymentId
        if (typeof paymentId === 'string') {
          serverPaymentIdRef.current.set(resourceId, paymentId)
          setServerPaymentIdVersion((v) => v + 1)
        }
        // Capability follows settlement, regardless of whether the purchase
        // began in an agent tool or the page's human Buy button.
        registerDatasetTool()
      }
      return result
    },
    [registerDatasetTool],
  )

  // Human-consent path for a policy raise: requestPolicyRaise resolving true
  // IS the human's approval, so this calls humanSet (lifts the baseline),
  // never just agentSet (which raises are clamped back down against anyway).
  const humanApprovedSet = useCallback(
    (p: Partial<Pick<PolicyState, 'perTxCapUsd' | 'sessionCapUsd' | 'autoApproveUnderUsd'>>) => {
      policyRef.current!.humanSet(p)
      bumpPolicy()
    },
    [bumpPolicy],
  )
  const agentSetPolicyDep = useCallback(
    (p: Partial<Pick<PolicyState, 'perTxCapUsd' | 'sessionCapUsd' | 'autoApproveUnderUsd'>>) => {
      policyRef.current!.agentSet(p)
      bumpPolicy()
    },
    [bumpPolicy],
  )

  const registeredRef = useRef(false)

  // Built once (every field below either is a ref read or indirects through
  // one), so this object stays valid for the whole session even though
  // registerStaticTools only ever runs a single time.
  if (!depsRef.current) {
    depsRef.current = {
      getQuote,
      purchase: purchaseAndTrack,
      reportIssue,
      requestPolicyRaise,
      humanApprovedSet,
      policyState: () => policyRef.current!.state as unknown as Record<string, unknown>,
      agentSetPolicy: agentSetPolicyDep,
      receipts: () => receiptsRef.current,
      purchasedIds: () => purchasedIdsRef.current,
      walletAddress: () => accountRef.current?.address ?? null,
      serverPaymentIdFor: (resourceId: string) => serverPaymentIdRef.current.get(resourceId) ?? null,
      mode,
      onFirstPurchase: registerDatasetTool,
    }
  }

  useEffect(() => {
    if (registeredRef.current) return
    if (!account || !paidFetch) return
    registeredRef.current = true

    const mc = getModelContext()
    const bag: Record<string, (args: Record<string, unknown>) => Promise<unknown>> | undefined =
      process.env.NEXT_PUBLIC_TEST === '1' ? {} : undefined
    const registrar = createToolRegistrar(mc ?? (bag ? { registerTool() {} } : null), bag)
    registrarRef.current = registrar
    if (bag) (window as unknown as { __spendmcpTools?: typeof bag }).__spendmcpTools = bag
    setWebmcpReady(!!mc)

    registerStaticTools(registrar, depsRef.current!)
    setRegisteredToolNames(registrar.names())
    // Resume case: a prior purchase already happened in this session (e.g.
    // fast-refresh, or a real browser refresh with a restored session) —
    // restore the dynamic tool rather than requiring a second purchase to
    // see it again. purchasedIdsRef is already seeded from initialSession by
    // the time this effect can run (that seeding happens during render, on
    // mount, before any effect), so this needs no changes for the persisted
    // case beyond what fast-refresh already required.
    if (purchasedIdsRef.current.length > 0) {
      registerDatasetTool()
    }
  }, [account, paidFetch, registerDatasetTool])
  // --- end Task 11 ------------------------------------------------------

  // Persist purchases/receipts/policy/server-payment-ids to localStorage on
  // every change, so a refresh can restore them (see lib/session.ts). Reads
  // through the refs (not the `receipts`/`purchasedIds` state values) so this
  // effect doesn't need its own closure-staleness reasoning — same pattern as
  // depsRef above.
  useEffect(() => {
    saveSession({
      purchasedIds: purchasedIdsRef.current,
      serverPaymentIds: Array.from(serverPaymentIdRef.current.entries()),
      receipts: receiptsRef.current,
      policy: {
        perTxCapUsd: policyRef.current!.state.perTxCapUsd,
        sessionCapUsd: policyRef.current!.state.sessionCapUsd,
        spentUsd: policyRef.current!.state.spentUsd,
        autoApproveUnderUsd: policyRef.current!.state.autoApproveUnderUsd,
      },
    })
  }, [receipts, purchasedIds, policyVersion, serverPaymentIdVersion])

  // Deliberate behavior change from the pre-persistence version: resetWallet
  // used to only swap the account, leaving receipts/purchasedIds/policy
  // alone (a reset kept your history against a fresh throwaway address).
  // Now that a session snapshot persists across refresh, "reset" is
  // redefined as "start over" — a fresh wallet gets a fresh session, so
  // in-memory state (and the localStorage snapshot) are cleared together,
  // including policy (spentUsd MUST reset alongside receipts to stay
  // consistent — there's no receipts-less way to represent "$X spent" — and
  // the caps reset with it rather than leaving a partially-stale policy).
  const resetWallet = useCallback(() => {
    clearSession()
    purchasedIdsRef.current = []
    setPurchasedIds([])
    receiptsRef.current = []
    setReceipts([])
    serverPaymentIdRef.current = new Map()
    setServerPaymentIdVersion((v) => v + 1)
    policyRef.current = createPolicy()
    setPolicyVersion((v) => v + 1)
    setAccount(resetDemoAccount())
  }, [])

  const value = useMemo<SpendMCPContextValue>(
    () => ({
      account,
      policy: policyRef.current!,
      policyVersion,
      bumpPolicy,
      receipts,
      pending,
      // purchaseAndTrack, not the raw `purchase` closure: the human path (this
      // context) must record serverPaymentIdRef on success exactly like the
      // agent tool path does, or serverPaymentIdFor() would stay null for
      // anything bought via the UI's Buy button.
      purchase: purchaseAndTrack,
      getQuote,
      reportIssue,
      purchasedIds,
      serverPaymentIdFor: (resourceId: string) => serverPaymentIdRef.current.get(resourceId) ?? null,
      mode,
      webmcpReady,
      registeredToolNames,
      requestPolicyRaise,
      resetWallet,
      hydrated,
    }),
    [
      account,
      policyVersion,
      bumpPolicy,
      receipts,
      pending,
      purchaseAndTrack,
      getQuote,
      reportIssue,
      purchasedIds,
      mode,
      webmcpReady,
      registeredToolNames,
      requestPolicyRaise,
      resetWallet,
      hydrated,
    ],
  )

  return <SpendMCPContext.Provider value={value}>{children}</SpendMCPContext.Provider>
}
