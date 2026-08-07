import type { AgentSessionMeta } from '@myyoda/shared'

/**
 * 任务家族会话聚合（纯函数，便于单测）
 *
 * 一个 Task 的「家族」= 同一 taskSlug 下的全部关联会话：
 * - orchestrator 会话（顶层，无 parentSessionId）
 * - 子任务会话（parentSessionId 指向 orchestrator / 同 taskSlug 的子节点）
 * - 历史 run 关联会话（同 taskSlug 的任意会话）
 *
 * 按 updatedAt 倒序，无时间戳的排最后（保持稳定）。
 */
export interface TaskFamilySession {
  session: AgentSessionMeta
  /** 是否为 orchestrator（顶层）会话 */
  isOrchestrator: boolean
  /** 是否为子任务会话 */
  isSubtask: boolean
}

export function collectTaskFamilySessions(
  sessions: readonly AgentSessionMeta[],
  taskSlug: string,
  orchestratorSessionId?: string,
): TaskFamilySession[] {
  const slugSessions = sessions.filter(
    (session) => session.taskSlug === taskSlug,
  )
  const orchestratorId = orchestratorSessionId
    ?? slugSessions.find((session) => !session.parentSessionId)?.id

  const mapped: TaskFamilySession[] = slugSessions.map((session) => ({
    session,
    isOrchestrator: session.id === orchestratorId || (session.taskSlug === taskSlug && !session.parentSessionId),
    isSubtask: Boolean(session.parentSessionId),
  }))

  // 若 orchestrator 已归档/隐藏，仍保留在家族里（标注即可），但归档的排后面
  return [...mapped].sort((left, right) => {
    const leftArchived = Boolean(left.session.archived)
    const rightArchived = Boolean(right.session.archived)
    if (leftArchived !== rightArchived) return leftArchived ? 1 : -1
    const leftTime = left.session.updatedAt ?? left.session.createdAt ?? 0
    const rightTime = right.session.updatedAt ?? right.session.createdAt ?? 0
    return rightTime - leftTime
  })
}
