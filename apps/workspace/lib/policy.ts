import { createBudget, type Budget } from 'webmcp-x402'

export interface PolicyState {
  perTxCapUsd: number
  sessionCapUsd: number
  spentUsd: number
  autoApproveUnderUsd: number
  allowedNetworks: string[]
}
export type PolicyRefusal = 'per_tx_cap_exceeded' | 'session_budget_exceeded' | 'network_not_allowed'
export type PolicyCheck = { allowed: true; needsConfirm: boolean } | { allowed: false; reason: PolicyRefusal }

const validUsd = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

export interface Policy {
  readonly state: PolicyState
  readonly budget: Budget
  check(q: { priceUsd: number; network: string }): PolicyCheck
  /** Human edits apply as given (session cap still floors at spent via budget). */
  humanSet(p: Partial<Pick<PolicyState, 'perTxCapUsd' | 'sessionCapUsd' | 'autoApproveUnderUsd'>>): void
  /** Agent edits: lowering free; raising clamped to the last human-approved values. */
  agentSet(p: Partial<Pick<PolicyState, 'perTxCapUsd' | 'sessionCapUsd' | 'autoApproveUnderUsd'>>): void
}

export function createPolicy(init?: Partial<PolicyState>): Policy {
  let perTxCapUsd = init?.perTxCapUsd ?? 0.05
  let humanPerTxCapUsd = perTxCapUsd
  const allowedNetworks = init?.allowedNetworks ?? ['base-sepolia']
  const initialAutoApproveUsd = init?.autoApproveUnderUsd ?? 0.05
  const budget = createBudget({
    capUsd: init?.sessionCapUsd ?? 0.2,
    autoApproveUnderUsd: initialAutoApproveUsd,
    spentUsd: init?.spentUsd ?? 0,
  })
  let humanSessionCapUsd = budget.state.capUsd
  let humanAutoApproveUsd = budget.state.autoApproveUnderUsd

  return {
    get state() {
      const b = budget.state
      return {
        perTxCapUsd,
        sessionCapUsd: b.capUsd,
        spentUsd: b.spentUsd,
        autoApproveUnderUsd: b.autoApproveUnderUsd,
        allowedNetworks: [...allowedNetworks],
      }
    },
    budget,
    check({ priceUsd, network }) {
      if (!allowedNetworks.includes(network)) return { allowed: false, reason: 'network_not_allowed' }
      if (!validUsd(priceUsd) || priceUsd > perTxCapUsd + 1e-9) return { allowed: false, reason: 'per_tx_cap_exceeded' }
      const decision = budget.decide(priceUsd)
      if (decision === 'deny') return { allowed: false, reason: 'session_budget_exceeded' }
      return { allowed: true, needsConfirm: decision === 'confirm' }
    },
    humanSet(p) {
      if (validUsd(p.perTxCapUsd)) { perTxCapUsd = p.perTxCapUsd; humanPerTxCapUsd = p.perTxCapUsd }
      if (validUsd(p.sessionCapUsd)) { budget.setCap(p.sessionCapUsd); humanSessionCapUsd = budget.state.capUsd }
      if (validUsd(p.autoApproveUnderUsd)) {
        budget.setAutoApprove(p.autoApproveUnderUsd)
        humanAutoApproveUsd = budget.state.autoApproveUnderUsd
      }
    },
    agentSet(p) {
      if (validUsd(p.perTxCapUsd)) perTxCapUsd = Math.min(p.perTxCapUsd, humanPerTxCapUsd)
      if (validUsd(p.sessionCapUsd)) budget.setCap(Math.min(p.sessionCapUsd, humanSessionCapUsd))
      if (validUsd(p.autoApproveUnderUsd)) budget.setAutoApprove(Math.min(p.autoApproveUnderUsd, humanAutoApproveUsd))
    },
  }
}
