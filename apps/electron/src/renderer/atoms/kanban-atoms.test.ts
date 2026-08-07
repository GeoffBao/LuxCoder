import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import type { TaskAggregateSummary } from '@myyoda/shared/tasks'
import {
  kanbanNotificationsAtom,
  moveCardAtom,
  serverTaskSummariesAtom,
} from './kanban-atoms'

function createTask(overrides: Partial<TaskAggregateSummary> = {}): TaskAggregateSummary {
  return {
    taskId: '22222222-2222-4222-8222-222222222222',
    taskSlug: 'custom-column-task',
    title: '自定义列任务',
    scope: { kind: 'project', projectId: 'project-a' },
    workflow: 'in-progress',
    revision: 1,
    labelIds: [],
    runCount: 0,
    legacyIdentity: false,
    health: 'ready',
    diagnostics: [],
    ...overrides,
  }
}

function withMockElectronApi(
  tasks: {
    updateMetadata?: (...args: unknown[]) => Promise<TaskAggregateSummary>
    updateWorkflow?: (...args: unknown[]) => Promise<TaskAggregateSummary>
  },
  run: () => Promise<void>,
): Promise<void> {
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        tasks: {
          updateMetadata: tasks.updateMetadata ?? (() => Promise.reject(new Error('updateMetadata 未被 mock'))),
          updateWorkflow: tasks.updateWorkflow ?? (() => Promise.reject(new Error('updateWorkflow 未被 mock'))),
        },
        sessions: {
          move: (): never => { throw new Error('不应调用 Session move') },
        },
      },
    },
  })
  return run().finally(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  })
}

