import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxcoder/shared'
import type { KanbanProject } from '../kanban/types'
import {
  buildProjectSessionView,
  buildRecentSessionList,
  sameSessionIdSet,
} from '../sidebar-session-views.ts'

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

describe('sidebar-session-views', () => {
  test('recent 视图按 updatedAt 降序含未归类与 Project Session，同一 session id', () => {
    const sessions = [
      session({ id: 's-unbound', updatedAt: 100, title: '临时' }),
      session({ id: 's-proj', updatedAt: 200, projectId: 'p1', title: '项目会话' }),
      session({ id: 's-old', updatedAt: 50, projectId: 'p1', title: '旧' }),
    ]
    const projects: KanbanProject[] = [
      { id: 'p1', name: 'AI Dev', updatedAt: 300 },
    ]

    const recent = buildRecentSessionList(sessions)
    const projectView = buildProjectSessionView(sessions, projects)

    expect(recent.map((s) => s.id)).toEqual(['s-proj', 's-unbound', 's-old'])
    expect(sameSessionIdSet(recent, projectView)).toBe(true)
    expect(projectView.unboundSessions.map((s) => s.id)).toEqual(['s-unbound'])
    expect(projectView.projectGroups[0]?.sessions.map((s) => s.id)).toEqual(['s-proj', 's-old'])
  })

  test('项目视图底部未归类分组仅含 projectId 为空或指向失效项目的 session', () => {
    const sessions = [
      session({ id: 'bound', updatedAt: 1, projectId: 'p1' }),
      session({ id: 'empty', updatedAt: 2 }),
      session({ id: 'ghost', updatedAt: 3, projectId: 'deleted' }),
    ]
    const projects: KanbanProject[] = [
      { id: 'p1', name: 'Alive', updatedAt: 10 },
    ]
    const view = buildProjectSessionView(sessions, projects)
    expect(view.unboundSessions.map((s) => s.id).sort()).toEqual(['empty', 'ghost'])
    expect(view.projectGroups[0]?.sessions.map((s) => s.id)).toEqual(['bound'])
  })
})
