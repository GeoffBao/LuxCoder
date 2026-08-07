import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@myyoda/shared'
import { loadTaskRecord, saveTaskSpec, taskRecordPath, taskYamlPath } from '@myyoda/shared/tasks/storage'
import type { TaskSpec } from '@myyoda/shared/tasks/schema'
import { backfillLegacyTaskRecords } from './task-migration-service'

const tempRoots: string[] = []

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'myyoda-task-migration-'))
  tempRoots.push(root)
  return root
}

function buildSpec(id: string): TaskSpec {
  return {
    id,
    title: `Task ${id}`,
    goal: 'Backfill a stable identity without moving data',
    runner: 'conduct',
    nodes: [{ id: 'execute', kind: 'session', prompt: 'do the work' }],
  }
}

function session(overrides: Partial<AgentSessionMeta>): AgentSessionMeta {
  return {
    id: 'session-default',
    title: 'Task session',
    workspaceId: 'ws-alpha',
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('backfillLegacyTaskRecords', () => {
  test('为旧 task.yaml 回填稳定 taskId，重复运行不改 ID 或移动文件', () => {
    const root = createTempWorkspaceRoot()
    saveTaskSpec(root, buildSpec('legacy-task'))
    const beforeYaml = readFileSync(taskYamlPath(root, 'legacy-task'), 'utf8')
    const ids = [
      '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
      '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c73',
    ]

    const first = backfillLegacyTaskRecords({
      workspaceId: 'ws-alpha',
      workspaceRoot: root,
      sessions: [],
      now: () => 100,
      generateTaskId: () => ids.shift()!,
    })
    const second = backfillLegacyTaskRecords({
      workspaceId: 'ws-alpha',
      workspaceRoot: root,
      sessions: [],
      now: () => 200,
      generateTaskId: () => ids.shift()!,
    })

    expect(first).toEqual({
      migrated: [expect.objectContaining({ taskSlug: 'legacy-task', status: 'migrated' })],
      skipped: [],
      conflicted: [],
    })
    expect(second.migrated).toEqual([])
    expect(second.skipped).toEqual([expect.objectContaining({ taskSlug: 'legacy-task', status: 'skipped' })])
    expect(loadTaskRecord(root, 'legacy-task')).toEqual({
      kind: 'valid',
      record: expect.objectContaining({ taskId: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72' }),
    })
    expect(readFileSync(taskYamlPath(root, 'legacy-task'), 'utf8')).toBe(beforeYaml)
  })

  test('唯一 orchestrator 会话回填 link 和 workflow', () => {
    const root = createTempWorkspaceRoot()
    saveTaskSpec(root, buildSpec('linked-task'))

    backfillLegacyTaskRecords({
      workspaceId: 'ws-alpha',
      workspaceRoot: root,
      sessions: [
        session({ id: 'orchestrator', taskSlug: 'linked-task', kanbanColumn: 'in-progress' }),
        session({ id: 'child', taskSlug: 'linked-task', parentSessionId: 'orchestrator', taskNodeId: 'execute' }),
      ],
      now: () => 100,
      generateTaskId: () => '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
    })

    expect(loadTaskRecord(root, 'linked-task')).toEqual({
      kind: 'valid',
      record: expect.objectContaining({
        orchestratorSessionId: 'orchestrator',
        workflow: 'in-progress',
        createdAt: 10,
        updatedAt: 20,
      }),
    })
  })

  test('多个 orchestrator 候选时不猜测 link，并报告冲突', () => {
    const root = createTempWorkspaceRoot()
    saveTaskSpec(root, buildSpec('conflicted-task'))

    const result = backfillLegacyTaskRecords({
      workspaceId: 'ws-alpha',
      workspaceRoot: root,
      sessions: [
        session({ id: 'orchestrator-a', taskSlug: 'conflicted-task' }),
        session({ id: 'orchestrator-b', taskSlug: 'conflicted-task' }),
      ],
      now: () => 100,
      generateTaskId: () => '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
    })

    expect(result.conflicted).toEqual([
      expect.objectContaining({
        taskSlug: 'conflicted-task',
        status: 'conflicted',
        candidateSessionIds: ['orchestrator-a', 'orchestrator-b'],
      }),
    ])
    const loaded = loadTaskRecord(root, 'conflicted-task')
    expect(loaded.kind).toBe('valid')
    if (loaded.kind === 'valid') {
      expect(loaded.record.orchestratorSessionId).toBeUndefined()
    }
  })

  test('损坏或未知版本 task.json 不被迁移覆盖', () => {
    const root = createTempWorkspaceRoot()
    saveTaskSpec(root, buildSpec('invalid-record'))
    writeFileSync(taskRecordPath(root, 'invalid-record'), '{"schemaVersion":99}', 'utf8')

    const result = backfillLegacyTaskRecords({
      workspaceId: 'ws-alpha',
      workspaceRoot: root,
      sessions: [],
      now: () => 100,
      generateTaskId: () => '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
    })

    expect(result.migrated).toEqual([])
    expect(result.conflicted).toEqual([
      expect.objectContaining({ taskSlug: 'invalid-record', status: 'conflicted' }),
    ])
    expect(readFileSync(taskRecordPath(root, 'invalid-record'), 'utf8')).toBe('{"schemaVersion":99}')
  })
})
