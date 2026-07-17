import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TaskSpec } from '../../../../../packages/shared/src/tasks/schema.ts'
import { TaskRepository } from './task-repository'

const tempRoots: string[] = []

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxagents-main-task-repo-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function buildSpec(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    id: 'demo-task',
    title: 'Demo task',
    goal: 'Keep the Task 5 slice bounded',
    runner: 'conduct',
    nodes: [
      {
        id: 'draft',
        kind: 'session',
        prompt: 'draft the slice',
      },
    ],
    ...overrides,
  }
}

function createRepository(workspaceRoots: Record<string, string>): TaskRepository {
  return new TaskRepository({
    resolveWorkspaceRoot(workspaceId) {
      const root = workspaceRoots[workspaceId]
      if (!root) {
        throw new Error(`未知工作区: ${workspaceId}`)
      }
      return root
    },
  })
}

describe('TaskRepository', () => {
  test('缺失任务时返回 null', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })

    expect(repository.getTask('ws-alpha', 'missing-task')).toBeNull()
  })

  test('validateTask 拒绝无效 spec', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })

    const result = repository.validateTask({
      id: 'demo-task',
      title: 'Broken task',
      goal: 'broken',
      runner: 'conduct',
      nodes: [
        {
          id: 'draft',
          kind: 'session',
          prompt: 'draft the slice',
          depends_on: ['missing-node'],
        },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((issue) => issue.path.includes('depends_on'))).toBe(true)
  })

  test('saveTask 后可列出并重新加载 TaskSpec', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })
    const spec = buildSpec()

    repository.saveTask('ws-alpha', spec)

    expect(repository.listTasks('ws-alpha')).toEqual(['demo-task'])
    expect(repository.getTask('ws-alpha', 'demo-task')).toEqual(
      expect.objectContaining({
        valid: true,
        spec,
      }),
    )
  })

  test('getRunState 聚合 snapshot、run-log 和 node output', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })
    const spec = buildSpec()

    repository.saveTask('ws-alpha', spec)
    repository.writeRunSpecSnapshot('ws-alpha', spec.id, 'run-1', spec)
    repository.appendRunLog('ws-alpha', spec.id, 'run-1', {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: spec.id,
      runId: 'run-1',
    })
    repository.appendRunLog('ws-alpha', spec.id, 'run-1', {
      t: '2026-07-13T00:00:01.000Z',
      kind: 'node-scheduled',
      nodeId: 'draft',
    })
    repository.appendRunLog('ws-alpha', spec.id, 'run-1', {
      t: '2026-07-13T00:00:02.000Z',
      kind: 'node-spawned',
      nodeId: 'draft',
      sessionId: 'session-1',
    })
    repository.appendRunLog('ws-alpha', spec.id, 'run-1', {
      t: '2026-07-13T00:00:03.000Z',
      kind: 'node-finished',
      nodeId: 'draft',
      sessionId: 'session-1',
      state: 'done',
    })
    repository.writeNodeOutput('ws-alpha', spec.id, 'run-1', 'draft', {
      text: 'done',
      params: { summary: 'ok' },
    })

    expect(repository.listRuns('ws-alpha', spec.id)).toEqual(['run-1'])
    expect(repository.getRunState('ws-alpha', spec.id, 'run-1')).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        spec,
        log: expect.arrayContaining([
          expect.objectContaining({ kind: 'run-started' }),
          expect.objectContaining({ kind: 'node-finished', state: 'done' }),
        ]),
        nodeOutputs: {
          draft: {
            text: 'done',
            params: { summary: 'ok' },
          },
        },
        nodeStates: {
          draft: {
            attempt: 1,
            sessionId: 'session-1',
            state: 'done',
          },
        },
      }),
    )
  })

  test('getRunState 在 spec 缺失时也会从 run-log 节点事件恢复 nodeStates', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })

    repository.appendRunLog('ws-alpha', 'orphan-task', 'run-2', {
      t: '2026-07-13T00:10:00.000Z',
      kind: 'run-started',
      taskId: 'orphan-task',
      runId: 'run-2',
    })
    repository.appendRunLog('ws-alpha', 'orphan-task', 'run-2', {
      t: '2026-07-13T00:10:01.000Z',
      kind: 'node-scheduled',
      nodeId: 'draft',
    })
    repository.appendRunLog('ws-alpha', 'orphan-task', 'run-2', {
      t: '2026-07-13T00:10:02.000Z',
      kind: 'node-spawned',
      nodeId: 'draft',
      sessionId: 'session-2',
    })
    repository.appendRunLog('ws-alpha', 'orphan-task', 'run-2', {
      t: '2026-07-13T00:10:03.000Z',
      kind: 'node-finished',
      nodeId: 'draft',
      sessionId: 'session-2',
      state: 'done',
    })
    repository.appendRunLog('ws-alpha', 'orphan-task', 'run-2', {
      t: '2026-07-13T00:10:04.000Z',
      kind: 'node-retry',
      nodeId: 'retry-only',
      attempt: 2,
      reason: 'transient',
    })
    repository.writeNodeOutput('ws-alpha', 'orphan-task', 'run-2', 'draft', {
      text: 'recovered',
      params: { summary: 'rehydrated' },
    })

    expect(repository.getRunState('ws-alpha', 'orphan-task', 'run-2')).toEqual(
      expect.objectContaining({
        spec: null,
        nodeOutputs: {
          draft: {
            text: 'recovered',
            params: { summary: 'rehydrated' },
          },
        },
        nodeStates: {
          draft: {
            attempt: 1,
            sessionId: 'session-2',
            state: 'done',
          },
          'retry-only': {
            attempt: 0,
            state: 'pending',
          },
        },
      }),
    )
  })
})
