import type { TaskAggregateSummary, TaskWorkflow } from '@myyoda/shared/tasks'
import type { KanbanFilter, TaskBoardScopeFilter } from './types'

export interface TaskBoardFilterState {
  scope: TaskBoardScopeFilter
  workflow: 'all' | TaskWorkflow
  labelIds: string[]
  includeUnlabeled: boolean
}

export interface WorkspaceFilterCatalog {
  projectIds: readonly string[]
  labelIds: readonly string[]
}

/** 解析显式 scope，同时兼容旧 null/string Project 筛选契约。 */
export function resolveTaskBoardScope(filter: KanbanFilter): TaskBoardScopeFilter {
  if (filter.scope) return filter.scope
  return filter.projectId === null || filter.projectId === undefined
    ? { kind: 'all' }
    : { kind: 'project', projectId: filter.projectId }
}

export function taskMatchesBoardFilter(task: TaskAggregateSummary, filter: KanbanFilter): boolean {
  const scope = resolveTaskBoardScope(filter)
  if (scope.kind === 'workspace' && task.scope.kind !== 'workspace') return false
  if (scope.kind === 'project' && (task.scope.kind !== 'project' || task.scope.projectId !== scope.projectId)) {
    return false
  }

  if (filter.workflow && filter.workflow !== 'all' && task.workflow !== filter.workflow) return false

  const selectedLabels = filter.labelIds ?? []
  const includeUnlabeled = filter.includeUnlabeled ?? false
  if (selectedLabels.length === 0) {
    return !includeUnlabeled || task.labelIds.length === 0
  }

  if (task.labelIds.some((labelId) => selectedLabels.includes(labelId))) return true
  return includeUnlabeled && task.labelIds.length === 0
}

/** 切换 Workspace 后移除已失效的 Workspace scoped ID。 */
export function cleanupTaskBoardFilterForWorkspace(
  filter: KanbanFilter,
  catalog: WorkspaceFilterCatalog,
): TaskBoardFilterState {
  const availableProjects = new Set(catalog.projectIds)
  const availableLabels = new Set(catalog.labelIds)
  const currentScope = resolveTaskBoardScope(filter)
  const scope = currentScope.kind === 'project' && !availableProjects.has(currentScope.projectId)
    ? { kind: 'all' } as const
    : currentScope

  return {
    scope,
    workflow: filter.workflow ?? 'all',
    labelIds: (filter.labelIds ?? []).filter((labelId) => availableLabels.has(labelId)),
    includeUnlabeled: filter.includeUnlabeled ?? false,
  }
}

