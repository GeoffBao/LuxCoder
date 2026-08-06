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
  /** 关联会话 ID 列表（orchestrator 会话 + taskSlug 归属会话）；供用户选择是否同步删除 */
  sessionIds: string[]
  canPurge: boolean
  blockers: string[]
}
