import { describe, expect, test } from 'bun:test'
import { matchesWorkspaceLoad, type WorkspaceLoadIdentity } from '../work-board-load-guard'

describe('matchesWorkspaceLoad', () => {
  const active: WorkspaceLoadIdentity = { generation: 3, workspaceId: 'workspace-b', root: '/root/b' }

  test('仅当前 Workspace/root/generation 可回写看板快照', () => {
    expect(matchesWorkspaceLoad(active, { generation: 3, workspaceId: 'workspace-b', root: '/root/b' })).toBe(true)
    expect(matchesWorkspaceLoad(active, { generation: 2, workspaceId: 'workspace-b', root: '/root/b' })).toBe(false)
    expect(matchesWorkspaceLoad(active, { generation: 3, workspaceId: 'workspace-a', root: '/root/a' })).toBe(false)
  })
})
