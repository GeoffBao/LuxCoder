import { describe, expect, test } from 'bun:test'
import { applyWorktreeProjectContextOverride, resolveSessionCwd } from './agent-cwd-resolver'
import type { EffectiveCwdResult } from './project-path-service'

const SANDBOX = '/myyoda/agent-workspaces/ws/session-1'
const PROJECT_DIR = '/Users/dev/my-real-project'

function projectResolver(result: EffectiveCwdResult | null) {
  return () => result
}

describe('resolveSessionCwd', () => {
  test('Project 绑定外部目录且可用 → 使用 project cwd', () => {
    const result = resolveSessionCwd({
      agentCwdMode: 'project',
      projectId: 'proj-1',
      resolveProjectCwd: projectResolver({ status: 'external', cwd: PROJECT_DIR, displayPath: PROJECT_DIR }),
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ cwd: PROJECT_DIR, source: 'project' })
  })

  test('未绑定 Project（无 projectId）→ 回退沙箱', () => {
    const result = resolveSessionCwd({
      agentCwdMode: 'project',
      resolveProjectCwd: projectResolver(null),
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ cwd: SANDBOX, source: 'sandbox' })
  })

  test('历史会话（agentCwdMode 缺失）即使有 projectId 也不查 project，直接走沙箱', () => {
    let called = false
    const result = resolveSessionCwd({
      projectId: 'proj-1',
      resolveProjectCwd: () => {
        called = true
        return { status: 'external', cwd: PROJECT_DIR, displayPath: PROJECT_DIR }
      },
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ cwd: SANDBOX, source: 'sandbox' })
    expect(called).toBe(false)
  })

  test('Git Worktree 路径优先级最高，即便同时满足 project 条件', () => {
    const result = resolveSessionCwd({
      gitWorktreePath: '/repo/.worktrees/feature-x',
      agentCwdMode: 'project',
      projectId: 'proj-1',
      resolveProjectCwd: projectResolver({ status: 'external', cwd: PROJECT_DIR, displayPath: PROJECT_DIR }),
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ cwd: '/repo/.worktrees/feature-x', source: 'worktree' })
  })

  test('Project 目录 unavailable 时不静默回退沙箱，返回 unavailable', () => {
    const result = resolveSessionCwd({
      agentCwdMode: 'project',
      projectId: 'proj-1',
      resolveProjectCwd: projectResolver({ status: 'unavailable', displayPath: PROJECT_DIR }),
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ unavailable: true, displayPath: PROJECT_DIR })
  })

  test('managed 状态（未绑定外部目录的 Project）优先于沙箱使用其托管 cwd', () => {
    const result = resolveSessionCwd({
      agentCwdMode: 'project',
      projectId: 'proj-1',
      resolveProjectCwd: projectResolver({ status: 'managed', cwd: '/myyoda/projects/foo', displayPath: '/myyoda/projects/foo' }),
      sandboxCwd: SANDBOX,
    })
    expect(result).toEqual({ cwd: '/myyoda/projects/foo', source: 'project' })
  })
})

describe('applyWorktreeProjectContextOverride', () => {
  const WORKTREE_DIR = '/repo/.worktrees/feature-x'
  const baseContext = { name: '示例项目', workingDirectory: PROJECT_DIR }

  test('cwd 来源为 worktree 时覆写 workingDirectory 并标记 isWorktree', () => {
    const result = applyWorktreeProjectContextOverride(baseContext, 'worktree', WORKTREE_DIR)
    expect(result).toEqual({ name: '示例项目', workingDirectory: WORKTREE_DIR, isWorktree: true })
  })

  test('cwd 来源为 project 时不覆写', () => {
    const result = applyWorktreeProjectContextOverride(baseContext, 'project', WORKTREE_DIR)
    expect(result).toEqual(baseContext)
  })

  test('cwd 来源为 sandbox 时不覆写', () => {
    const result = applyWorktreeProjectContextOverride(baseContext, 'sandbox', WORKTREE_DIR)
    expect(result).toEqual(baseContext)
  })

  test('projectContext 为 null 时原样透传', () => {
    const result = applyWorktreeProjectContextOverride(null, 'worktree', WORKTREE_DIR)
    expect(result).toBeNull()
  })

  test('agentCwd 缺失时不覆写', () => {
    const result = applyWorktreeProjectContextOverride(baseContext, 'worktree', undefined)
    expect(result).toEqual(baseContext)
  })
})
