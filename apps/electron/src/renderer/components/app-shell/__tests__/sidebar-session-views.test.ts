import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta, SessionGroup } from '@myyoda/shared'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'
import { buildRecentSessionList, groupSessionsByCustomGroup, groupSessionsByState, sortSessions, UNGROUPED_SESSION_LABEL } from '../sidebar-session-views.ts'

function session(partial: Partial<AgentSessionMeta> & Pick<AgentSessionMeta, 'id' | 'updatedAt'>): AgentSessionMeta {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? partial.updatedAt,
    updatedAt: partial.updatedAt,
    projectId: partial.projectId,
    workspaceId: partial.workspaceId ?? 'ws-1',
    customGroupId: partial.customGroupId,
  } as AgentSessionMeta
}

describe('buildRecentSessionList', () => {
  test('按 updatedAt 降序排列，含未归类与 Project Session', () => {
    const sessions = [
      session({ id: 's-unbound', updatedAt: 100, title: '临时' }),
      session({ id: 's-proj', updatedAt: 200, projectId: 'p1', title: '项目会话' }),
      session({ id: 's-old', updatedAt: 50, projectId: 'p1', title: '旧' }),
    ]

    const recent = buildRecentSessionList(sessions)

    expect(recent.map((s) => s.id)).toEqual(['s-proj', 's-unbound', 's-old'])
  })

  test('不修改入参数组，返回新数组', () => {
    const sessions = [
      session({ id: 'a', updatedAt: 1 }),
      session({ id: 'b', updatedAt: 2 }),
    ]
    const original = [...sessions]

    buildRecentSessionList(sessions)

    expect(sessions).toEqual(original)
  })
})

describe('sortSessions', () => {
  const sessions = [
    session({ id: 's-b', title: 'Banana', updatedAt: 100, createdAt: 10 }),
    session({ id: 's-a', title: 'Apple', updatedAt: 300, createdAt: 30 }),
    session({ id: 's-c', title: 'Cherry', updatedAt: 200, createdAt: 20 }),
  ]

  test('Given sortBy=recency When 排序 Then 按 updatedAt 降序', () => {
    expect(sortSessions(sessions, 'recency').map((s) => s.id)).toEqual(['s-a', 's-c', 's-b'])
  })

  test('Given sortBy=alphabetical When 排序 Then 按标题排序', () => {
    expect(sortSessions(sessions, 'alphabetical').map((s) => s.id)).toEqual(['s-a', 's-b', 's-c'])
  })

  test('Given sortBy=createdAt When 排序 Then 按创建时间降序', () => {
    expect(sortSessions(sessions, 'createdAt').map((s) => s.id)).toEqual(['s-a', 's-c', 's-b'])
  })
})

describe('groupSessionsByState', () => {
  test('Given 多种状态混合 When 分组 Then 按 需要处理>进行中>已完成>空闲 优先级排列且跳过空桶', () => {
    const sessions = [
      session({ id: 's-idle', updatedAt: 1 }),
      session({ id: 's-blocked', updatedAt: 2 }),
      session({ id: 's-running', updatedAt: 3 }),
    ]
    const indicatorMap = new Map<string, SessionIndicatorStatus>([
      ['s-idle', 'idle'],
      ['s-blocked', 'blocked'],
      ['s-running', 'running'],
    ])

    const groups = groupSessionsByState(sessions, indicatorMap)

    expect(groups.map((g) => g.label)).toEqual(['需要处理', '进行中', '空闲'])
    expect(groups[0]!.items.map((s) => s.id)).toEqual(['s-blocked'])
  })

  test('Given 会话不在 indicatorMap 中 When 分组 Then 兜底归为空闲', () => {
    const sessions = [session({ id: 's-unknown', updatedAt: 1 })]

    const groups = groupSessionsByState(sessions, new Map())

    expect(groups).toEqual([{ label: '空闲', items: sessions }])
  })
})

describe('groupSessionsByCustomGroup', () => {
  const groupA: SessionGroup = { id: 'g-a', name: 'A 组', createdAt: 1, updatedAt: 1 }
  const groupB: SessionGroup = { id: 'g-b', name: 'B 组', createdAt: 1, updatedAt: 1 }

  test('Given 会话分属不同分组与未分组 When 分组 Then 按分组列表顺序排列且未分组殿后', () => {
    const sessions = [
      session({ id: 's-1', updatedAt: 1, customGroupId: 'g-a' }),
      session({ id: 's-2', updatedAt: 2 }),
      session({ id: 's-3', updatedAt: 3, customGroupId: 'g-b' }),
    ]

    const groups = groupSessionsByCustomGroup(sessions, [groupA, groupB])

    expect(groups.map((g) => g.label)).toEqual(['A 组', 'B 组', UNGROUPED_SESSION_LABEL])
    expect(groups[2]!.items.map((s) => s.id)).toEqual(['s-2'])
  })

  test('Given customGroupId 指向已删除的分组 When 分组 Then 归入未分组桶', () => {
    const sessions = [session({ id: 's-orphan', updatedAt: 1, customGroupId: 'g-deleted' })]

    const groups = groupSessionsByCustomGroup(sessions, [groupA])

    expect(groups).toEqual([{ label: UNGROUPED_SESSION_LABEL, items: sessions }])
  })

  test('Given 分组存在但无会话 When 分组 Then 该分组不出现在结果中', () => {
    const sessions = [session({ id: 's-1', updatedAt: 1, customGroupId: 'g-a' })]

    const groups = groupSessionsByCustomGroup(sessions, [groupA, groupB])

    expect(groups.map((g) => g.label)).toEqual(['A 组'])
  })
})
