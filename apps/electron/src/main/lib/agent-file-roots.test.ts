import { describe, expect, test } from 'bun:test'
import { buildAgentSessionFileRoots } from './agent-file-roots'

describe('buildAgentSessionFileRoots', () => {
  test('Project effective cwd 是托管 Project 时，Outbox 仍独立于 Project root', () => {
    const result = buildAgentSessionFileRoots({
      sessionDir: '/luxcoder/workspaces/default/session-1',
      workspaceFilesPath: '/luxcoder/workspaces/default/workspace-files',
      executionCwd: '/luxcoder/workspaces/default/projects/demo/workdir',
      executionSource: 'project',
      projectId: 'project-1',
    })

    expect(result).toMatchObject({
      sessionDir: '/luxcoder/workspaces/default/session-1',
      executionCwd: '/luxcoder/workspaces/default/projects/demo/workdir',
      executionSource: 'project',
      projectRoot: '/luxcoder/workspaces/default/projects/demo/workdir',
      sessionOutboxPath: '/luxcoder/workspaces/default/workspace-files/Outbox/session-1',
    })
  })

  test('历史 Session 只使用 sandbox，不误把绑定 Project 当成执行目录', () => {
    const result = buildAgentSessionFileRoots({
      sessionDir: '/luxcoder/workspaces/default/session-2',
      workspaceFilesPath: '/luxcoder/workspaces/default/workspace-files',
      executionCwd: '/luxcoder/workspaces/default/session-2',
      executionSource: 'sandbox',
      projectId: 'project-1',
    })

    expect(result.executionCwd).toBe(result.sessionDir)
    expect(result.projectRoot).toBeUndefined()
    expect(result.sessionOutboxPath).toBe('/luxcoder/workspaces/default/workspace-files/Outbox/session-2')
  })
})
