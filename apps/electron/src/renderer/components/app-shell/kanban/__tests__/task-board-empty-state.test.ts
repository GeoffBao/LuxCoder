import { describe, expect, test } from 'bun:test'
import { resolveTaskBoardEmptyState } from '../task-board-empty-state'

describe('resolveTaskBoardEmptyState', () => {
  test('区分 Workspace 尚无任何 Task', () => {
    expect(resolveTaskBoardEmptyState({
      totalCount: 0,
      filteredCount: 0,
      scope: { kind: 'all' },
      hasSecondaryFilters: false,
    })).toEqual({ kind: 'global-empty', title: '还没有 Task', action: 'create' })
  })

  test('区分 Project scope 本身为空', () => {
    expect(resolveTaskBoardEmptyState({
      totalCount: 3,
      filteredCount: 0,
      scope: { kind: 'project', projectId: 'project-a' },
      projectName: 'MyYoda',
      hasSecondaryFilters: false,
    })).toEqual({ kind: 'scope-empty', title: '“MyYoda”中还没有 Task', action: 'create' })
  })

  test('二级筛选无结果时提供清除筛选，而不是误导用户创建', () => {
    expect(resolveTaskBoardEmptyState({
      totalCount: 3,
      filteredCount: 0,
      scope: { kind: 'project', projectId: 'project-a' },
      projectName: 'MyYoda',
      hasSecondaryFilters: true,
    })).toEqual({ kind: 'filter-empty', title: '没有符合当前筛选条件的 Task', action: 'clear-filters' })
  })

  test('Workspace-only scope 使用明确文案', () => {
    expect(resolveTaskBoardEmptyState({
      totalCount: 2,
      filteredCount: 0,
      scope: { kind: 'workspace' },
      hasSecondaryFilters: false,
    })).toEqual(expect.objectContaining({ title: '还没有 Workspace Task' }))
  })
})
