export interface ProjectDeleteImpact {
  taskCount: number
  /** Historical run directories retained under project Tasks. */
  runCount: number
  /** Runs that have not reached a terminal state and remain resumable. */
  activeRunCount: number
  activeRunTaskSlugs: string[]
  sessionCount: number
  assetCount: number
  hasKnowledge: boolean
  /** True only for an existing Workspace-managed project workdir. */
  hasManagedWorkdir: boolean
  blockers: string[]
  canPurge: boolean
}

export interface TaskDeleteImpact {
  runCount: number
  activeRunCount: number
  sessionCount: number
  canPurge: boolean
  blockers: string[]
}
