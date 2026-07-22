import type { AgentSessionMeta } from '@luxcodex/shared'
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
  /** 可选：未传时按空字符串处理（兼容尚未接线的调用方） */
  workingDirectory?: string
  /** 可选：未传时按空字符串处理（兼容尚未接线的调用方） */
  defaultExpertId?: string
  kanbanColumns?: ProjectColumnDraft[]
}

export interface ProjectUpdatePatch {
  name: string
  description?: string
  details?: string
  color?: string
  workingDirectory?: string
  defaultExpertId?: string
  kanbanColumns?: ProjectColumnDraft[]
}

export interface CreateProjectDraft {
  name: string
  description: string
  workingDirectory: string
  color: string
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

export function buildCreateProjectInput(draft: CreateProjectDraft): {
  name: string
  description?: string
  workingDirectory?: string
  color?: string
} {
  const input: {
    name: string
    description?: string
    workingDirectory?: string
    color?: string
  } = { name: draft.name.trim() }
  const description = optionalText(draft.description)
  const workingDirectory = optionalText(draft.workingDirectory)
  const color = optionalText(draft.color)
  if (description) input.description = description
  if (workingDirectory) input.workingDirectory = workingDirectory
  if (color) input.color = color
  return input
}

export function buildProjectUpdate(draft: ProjectSettingsDraft): ProjectUpdatePatch {
  return {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    details: optionalText(draft.details),
    color: optionalText(draft.color),
    workingDirectory: optionalText(draft.workingDirectory ?? ''),
    defaultExpertId: optionalText(draft.defaultExpertId ?? ''),
    kanbanColumns: draft.kanbanColumns && draft.kanbanColumns.length > 0
      ? draft.kanbanColumns
      : undefined,
  }
}
