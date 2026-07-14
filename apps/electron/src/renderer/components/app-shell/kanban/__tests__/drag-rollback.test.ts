import { expect, test } from 'bun:test'
import { createStore } from 'jotai/vanilla'
import type { AgentSessionMeta } from '@luxagents/shared'
import {
  kanbanItemsAtom,
  kanbanNotificationsAtom,
  moveCardAtom,
  optimisticKanbanColumnsAtom,
  serverKanbanSessionsAtom,
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
