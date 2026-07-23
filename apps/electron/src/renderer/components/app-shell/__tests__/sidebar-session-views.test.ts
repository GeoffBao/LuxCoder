import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { buildRecentSessionList } from '../sidebar-session-views.ts'

function session(partial: Partial<AgentSessionMeta> & Pick<AgentSessionMeta, 'id' | 'updatedAt'>): AgentSessionMeta {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? partial.updatedAt,
    updatedAt: partial.updatedAt,
    projectId: partial.projectId,
    workspaceId: partial.workspaceId ?? 'ws-1',
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
