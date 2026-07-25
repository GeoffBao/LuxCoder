/**
 * sidebar-projects-model — Projects Tab 的分组/排序/聚合注意力纯函数
 *
 * 从 SidebarProjectsTab.tsx 抽出，便于 bun:test 单测（对齐 codebase 的 *-model.ts 模式）。
 */

import type { AgentSessionMeta } from '@luxcoder/shared'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'
import type { KanbanProject } from './kanban/types'

/** 项目行聚合注意力点优先级：blocked > running > completed（学 Synara/Superset 聚合指示） */
const ATTENTION_PRIORITY: Partial<Record<SessionIndicatorStatus, number>> = {
  blocked: 3,
  running: 2,
  completed: 1,
}

/** 取组内会话最高优先级的注意力状态；无需要关注的会话时返回 null */
export function resolveProjectAttention(
  sessions: AgentSessionMeta[],
  indicatorMap: Map<string, SessionIndicatorStatus>,
): SessionIndicatorStatus | null {
  let best: SessionIndicatorStatus | null = null
  let bestPriority = 0
  for (const session of sessions) {
    const status = indicatorMap.get(session.id)
    if (!status) continue
    const priority = ATTENTION_PRIORITY[status] ?? 0
    if (priority > bestPriority) {
      best = status
      bestPriority = priority
    }
  }
  return best
}

/** 自动任务会话的家是「自动任务」视图，不进项目分组（与 sessions tab 规则一致） */
export function isHiddenAutomationSession(session: AgentSessionMeta): boolean {
  return !!session.sourceAutomationId && !session.pinned
}

/** 过滤可入项目分组的会话：排除归档 / draft / 委派子会话 / 自动任务会话 / 跨工作区 */
export function filterGroupableSessions(
  sessions: AgentSessionMeta[],
  draftSessionIds: Set<string>,
  currentWorkspaceId: string | null,
): AgentSessionMeta[] {
  return sessions.filter((session) => {
    if (session.archived) return false
    if (draftSessionIds.has(session.id)) return false
    if (session.parentSessionId) return false
    if (isHiddenAutomationSession(session)) return false
    if (currentWorkspaceId && session.workspaceId && session.workspaceId !== currentWorkspaceId) return false
    return true
  })
}

/**
 * 按 projectId 分桶，各组内按 updatedAt 倒序。
 * 无项目的会话不分桶（项目 Tab 是纯粹的「按项目浏览」视图，未归属会话统一去会话 Tab 查看/迁移）。
 */
export function groupSessionsByProject(sessions: AgentSessionMeta[]): Map<string, AgentSessionMeta[]> {
  const byProject = new Map<string, AgentSessionMeta[]>()
  for (const session of sessions) {
    if (!session.projectId) continue
    const list = byProject.get(session.projectId) ?? []
    list.push(session)
    byProject.set(session.projectId, list)
  }
  const byUpdatedDesc = (a: AgentSessionMeta, b: AgentSessionMeta) => b.updatedAt - a.updatedAt
  for (const list of byProject.values()) list.sort(byUpdatedDesc)
  return byProject
}

/** 项目排序：有会话的按最新会话活跃度排，无会话的按项目自身 updatedAt 排 */
export function sortProjectsByActivity(
  projects: KanbanProject[],
  byProject: Map<string, AgentSessionMeta[]>,
): KanbanProject[] {
  const activityOf = (project: KanbanProject): number => byProject.get(project.id)?.[0]?.updatedAt ?? 0
  return [...projects].sort((a, b) => {
    const activityA = activityOf(a)
    const activityB = activityOf(b)
    if (activityA !== activityB) return activityB - activityA
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}
