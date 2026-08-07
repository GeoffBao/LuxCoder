import { expect, test } from 'bun:test'
import { createStore } from 'jotai/vanilla'
import type { AgentSessionMeta, TaskAggregateSummary } from '@myyoda/shared'
import {
  kanbanItemsAtom,
  kanbanNotificationsAtom,
  moveCardAtom,
  optimisticKanbanColumnsAtom,
  serverKanbanSessionsAtom,
  serverTaskSummariesAtom,
} from '@/atoms/kanban-atoms'

function createSession(): AgentSessionMeta {
  return {
    id: 'session-1',
    title: '可移动会话',
    kanbanColumn: 'todo',
    createdAt: 1,
    updatedAt: 1,
  }
}

function createDeferred(): { promise: Promise<void>; reject: (reason: Error) => void } {
  let reject: (reason: Error) => void = () => undefined
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

function createSessionDeferred(): {
  promise: Promise<AgentSessionMeta>
  resolve: (session: AgentSessionMeta) => void
} {
  let resolve: (session: AgentSessionMeta) => void = () => undefined
  const promise = new Promise<AgentSessionMeta>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

test('正式 Task 拖动按 stable taskId 更新 Workflow，而不是误用 Session API', async () => {
  const originalWindow = globalThis.window
  const calls: unknown[][] = []
  const task: TaskAggregateSummary = {
    taskId: '22222222-2222-4222-8222-222222222222',
    taskSlug: 'stable-task',
    title: 'Stable Task',
    scope: { kind: 'workspace' },
    workflow: 'todo',
    revision: 1,
    labelIds: [],
    runCount: 0,
    legacyIdentity: false,
    health: 'ready',
    diagnostics: [],
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        tasks: {
          updateWorkflow: (...args: unknown[]): Promise<TaskAggregateSummary> => {
            calls.push(args)
            return Promise.resolve({ ...task, workflow: 'done', revision: 2 })
          },
        },
        sessions: {
          move: (): never => { throw new Error('不应调用 Session move') },
        },
      },
    },
  })

  try {
    const store = createStore()
    store.set(serverTaskSummariesAtom, [task])
    await store.set(moveCardAtom, {
      itemId: task.taskId,
      columnId: 'done',
      workspaceRoot: '/workspace',
      workspaceId: 'ws-1',
    })

    expect(calls).toEqual([['/workspace', 'ws-1', task.taskId, 'done', 1]])
    expect(store.get(serverTaskSummariesAtom)?.[0]).toEqual(
      expect.objectContaining({ workflow: 'done', revision: 2 }),
    )
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})

test('移动失败后还原原列并只发出一条错误通知', async () => {
  const deferred = createDeferred()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        sessions: {
          move: (): Promise<void> => deferred.promise,
        },
      },
    },
  })

  try {
    const store = createStore()
    store.set(serverTaskSummariesAtom, undefined)
    store.set(serverKanbanSessionsAtom, [createSession()])
    store.set(optimisticKanbanColumnsAtom, new Map())
    store.set(kanbanNotificationsAtom, [])

    const move = store.set(moveCardAtom, { sessionId: 'session-1', columnId: 'done' })
    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('done')

    deferred.reject(new Error('保存看板列失败'))
    await move

    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('todo')
    expect(store.get(kanbanNotificationsAtom)).toEqual([
      expect.objectContaining({ level: 'error', message: '保存看板列失败' }),
    ])
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})

test('同一卡片连续移动均失败时回到最后确认的服务端列', async () => {
  const first = createDeferred()
  const second = createDeferred()
  const originalWindow = globalThis.window
  let calls = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        sessions: {
          move: (): Promise<void> => {
            calls += 1
            return calls === 1 ? first.promise : second.promise
          },
        },
      },
    },
  })

  try {
    const store = createStore()
    store.set(serverTaskSummariesAtom, undefined)
    store.set(serverKanbanSessionsAtom, [createSession()])
    store.set(optimisticKanbanColumnsAtom, new Map())
    store.set(kanbanNotificationsAtom, [])

    const moveA = store.set(moveCardAtom, { sessionId: 'session-1', columnId: 'in-progress' })
    const moveB = store.set(moveCardAtom, { sessionId: 'session-1', columnId: 'done' })
    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('done')

    first.reject(new Error('A 失败'))
    await moveA
    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('done')

    second.reject(new Error('B 失败'))
    await moveB

    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('todo')
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})

test('同一卡片成功响应乱序时保留最后请求的服务端列', async () => {
  const first = createSessionDeferred()
  const second = createSessionDeferred()
  const originalWindow = globalThis.window
  let calls = 0
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        sessions: {
          move: (): Promise<AgentSessionMeta> => {
            calls += 1
            return calls === 1 ? first.promise : second.promise
          },
        },
      },
    },
  })

  try {
    const store = createStore()
    store.set(serverTaskSummariesAtom, undefined)
    store.set(serverKanbanSessionsAtom, [createSession()])
    store.set(optimisticKanbanColumnsAtom, new Map())

    const moveA = store.set(moveCardAtom, { sessionId: 'session-1', columnId: 'in-progress' })
    const moveB = store.set(moveCardAtom, { sessionId: 'session-1', columnId: 'done' })

    second.resolve({ ...createSession(), kanbanColumn: 'done', updatedAt: 3 })
    await moveB
    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('done')

    first.resolve({ ...createSession(), kanbanColumn: 'in-progress', updatedAt: 2 })
    await moveA

    expect(store.get(serverKanbanSessionsAtom)[0]?.kanbanColumn).toBe('done')
    expect(store.get(kanbanItemsAtom)[0]?.columnId).toBe('done')
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})