describe('moveCardAtom 自定义列路径（columnPlacementMode: custom）', () => {
  test('仅落盘列位置，不联动 workflow（dropStatusId 未设置）', async () => {
    const task = createTask()
    const metadataCalls: unknown[][] = []
    const workflowCalls: unknown[][] = []

    await withMockElectronApi({
      updateMetadata: (...args) => {
        metadataCalls.push(args)
        return Promise.resolve({ ...task, kanbanColumn: 'col-design', revision: 2 })
      },
      updateWorkflow: (...args) => {
        workflowCalls.push(args)
        return Promise.resolve(task)
      },
    }, async () => {
      const store = createStore()
      store.set(serverTaskSummariesAtom, [task])

      await store.set(moveCardAtom, {
        itemId: task.taskId,
        columnId: 'col-design',
        workspaceRoot: '/workspace',
        workspaceId: 'ws-1',
        columnPlacementMode: 'custom',
      })

      expect(metadataCalls).toHaveLength(1)
      expect(metadataCalls[0]).toEqual([
        '/workspace', 'ws-1', task.taskId,
        { kanbanColumn: 'col-design', expectedRevision: 1 },
      ])
      expect(workflowCalls).toHaveLength(0)
      expect(store.get(serverTaskSummariesAtom)?.[0]).toEqual(
        expect.objectContaining({ kanbanColumn: 'col-design', revision: 2, workflow: 'in-progress' }),
      )
    })
  })

  test('落列后按 dropStatusId 链式联动 workflow', async () => {
    const task = createTask()
    const metadataCalls: unknown[][] = []
    const workflowCalls: unknown[][] = []

    await withMockElectronApi({
      updateMetadata: (...args) => {
        metadataCalls.push(args)
        return Promise.resolve({ ...task, kanbanColumn: 'col-review', revision: 2 })
      },
      updateWorkflow: (...args) => {
        workflowCalls.push(args)
        return Promise.resolve({ ...task, kanbanColumn: 'col-review', workflow: 'done', revision: 3 })
      },
    }, async () => {
      const store = createStore()
      store.set(serverTaskSummariesAtom, [task])

      await store.set(moveCardAtom, {
        itemId: task.taskId,
        columnId: 'col-review',
        workspaceRoot: '/workspace',
        workspaceId: 'ws-1',
        columnPlacementMode: 'custom',
        dropStatusId: 'done',
      })

      expect(metadataCalls).toHaveLength(1)
      expect(workflowCalls).toHaveLength(1)
      // 链式 updateWorkflow 必须带上上一步返回的新 revision，避免并发冲突
      expect(workflowCalls[0]).toEqual(['/workspace', 'ws-1', task.taskId, 'done', 2])
      expect(store.get(serverTaskSummariesAtom)?.[0]).toEqual(
        expect.objectContaining({ kanbanColumn: 'col-review', workflow: 'done', revision: 3 }),
      )
    })
  })

  test('dropStatusId 与当前 workflow 相同则不重复调用 updateWorkflow', async () => {
    const task = createTask({ workflow: 'in-progress' })
    const workflowCalls: unknown[][] = []

    await withMockElectronApi({
      updateMetadata: (...args) => {
        void args
        return Promise.resolve({ ...task, kanbanColumn: 'col-progress', revision: 2 })
      },
      updateWorkflow: (...args) => {
        workflowCalls.push(args)
        return Promise.resolve(task)
      },
    }, async () => {
      const store = createStore()
      store.set(serverTaskSummariesAtom, [task])

      await store.set(moveCardAtom, {
        itemId: task.taskId,
        columnId: 'col-progress',
        workspaceRoot: '/workspace',
        workspaceId: 'ws-1',
        columnPlacementMode: 'custom',
        dropStatusId: 'in-progress',
      })

      expect(workflowCalls).toHaveLength(0)
    })
  })

  test('自定义列移动失败时回滚到原列并发出错误通知', async () => {
    const task = createTask()
    await withMockElectronApi({
      updateMetadata: () => Promise.reject(new Error('模拟持久化失败')),
    }, async () => {
      const store = createStore()
      store.set(serverTaskSummariesAtom, [task])

      await store.set(moveCardAtom, {
        itemId: task.taskId,
        columnId: 'col-design',
        workspaceRoot: '/workspace',
        workspaceId: 'ws-1',
        columnPlacementMode: 'custom',
      })

      // 回滚：kanbanColumn 字段恢复为原值（无该 key），workflow 不变
      const rolledBack = store.get(serverTaskSummariesAtom)?.[0]
      expect(rolledBack?.kanbanColumn).toBeUndefined()
      expect(rolledBack?.workflow).toBe('in-progress')
      expect(rolledBack?.revision).toBe(1)
      const notifications = store.get(kanbanNotificationsAtom)
      expect(notifications).toHaveLength(1)
      expect(notifications[0]?.level).toBe('error')
      expect(notifications[0]?.message).toContain('模拟持久化失败')
    })
  })
})

describe('moveCardAtom 默认路径（columnPlacementMode 缺省）', () => {
  test('行为保持不变：列即状态，走 updateWorkflow 且不写 kanbanColumn', async () => {
    const task = createTask()
    const metadataCalls: unknown[][] = []
    const workflowCalls: unknown[][] = []

    await withMockElectronApi({
      updateMetadata: (...args) => {
        metadataCalls.push(args)
        return Promise.resolve(task)
      },
      updateWorkflow: (...args) => {
        workflowCalls.push(args)
        return Promise.resolve({ ...task, workflow: 'done', revision: 2 })
      },
    }, async () => {
      const store = createStore()
      store.set(serverTaskSummariesAtom, [task])

      await store.set(moveCardAtom, {
        itemId: task.taskId,
        columnId: 'done',
        workspaceRoot: '/workspace',
        workspaceId: 'ws-1',
      })

      expect(workflowCalls).toHaveLength(1)
      expect(workflowCalls[0]).toEqual(['/workspace', 'ws-1', task.taskId, 'done', 1])
      expect(metadataCalls).toHaveLength(0)
      const updated = store.get(serverTaskSummariesAtom)?.[0]
      expect(updated?.workflow).toBe('done')
      expect(updated?.revision).toBe(2)
      expect(updated?.kanbanColumn).toBeUndefined()
    })
  })
})
