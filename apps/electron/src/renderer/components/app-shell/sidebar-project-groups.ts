import type { AgentSessionMeta } from '@luxagents/shared'
import type { KanbanProject } from './kanban/types'

export interface SidebarProjectGroup {
  project: KanbanProject
  sessions: AgentSessionMeta[]
}

export interface SidebarProjectGroupsResult {
  /** 按 project.updatedAt 降序；含空项目 */
  projectGroups: SidebarProjectGroup[]
  /** 未绑定（或绑定了归档/已删项目）的会话，保持输入顺序 */
  unboundSessions: AgentSessionMeta[]
}

/** 把工作区会话按 craft Project 派生成侧边栏子分组；纯函数，不做 IO。 */
export function buildSidebarProjectGroups(
  sessions: AgentSessionMeta[],
  projects: KanbanProject[],
): SidebarProjectGroupsResult {
  const activeProjects = projects.filter((candidate) => !candidate.archivedAt)
  const activeProjectIds = new Set(activeProjects.map((candidate) => candidate.id))
  const sessionsByProject = new Map<string, AgentSessionMeta[]>()
  const unboundSessions: AgentSessionMeta[] = []

  for (const session of sessions) {
    if (session.projectId && activeProjectIds.has(session.projectId)) {
      const list = sessionsByProject.get(session.projectId) ?? []
      list.push(session)
      sessionsByProject.set(session.projectId, list)
    } else {
      unboundSessions.push(session)
    }
  }

  const projectGroups = activeProjects
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((project) => ({
      project,
      sessions: (sessionsByProject.get(project.id) ?? [])
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))

  return { projectGroups, unboundSessions }
}
