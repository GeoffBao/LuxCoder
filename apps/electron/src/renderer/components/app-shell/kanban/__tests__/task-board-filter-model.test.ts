import { describe, expect, test } from 'bun:test'
import { cleanupTaskBoardFilterForWorkspace, taskMatchesBoardFilter } from '../task-board-filter-model'
import type { TaskAggregateSummary } from '@yoda/shared/tasks'

function makeSummary(overrides: Partial<TaskAggregateSummary>): TaskAggregateSummary {
  return {
    taskId: 't1',
    title: '任务',
    taskSlug: 'task-1',
    workflow: 'todo',
    scope: { kind: 'workspace' },
    labelIds: [],
    revision: 1,
    runCount: 0,
    legacyIdentity: false,
    health: 'ready' as const,
    diagnostics: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('taskMatchesBoardFilter', () => {
  test('默认隐藏已归档 Task（showArchived=false）', () => {
    const archived = makeSummary({ archivedAt: 1700000000000 })
    expect(taskMatchesBoardFilter(archived, { scope: { kind: 'all' } })).toBe(false)
  })

  test('开启显示已归档后归档 Task 可匹配（继续走 workflow/scope 筛选）', () => {
    const archived = makeSummary({ archivedAt: 1700000000000, workflow: 'done' })
    expect(taskMatchesBoardFilter(archived, { scope: { kind: 'all' }, showArchived: true })).toBe(true)
    expect(taskMatchesBoardFilter(archived, { scope: { kind: 'all' }, showArchived: true, workflow: 'todo' })).toBe(false)
  })

  test('未归档 Task 不受 showArchived 影响', () => {
    const normal = makeSummary({ workflow: 'needs-review' })
    expect(taskMatchesBoardFilter(normal, { scope: { kind: 'all' } })).toBe(true)
    expect(taskMatchesBoardFilter(normal, { scope: { kind: 'all' }, showArchived: true })).toBe(true)
  })
})


describe('cleanupTaskBoardFilterForWorkspace', () => {
  test('切换 Workspace 时清除失效 Project 与 Label，但保留有效 Workflow 和无标签选择', () => {
    expect(cleanupTaskBoardFilterForWorkspace({
      scope: { kind: 'project', projectId: 'old-project' },
      workflow: 'needs-review',
      labelIds: ['keep-label', 'old-label'],
      includeUnlabeled: true,
    }, {
      projectIds: ['new-project'],
      labelIds: ['keep-label'],
    })).toEqual({
      scope: { kind: 'all' },
      workflow: 'needs-review',
      source: 'all',
      labelIds: ['keep-label'],
      includeUnlabeled: true,
    })
  })

  test('缺省状态规范化为 all scope 且 includeUnlabeled=false', () => {
    expect(cleanupTaskBoardFilterForWorkspace({}, { projectIds: [], labelIds: [] })).toEqual({
      scope: { kind: 'all' },
      workflow: 'all',
      source: 'all',
      labelIds: [],
      includeUnlabeled: false,
    })
  })
})
