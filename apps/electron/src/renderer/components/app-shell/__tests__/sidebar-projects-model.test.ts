import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxcoder/shared'
import {
  filterGroupableSessions,
  groupSessionsByProject,
  resolveProjectAttention,
  sortProjectsByActivity,
} from '../sidebar-projects-model'
import type { KanbanProject } from '../kanban/types'

function createSession(overrides: Partial<AgentSessionMeta>): AgentSessionMeta {
  return {
    id: 'session-default',
    title: '默认会话',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('resolveProjectAttention', () => {
  test('取组内最高优先级状态：blocked > running > completed', () => {
    const sessions = [
      createSession({ id: 'a' }),
      createSession({ id: 'b' }),
      createSession({ id: 'c' }),
    ]
    const indicatorMap = new Map<string, 'idle' | 'running' | 'blocked' | 'completed'>([
      ['a', 'completed'],
      ['b', 'blocked'],
      ['c', 'running'],
    ])

    expect(resolveProjectAttention(sessions, indicatorMap)).toBe('blocked')
    expect(resolveProjectAttention([sessions[0]!, sessions[2]!], indicatorMap)).toBe('running')
    expect(resolveProjectAttention([sessions[0]!], indicatorMap)).toBe('completed')
  })

  test('全部 idle 或无指示时返回 null（不显示注意力点）', () => {
    const sessions = [createSession({ id: 'a' }), createSession({ id: 'b' })]
    expect(resolveProjectAttention(sessions, new Map())).toBeNull()
    expect(resolveProjectAttention(sessions, new Map([['a', 'idle']]))).toBeNull()
  })
})

describe('filterGroupableSessions', () => {
  test('排除归档 / draft / 委派子会话 / 自动任务会话 / 跨工作区', () => {
    const sessions = [
      createSession({ id: 'keep-1', updatedAt: 5 }),
      createSession({ id: 'archived', archived: true }),
      createSession({ id: 'draft' }),
      createSession({ id: 'child', parentSessionId: 'keep-1' }),
      createSession({ id: 'automation', sourceAutomationId: 'auto-1' }),
      createSession({ id: 'pinned-automation', sourceAutomationId: 'auto-1', pinned: true }),
      createSession({ id: 'other-ws', workspaceId: 'ws-2' }),
      createSession({ id: 'current-ws', workspaceId: 'ws-1' }),
    ]

    const result = filterGroupableSessions(sessions, new Set(['draft']), 'ws-1')
    expect(result.map((session) => session.id)).toEqual(['keep-1', 'pinned-automation', 'current-ws'])
  })
})

describe('groupSessionsByProject', () => {
  test('按 projectId 分桶 + 组内 updatedAt 倒序 + 无项目会话不分桶', () => {
    const sessions = [
      createSession({ id: 'p1-old', projectId: 'proj-1', updatedAt: 10 }),
      createSession({ id: 'p1-new', projectId: 'proj-1', updatedAt: 30 }),
      createSession({ id: 'p2', projectId: 'proj-2', updatedAt: 20 }),
      createSession({ id: 'unbound-1', updatedAt: 25 }),
      createSession({ id: 'unbound-2', updatedAt: 40 }),
    ]

    const byProject = groupSessionsByProject(sessions)
    expect(byProject.get('proj-1')?.map((session) => session.id)).toEqual(['p1-new', 'p1-old'])
    expect(byProject.get('proj-2')?.map((session) => session.id)).toEqual(['p2'])
    expect(Array.from(byProject.keys())).toEqual(['proj-1', 'proj-2'])
  })
})

describe('sortProjectsByActivity', () => {
  test('有会话的项目按最新会话活跃度排前，无会话按项目 updatedAt 排后', () => {
    const projects: KanbanProject[] = [
      { id: 'empty-new', name: '空项目新', updatedAt: 100 },
      { id: 'active', name: '活跃项目', updatedAt: 1 },
      { id: 'empty-old', name: '空项目旧', updatedAt: 50 },
      { id: 'stale', name: '不活跃项目', updatedAt: 2 },
    ]
    const byProject = new Map<string, AgentSessionMeta[]>([
      ['active', [createSession({ id: 's1', projectId: 'active', updatedAt: 200 })]],
      ['stale', [createSession({ id: 's2', projectId: 'stale', updatedAt: 60 })]],
    ])

    expect(sortProjectsByActivity(projects, byProject).map((project) => project.id)).toEqual([
      'active',
      'stale',
      'empty-new',
      'empty-old',
    ])
  })
})
