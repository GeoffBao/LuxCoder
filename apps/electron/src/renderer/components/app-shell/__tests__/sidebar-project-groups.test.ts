import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxagents/shared'
import type { KanbanProject } from '../kanban/types'
import { buildSidebarProjectGroups } from '../sidebar-project-groups'

function session(id: string, overrides: Partial<AgentSessionMeta> = {}): AgentSessionMeta {
  return { id, title: id, createdAt: 1, updatedAt: 1, ...overrides } as AgentSessionMeta
}

function project(id: string, overrides: Partial<KanbanProject> = {}): KanbanProject {
  return { id, name: id, ...overrides }
}

describe('buildSidebarProjectGroups', () => {
  test('绑定会话归入项目组，未绑定进 unboundSessions', () => {
    const result = buildSidebarProjectGroups(
      [session('s1', { projectId: 'p1' }), session('s2')],
      [project('p1')],
    )
    expect(result.projectGroups).toHaveLength(1)
    expect(result.projectGroups[0]!.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s2'])
  })

  test('空项目也输出分组（会话数 0）', () => {
    const result = buildSidebarProjectGroups([], [project('p1')])
    expect(result.projectGroups).toHaveLength(1)
    expect(result.projectGroups[0]!.sessions).toEqual([])
  })

  test('归档项目不输出，其会话回退到未绑定', () => {
    const result = buildSidebarProjectGroups(
      [session('s1', { projectId: 'p1' })],
      [project('p1', { archivedAt: 123 })],
    )
    expect(result.projectGroups).toEqual([])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s1'])
  })

  test('projectId 指向不存在的项目时回退到未绑定', () => {
    const result = buildSidebarProjectGroups([session('s1', { projectId: 'ghost' })], [])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s1'])
  })

  test('项目按 updatedAt 降序，组内会话按 updatedAt 降序', () => {
    const result = buildSidebarProjectGroups(
      [
        session('old', { projectId: 'p1', updatedAt: 10 }),
        session('new', { projectId: 'p1', updatedAt: 20 }),
      ],
      [project('p1', { updatedAt: 5 }), project('p2', { updatedAt: 9 })],
    )
    expect(result.projectGroups.map((g) => g.project.id)).toEqual(['p2', 'p1'])
    expect(result.projectGroups[1]!.sessions.map((s) => s.id)).toEqual(['new', 'old'])
  })
})
