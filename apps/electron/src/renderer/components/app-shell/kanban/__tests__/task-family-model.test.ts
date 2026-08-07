import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@myyoda/shared'
import { collectTaskFamilySessions } from '../task-family-model'

function createSession(overrides: Partial<AgentSessionMeta> & { id: string }): AgentSessionMeta {
  return {
    title: `会话 ${overrides.id}`,
    workspaceId: 'ws-1',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('collectTaskFamilySessions', () => {
  test('只聚合同一 taskSlug 的会话，跨 slug 不混入', () => {
    const sessions = [
      createSession({ id: 'orch-a', taskSlug: 'task-a', title: 'A 编排', updatedAt: 30 }),
      createSession({ id: 'child-a', taskSlug: 'task-a', parentSessionId: 'orch-a', title: 'A 子任务', updatedAt: 20 }),
      createSession({ id: 'orch-b', taskSlug: 'task-b', title: 'B 编排', updatedAt: 10 }),
      createSession({ id: 'plain', title: '普通聊天', updatedAt: 5 }),
    ]
    const family = collectTaskFamilySessions(sessions, 'task-a')
    expect(family).toHaveLength(2)
    expect(family.map((entry) => entry.session.id).sort()).toEqual(['child-a', 'orch-a'])
  })

  test('orchestrator 判定：显式传入 orchestratorSessionId 优先，否则无 parentSessionId 的顶层会话', () => {
    const sessions = [
      createSession({ id: 'child', taskSlug: 'task-a', parentSessionId: 'other' }),
      createSession({ id: 'top', taskSlug: 'task-a', updatedAt: 5 }),
    ]
    const family = collectTaskFamilySessions(sessions, 'task-a')
    expect(family.find((entry) => entry.session.id === 'top')?.isOrchestrator).toBe(true)
    expect(family.find((entry) => entry.session.id === 'child')?.isOrchestrator).toBe(false)
    expect(family.find((entry) => entry.session.id === 'child')?.isSubtask).toBe(true)

    // 显式指定 orchestrator 时，即使有另一条无 parent 的会话也不覆盖
    const explicit = collectTaskFamilySessions(sessions, 'task-a', 'child')
    expect(explicit.find((entry) => entry.session.id === 'child')?.isOrchestrator).toBe(true)
  })

  test('排序：未归档在前按 updatedAt 倒序，归档排最后', () => {
    const sessions = [
      createSession({ id: 'old-active', taskSlug: 'task-a', updatedAt: 10 }),
      createSession({ id: 'archived', taskSlug: 'task-a', archived: true, updatedAt: 99 }),
      createSession({ id: 'new-active', taskSlug: 'task-a', updatedAt: 40 }),
    ]
    const family = collectTaskFamilySessions(sessions, 'task-a')
    expect(family.map((entry) => entry.session.id)).toEqual(['new-active', 'old-active', 'archived'])
  })

  test('无时间戳的会话排最后且顺序稳定', () => {
    const sessions = [
      createSession({ id: 'no-time-a', taskSlug: 'task-a' }),
      createSession({ id: 'no-time-b', taskSlug: 'task-a' }),
      createSession({ id: 'with-time', taskSlug: 'task-a', updatedAt: 50 }),
    ]
    const family = collectTaskFamilySessions(sessions, 'task-a')
    expect(family[0]?.session.id).toBe('with-time')
    expect(family.slice(1).map((entry) => entry.session.id).sort()).toEqual(['no-time-a', 'no-time-b'])
  })

  test('无任何关联会话时返回空数组', () => {
    const sessions = [createSession({ id: 'plain', title: '普通聊天' })]
    expect(collectTaskFamilySessions(sessions, 'missing')).toEqual([])
  })
})
