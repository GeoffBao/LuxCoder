/**
 * 侧栏「最近会话 / 项目」双投影纯函数
 * 数据源同一批 AgentSessionMeta，不创建副本。
 */

import type { AgentSessionMeta } from '@luxcoder/shared'
import type { KanbanProject } from './kanban/types'
import {
  buildSidebarProjectGroups,
  type SidebarProjectGroupsResult,
} from './sidebar-project-groups'

export function buildRecentSessionList(
  sessions: AgentSessionMeta[],
): AgentSessionMeta[] {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function buildProjectSessionView(
  sessions: AgentSessionMeta[],
  projects: KanbanProject[],
  selectedProjectId?: string | null,
): SidebarProjectGroupsResult {
  return buildSidebarProjectGroups(sessions, projects, selectedProjectId)
}

/** 校验两个投影覆盖同一批 session id（忽略顺序） */
export function sameSessionIdSet(
  recent: AgentSessionMeta[],
  projectView: SidebarProjectGroupsResult,
): boolean {
  const recentIds = recent.map((session) => session.id).sort()
  const projectIds = [
    ...projectView.projectGroups.flatMap((group) => group.sessions),
    ...projectView.unboundSessions,
  ]
    .map((session) => session.id)
    .sort()
  if (recentIds.length !== projectIds.length) return false
  return recentIds.every((id, index) => id === projectIds[index])
}
