const isValidAmount = (n: number) => Number.isFinite(n) && n >= 0

export interface BudgetState {
  capUsd: number
  spentUsd: number
  autoApproveUnderUsd: number
}

export type BudgetDecision = 'auto' | 'confirm' | 'deny'

export interface Budget {
  readonly state: BudgetState
  decide(amountUsd: number): BudgetDecision
  /** Records spend. @throws Error on non-finite or negative amount. */
  record(amountUsd: number): void
  setCap(capUsd: number): void
  setAutoApprove(underUsd: number): void
}

export function createBudget(init: Partial<BudgetState> = {}): Budget {
  const state: BudgetState = { capUsd: 0.5, spentUsd: 0, autoApproveUnderUsd: 0, ...init }
  return {
    get state() {
      return { ...state }
    },
    decide(amountUsd) {
      if (!isValidAmount(amountUsd)) return 'deny'
      if (state.spentUsd + amountUsd > state.capUsd + 1e-9) return 'deny'
      if (amountUsd <= state.autoApproveUnderUsd) return 'auto'
      return 'confirm'
    },
    record(amountUsd) {
      if (!isValidAmount(amountUsd)) throw new Error(`invalid amount: ${amountUsd}`)
      state.spentUsd += amountUsd
    },
    setCap(capUsd) {
      if (!isValidAmount(capUsd)) return
      state.capUsd = Math.max(capUsd, state.spentUsd)
    },
    setAutoApprove(underUsd) {
      if (!isValidAmount(underUsd)) return
      state.autoApproveUnderUsd = Math.max(0, underUsd)
    },
  }
}
