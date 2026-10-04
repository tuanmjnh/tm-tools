export type TmcutRecoveryDecision = 'none' | 'suggest' | 'force'

export interface TmcutRecoveryInput {
  hasRecovery: boolean
  recoveryUpdatedAtMs: number | null
  hasProject: boolean
  projectMtimeMs: number
}

export function decideRecovery(input: TmcutRecoveryInput): TmcutRecoveryDecision {
  if (!input.hasRecovery || input.recoveryUpdatedAtMs === null) return 'none'
  if (Number.isNaN(input.recoveryUpdatedAtMs)) return 'none'
  if (!input.hasProject) return 'force'
  if (!Number.isFinite(input.projectMtimeMs)) return 'suggest'
  return input.recoveryUpdatedAtMs > input.projectMtimeMs ? 'suggest' : 'none'
}
