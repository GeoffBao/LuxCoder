import type { TaskBoardScopeFilter } from './types'

export interface TaskBoardEmptyStateInput {
  totalCount: number
  filteredCount: number
  scope: TaskBoardScopeFilter
  projectName?: string
  hasSecondaryFilters: boolean
}

export interface TaskBoardEmptyState {
  kind: 'global-empty' | 'scope-empty' | 'filter-empty'
  title: string
  action: 'create' | 'clear-filters'
}

export function resolveTaskBoardEmptyState(input: TaskBoardEmptyStateInput): TaskBoardEmptyState | null {
  if (input.filteredCount > 0) return null
  if (input.totalCount === 0) {
    return { kind: 'global-empty', title: '还没有 Task', action: 'create' }
  }
  if (input.hasSecondaryFilters) {
    return { kind: 'filter-empty', title: '没有符合当前筛选条件的 Task', action: 'clear-filters' }
  }
  if (input.scope.kind === 'workspace') {
    return { kind: 'scope-empty', title: '还没有 Workspace Task', action: 'create' }
  }
  if (input.scope.kind === 'project') {
    return {
      kind: 'scope-empty',
      title: `“${input.projectName ?? '当前工作区'}”中还没有 Task`,
      action: 'create',
    }
  }
  return { kind: 'scope-empty', title: '当前范围还没有 Task', action: 'create' }
}
