import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@luxcoder/shared'
import type { TaskSpec } from '@luxcoder/shared/tasks/schema'
import { loadTaskRecord, loadTaskSpec, taskDir } from '@luxcoder/shared/tasks/storage'
import {
  materializeTaskTransaction,
  recoverTaskMaterializations,
  type TaskMaterializationDependencies,
} from './task-materialization-service'

const roots: string[] = []
function root(): string { const value = mkdtempSync(join(tmpdir(), 'luxcoder-materialize-')); roots.push(value); return value }
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }) })

function spec(): TaskSpec {
  return {
    id: 'demo-task', title: 'Demo', goal: 'Materialize safely', runner: 'conduct',
    nodes: [{ id: 'execute', kind: 'session', prompt: 'work' }],
  }
}

function session(id: string, patch: Partial<AgentSessionMeta> = {}): AgentSessionMeta {
  return { id, title: id, workspaceId: 'ws-1', createdAt: 1, updatedAt: 1, ...patch }
}

function dependencies(overrides: Partial<TaskMaterializationDependencies> = {}): TaskMaterializationDependencies {
  const sessions = new Map<string, AgentSessionMeta>()
  return {
    createSession: async (_workspaceId, options) => {
      const created = session('created-session', options as Partial<AgentSessionMeta>)
      sessions.set(created.id, created)
      return created
    },
    getSession: (id) => sessions.get(id),
    updateSession: (id, patch) => {
      const current = sessions.get(id)
      if (!current) throw new Error(`missing session ${id}`)
      const updated = { ...current, ...patch, updatedAt: current.updatedAt }
      sessions.set(id, updated)
      return updated
    },
    deleteSession: (id) => { sessions.delete(id) },
    generateTaskId: () => '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
    generateTransactionId: () => 'tx-1',
    now: () => 100,
    commitTaskDirectory: renameSync,
    ...overrides,
  }
}

describe('materializeTaskTransaction', () => {
  test('createSession 失败时不留下正式或 staging Task', async () => {
    const workspaceRoot = root()
    const deps = dependencies({ createSession: async () => { throw new Error('channel unavailable') } })

    await expect(materializeTaskTransaction({
      workspaceRoot, workspaceId: 'ws-1', spec: spec(),
      mode: { kind: 'create', sessionOptions: { sessionStatus: 'todo' } },
    }, deps)).rejects.toThrow('channel unavailable')

    expect(existsSync(taskDir(workspaceRoot, 'demo-task'))).toBe(false)
    expect(recoverTaskMaterializations(workspaceRoot, deps)).toEqual([])
  })

  test('成功后原子提交 task.yaml/task.json 并绑定 orchestrator', async () => {
    const workspaceRoot = root()
    const deps = dependencies()

    const result = await materializeTaskTransaction({
      workspaceRoot, workspaceId: 'ws-1', spec: spec(),
      mode: { kind: 'create', sessionOptions: { sessionStatus: 'todo' } },
    }, deps)

    expect(result).toEqual({
      slug: 'demo-task',
      taskId: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
      orchestratorSessionId: 'created-session',
    })
    expect(loadTaskSpec(workspaceRoot, 'demo-task')?.spec).toEqual(spec())
    expect(loadTaskRecord(workspaceRoot, 'demo-task')).toEqual({
      kind: 'valid',
      record: expect.objectContaining({ orchestratorSessionId: 'created-session' }),
    })
    expect(recoverTaskMaterializations(workspaceRoot, deps)).toEqual([])
  })

  test('创建时保留 source / teambitionTaskId / type 到 TaskRecord（防二次写覆盖）', async () => {
    const workspaceRoot = root()
    const deps = dependencies()
    const tbSpec: TaskSpec = {
      ...spec(),
      source: 'teambition',
      teambitionTaskId: 'tb-task-001',
      type: 'task',
    }

    await materializeTaskTransaction({
      workspaceRoot, workspaceId: 'ws-1', spec: tbSpec,
      mode: { kind: 'create', sessionOptions: { sessionStatus: 'todo' } },
    }, deps)

    const loaded = loadTaskRecord(workspaceRoot, 'demo-task')
    expect(loaded.kind).toBe('valid')
    if (loaded.kind === 'valid') {
      expect(loaded.record).toEqual(expect.objectContaining({
        source: 'teambition',
        teambitionTaskId: 'tb-task-001',
        type: 'task',
        orchestratorSessionId: 'created-session',
      }))
    }
  })

  test('Task commit 失败时补偿删除尚未对外返回的新 Session', async () => {
    const workspaceRoot = root()
    let deleted: string | undefined
    const deps = dependencies({
      commitTaskDirectory: () => { throw new Error('disk full') },
      deleteSession: (id) => { deleted = id },
    })

    await expect(materializeTaskTransaction({
      workspaceRoot, workspaceId: 'ws-1', spec: spec(),
      mode: { kind: 'create', sessionOptions: {} },
    }, deps)).rejects.toThrow('disk full')

    expect(deleted).toBe('created-session')
    expect(existsSync(taskDir(workspaceRoot, 'demo-task'))).toBe(false)
  })

  test('attach 更新失败时不提交 Task', async () => {
    const workspaceRoot = root()
    const existing = session('existing')
    const deps = dependencies({
      getSession: () => existing,
      updateSession: () => { throw new Error('index write failed') },
    })

    await expect(materializeTaskTransaction({
      workspaceRoot, workspaceId: 'ws-1', spec: spec(),
      mode: { kind: 'attach', sessionId: existing.id, sessionPatch: { taskSlug: 'demo-task' } },
    }, deps)).rejects.toThrow('index write failed')
    expect(existsSync(taskDir(workspaceRoot, 'demo-task'))).toBe(false)
  })
})
