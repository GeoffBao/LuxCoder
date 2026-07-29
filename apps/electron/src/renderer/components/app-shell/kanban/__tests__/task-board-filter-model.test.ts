import { describe, expect, test } from 'bun:test'
import { cleanupTaskBoardFilterForWorkspace } from '../task-board-filter-model'

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
      labelIds: ['keep-label'],
      includeUnlabeled: true,
    })
  })

  test('缺省状态规范化为 all scope 且 includeUnlabeled=false', () => {
    expect(cleanupTaskBoardFilterForWorkspace({}, { projectIds: [], labelIds: [] })).toEqual({
      scope: { kind: 'all' },
      workflow: 'all',
      labelIds: [],
      includeUnlabeled: false,
    })
  })
})
