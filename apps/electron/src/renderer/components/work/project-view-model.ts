import type { AgentSessionMeta } from '@luxagents/shared'
import type { KanbanProject } from '../app-shell/kanban/types'

export interface ProjectColumnDraft {
  id: string
  name: string
  color?: string
  dropStatusId?: string
}

export interface ProjectFilter {
  query: string
  showArchived: boolean
}

export interface ProjectSettingsDraft {
  name: string
  description: string
  details: string
  color: string
  kanbanColumns?: ProjectColumnDraft[]
}

export interface ProjectUpdatePatch {
  name: string
  description?: string
  details?: string
  color?: string
  kanbanColumns?: ProjectColumnDraft[]
}

export function filterProjects(projects: KanbanProject[], filter: ProjectFilter): KanbanProject[] {
  const query = filter.query.trim().toLocaleLowerCase()
  return projects.filter((project) => {
    if (!filter.showArchived && project.archivedAt) return false
    if (!query) return true
    return `${project.name}\n${project.description ?? ''}`.toLocaleLowerCase().includes(query)
  })
}

export function getProjectSessions(sessions: AgentSessionMeta[], projectId: string): AgentSessionMeta[] {
  return sessions.filter((session) =>
    session.projectId === projectId && !session.archived && !session.parentSessionId && !session.taskDraft,
  )
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined
}

export function buildProjectUpdate(draft: ProjectSettingsDraft): ProjectUpdatePatch {
  return {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    details: optionalText(draft.details),
    color: optionalText(draft.color),
    kanbanColumns: draft.kanbanColumns && draft.kanbanColumns.length > 0
      ? draft.kanbanColumns
      : undefined,
  }
}
