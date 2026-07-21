import type { AgentSessionMeta } from '@luxagents/shared'
import type { KanbanProject } from './kanban/types'

export interface SidebarProjectGroup {
  project: KanbanProject
  sessions: AgentSessionMeta[]
  /** 是否为当前选中的项目（对应 selectedProjectIdAtom，驱动子分组高亮 / 自动展开） */
  selected: boolean
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
  selectedProjectId?: string | null,
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
      selected: project.id === selectedProjectId,
    }))

  return { projectGroups, unboundSessions }
}

/** 项目 ID → 主题色映射；无 color 的项目不入映射（会话行查不到即不渲染色条）。 */
export function buildProjectColorMap(projects: KanbanProject[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const project of projects) {
    if (project.color) map.set(project.id, project.color)
  }
  return map
}
