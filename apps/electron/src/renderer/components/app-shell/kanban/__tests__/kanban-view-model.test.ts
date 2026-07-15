import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxagents/shared'
import {
  buildKanbanViewModel,
  type KanbanProject,
  type KanbanTaskRun,
  type TeambitionBinding,
} from '../kanban-view-model'

function createSession(overrides: Partial<AgentSessionMeta>): AgentSessionMeta {
  return {
    id: 'session-default',
    title: '默认会话',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const projects: KanbanProject[] = [
  { id: 'project-a', name: '项目 A' },
  { id: 'project-b', name: '项目 B' },
]

describe('buildKanbanViewModel', () => {
  test('将未绑定的普通会话放入 Inbox', () => {
    const model = buildKanbanViewModel({
      projects,
      sessions: [createSession({ id: 'inbox-session', title: '整理需求', updatedAt: 30 })],
      runs: [],
      bindings: [],
      filter: { projectId: null },
    })

    expect(model.listItems).toEqual([
      expect.objectContaining({ id: 'inbox-session', columnId: 'inbox', project: null }),
    ])
  })

  test('为任务会话派生节点进度', () => {
    const runs: KanbanTaskRun[] = [
      {
        taskSlug: 'release',
        runId: 'run-1',
        nodeStates: { build: 'done', verify: 'running', publish: 'pending' },
      },
    ]

    const model = buildKanbanViewModel({
      projects,
      sessions: [createSession({
        id: 'task-session',
        taskSlug: 'release',
        taskRunId: 'run-1',
        taskNodeCount: 3,
        updatedAt: 20,
      })],
      runs,
      bindings: [],
      filter: { projectId: null },
    })

    expect(model.listItems[0]?.taskRun).toEqual({ completedNodes: 1, totalNodes: 3 })
    expect(model.listItems[0]?.subtasks.map((row) => row.title)).toEqual(['build', 'verify', 'publish'])
    expect(model.listItems[0]?.subtasks.map((row) => row.runState)).toEqual(['done', 'running', 'pending'])
  })

  test('合并 child session 与 spec nodes 为子任务行', () => {
    const model = buildKanbanViewModel({
      projects,
      sessions: [
        createSession({ id: 'parent', title: '主任务', taskSlug: 'release', updatedAt: 40 }),
        createSession({
          id: 'child-1',
          title: '构建',
          parentSessionId: 'parent',
          taskNodeId: 'build',
          sessionStatus: 'done',
          modelId: 'm1',
          updatedAt: 39,
        }),
      ],
      runs: [],
      bindings: [],
      filter: { projectId: null },
      specNodesBySlug: new Map([
        ['release', [
          { id: 'build', title: '构建' },
          { id: 'verify', title: '验证' },
        ]],
      ]),
    })

    expect(model.listItems[0]?.subtasks).toEqual([
      expect.objectContaining({ id: 'child-1', title: '构建', runState: 'done', sessionId: 'child-1' }),
      expect.objectContaining({ id: 'node:verify', title: '验证', runState: 'pending' }),
    ])
  })

  test('按项目筛选时排除其他项目的会话', () => {
    const model = buildKanbanViewModel({
      projects,
      sessions: [
        createSession({ id: 'project-a-session', projectId: 'project-a', updatedAt: 30 }),
        createSession({ id: 'project-b-session', projectId: 'project-b', updatedAt: 20 }),
      ],
      runs: [],
      bindings: [],
      filter: { projectId: 'project-a' },
    })

    expect(model.listItems.map((item) => item.id)).toEqual(['project-a-session'])
  })

  test('列表与看板使用相同的卡片顺序和派生的 Teambition 字段', () => {
    const bindings: TeambitionBinding[] = [
      {
        bindingId: 'binding-1',
        sessionId: 'bound-session',
        taskId: 'TW-1',
        title: '同步状态',
        status: 'coding',
        syncState: 'pending',
      },
    ]
    const model = buildKanbanViewModel({
      projects,
      sessions: [
        createSession({ id: 'older-session', updatedAt: 10 }),
        createSession({ id: 'bound-session', updatedAt: 40 }),
        createSession({ id: 'middle-session', updatedAt: 20 }),
      ],
      runs: [],
      bindings,
      filter: { projectId: null },
    })

    expect(model.boardItems.map((item) => item.id)).toEqual(model.listItems.map((item) => item.id))
    expect(model.listItems[0]?.teambition).toEqual({
      bindingId: 'binding-1',
      taskId: 'TW-1',
      title: '同步状态',
      status: 'coding',
      syncState: 'pending',
    })
  })

  test('顶层看板排除归档、生成草稿和子会话', () => {
    const model = buildKanbanViewModel({
      projects,
      sessions: [
        createSession({ id: 'visible-session', updatedAt: 50 }),
        createSession({ id: 'archived-session', archived: true, updatedAt: 40 }),
        createSession({ id: 'draft-session', taskDraft: true, updatedAt: 30 }),
        createSession({ id: 'child-session', parentSessionId: 'visible-session', updatedAt: 20 }),
      ],
      runs: [],
      bindings: [],
      filter: { projectId: null },
    })

    expect(model.listItems.map((item) => item.id)).toEqual(['visible-session'])
  })
})
