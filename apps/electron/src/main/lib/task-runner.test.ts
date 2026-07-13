import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TaskSpec } from '@luxagents/shared/tasks/schema'
import { saveTaskSpec } from '@luxagents/shared/tasks/storage'
import {
  TaskRunner,
  type ConductorSessionHost,
  type CreateSessionOptions,
  type SessionCompletionEvent,
} from './task-runner'

const tempRoots: string[] = []

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxagents-task-runner-'))
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
    goal: 'Keep task runner scheduling deterministic',
    runner: 'conduct',
    nodes: [
      {
        id: 'draft',
        kind: 'session',
        prompt: 'draft the task',
      },
    ],
    ...overrides,
  }
}

class FakeConductorSessionHost implements ConductorSessionHost {
  readonly createdSessions: Array<{ id: string; workspaceId: string; options: CreateSessionOptions }> = []
  readonly sentMessages = new Map<string, string[]>()
  readonly cancelledSessions: string[] = []
  readonly statusUpdates: Array<{ sessionId: string; status: string }> = []
  readonly kanbanUpdates: Array<{ sessionId: string; column: string | null }> = []
  readonly taskNodeCounts: Array<{ sessionId: string; count: number }> = []

  private readonly listeners = new Set<(evt: SessionCompletionEvent) => void>()
  private readonly finalTexts = new Map<string, string>()
  private readonly workingDirectories = new Map<string, string>()
  private nextSessionId = 1

  async createSession(workspaceId: string, options: CreateSessionOptions): Promise<{ id: string }> {
    const id = `session-${this.nextSessionId++}`
    this.createdSessions.push({ id, workspaceId, options })
    if (options.workingDirectory) {
      this.workingDirectories.set(id, options.workingDirectory)
    }
    return { id }
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const existing = this.sentMessages.get(sessionId) ?? []
    existing.push(message)
    this.sentMessages.set(sessionId, existing)
  }

  async setSessionStatus(sessionId: string, status: string): Promise<void> {
    this.statusUpdates.push({ sessionId, status })
  }

  async setKanbanColumn(sessionId: string, column: string | null): Promise<void> {
    this.kanbanUpdates.push({ sessionId, column })
  }

  async setTaskNodeCount(sessionId: string, count: number): Promise<void> {
    this.taskNodeCounts.push({ sessionId, count })
  }

  async cancelProcessing(sessionId: string): Promise<void> {
    this.cancelledSessions.push(sessionId)
  }

  onSessionComplete(listener: (evt: SessionCompletionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSessionFinalText(sessionId: string): string | undefined {
    return this.finalTexts.get(sessionId)
  }

  getSessionWorkingDirectory(sessionId: string): string | undefined {
    return this.workingDirectories.get(sessionId)
  }

  completeSession(
    sessionId: string,
    overrides: Partial<SessionCompletionEvent> & Pick<SessionCompletionEvent, 'workspaceId'>,
  ): void {
    if (overrides.finalText !== undefined) {
      this.finalTexts.set(sessionId, overrides.finalText)
    }
    const event: SessionCompletionEvent = {
      sessionId,
      workspaceId: overrides.workspaceId,
      reason: overrides.reason ?? 'complete',
      ...(overrides.finalMessageId ? { finalMessageId: overrides.finalMessageId } : {}),
      ...(overrides.finalText !== undefined ? { finalText: overrides.finalText } : {}),
      ...(overrides.tokenUsage ? { tokenUsage: overrides.tokenUsage } : {}),
    }
    for (const listener of [...this.listeners]) {
      listener(event)
    }
  }
}

function createRunner(workspaceRoot: string, host: FakeConductorSessionHost, runId = 'run-1'): TaskRunner {
  return new TaskRunner({
    host,
    workspaceId: 'ws-1',
    workspaceRoot,
    defaultMaxParallel: 2,
    genRunId: () => runId,
    now: () => '2026-07-13T00:00:00.000Z',
  })
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('TaskRunner', () => {
  test('按依赖顺序调度节点', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      nodes: [
        { id: 'draft', kind: 'session', prompt: 'draft the task' },
        { id: 'review', kind: 'session', prompt: 'review ${nodes.draft.output}', depends_on: ['draft'] },
      ],
    }))

    const host = new FakeConductorSessionHost()
    const runner = createRunner(workspaceRoot, host)

    runner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()
    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['draft'])

    host.completeSession('session-1', { workspaceId: 'ws-1', finalText: 'draft output' })
    await flushAsyncWork()

    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['draft', 'review'])
    expect(host.sentMessages.get('session-2')?.[0]).toContain('review draft output')

    host.completeSession('session-2', { workspaceId: 'ws-1', finalText: 'reviewed' })

    await expect(runner.waitUntilSettled('demo-task', 'run-1')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        nodes: [
          expect.objectContaining({ id: 'draft', state: 'done', attempt: 1 }),
          expect.objectContaining({ id: 'review', state: 'done', attempt: 1 }),
        ],
      }),
    )
  })

  test('遵守 max_parallel 限制，直到有空槽才继续派发', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      max_parallel: 2,
      nodes: [
        { id: 'a', kind: 'session', prompt: 'task a' },
        { id: 'b', kind: 'session', prompt: 'task b' },
        { id: 'c', kind: 'session', prompt: 'task c' },
      ],
    }))

    const host = new FakeConductorSessionHost()
    const runner = createRunner(workspaceRoot, host)

    runner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()
    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['a', 'b'])

    host.completeSession('session-1', { workspaceId: 'ws-1', finalText: 'done a' })
    await flushAsyncWork()

    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['a', 'b', 'c'])
  })

  test('pause 阻止新的派发，resume 后继续调度', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      max_parallel: 1,
      nodes: [
        { id: 'a', kind: 'session', prompt: 'task a' },
        { id: 'b', kind: 'session', prompt: 'task b' },
      ],
    }))

    const host = new FakeConductorSessionHost()
    const runner = createRunner(workspaceRoot, host)

    runner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()
    runner.pause('demo-task', 'run-1')

    host.completeSession('session-1', { workspaceId: 'ws-1', finalText: 'done a' })

    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['a'])

    runner.resume('demo-task', 'run-1')
    await flushAsyncWork()

    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['a', 'b'])
  })

  test('stop 会取消所有活跃子 session 并进入 stopped', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      max_parallel: 2,
      nodes: [
        { id: 'a', kind: 'session', prompt: 'task a' },
        { id: 'b', kind: 'session', prompt: 'task b' },
      ],
    }))

    const host = new FakeConductorSessionHost()
    const runner = createRunner(workspaceRoot, host)

    runner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()

    await runner.stop('demo-task', 'run-1')

    expect(host.cancelledSessions).toEqual(['session-1', 'session-2'])
    expect(runner.getRunState('demo-task', 'run-1')).toEqual(
      expect.objectContaining({
        status: 'stopped',
        nodes: [
          expect.objectContaining({ id: 'a', state: 'cancelled' }),
          expect.objectContaining({ id: 'b', state: 'cancelled' }),
        ],
      }),
    )
  })

  test('失败后按 retry 设置重试，并将失败原因注入下一次 prompt', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      nodes: [
        {
          id: 'draft',
          kind: 'session',
          prompt: 'draft the task',
          retry: { limit: 1, when: 'error' },
        },
      ],
    }))

    const host = new FakeConductorSessionHost()
    const runner = createRunner(workspaceRoot, host)

    runner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()
    host.completeSession('session-1', { workspaceId: 'ws-1', reason: 'error' })
    await flushAsyncWork()

    expect(host.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['draft', 'draft'])
    expect(host.sentMessages.get('session-2')?.[0]).toContain('Previous attempt failed: error')

    host.completeSession('session-2', { workspaceId: 'ws-1', finalText: 'fixed output' })

    await expect(runner.waitUntilSettled('demo-task', 'run-1')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
        nodes: [expect.objectContaining({ id: 'draft', state: 'done', attempt: 2 })],
      }),
    )
  })

  test('rehydrate 不会重复派发已经 spawn 过的节点', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec())

    const firstHost = new FakeConductorSessionHost()
    const firstRunner = createRunner(workspaceRoot, firstHost)
    firstRunner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()

    expect(firstHost.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['draft'])

    const rehydratedHost = new FakeConductorSessionHost()
    const rehydratedRunner = createRunner(workspaceRoot, rehydratedHost)

    rehydratedRunner.resume('demo-task', 'run-1')
    await flushAsyncWork()

    expect(rehydratedHost.createdSessions).toHaveLength(0)
    expect(rehydratedRunner.getRunState('demo-task', 'run-1')).toEqual(
      expect.objectContaining({
        status: 'running',
        nodes: [expect.objectContaining({ id: 'draft', state: 'running', sessionId: 'session-1', attempt: 1 })],
      }),
    )
  })

  test('rehydrate 优先使用运行快照而不是已被编辑的 live task.yaml', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      nodes: [
        { id: 'draft', kind: 'session', prompt: 'draft the task' },
        { id: 'review', kind: 'session', prompt: 'review ${nodes.draft.output}', depends_on: ['draft'] },
      ],
    }))

    const firstHost = new FakeConductorSessionHost()
    const firstRunner = createRunner(workspaceRoot, firstHost)
    firstRunner.run('demo-task', { verifyOnComplete: false })
    await flushAsyncWork()

    saveTaskSpec(workspaceRoot, buildSpec({
      nodes: [
        { id: 'draft', kind: 'session', prompt: 'draft the task (mutated)' },
        { id: 'review', kind: 'session', prompt: 'MUTATED ${nodes.draft.output}', depends_on: ['draft'] },
      ],
    }))

    const rehydratedHost = new FakeConductorSessionHost()
    const rehydratedRunner = createRunner(workspaceRoot, rehydratedHost)

    rehydratedRunner.resume('demo-task', 'run-1')
    await flushAsyncWork()

    rehydratedHost.completeSession('session-1', { workspaceId: 'ws-1', finalText: 'draft output' })
    await flushAsyncWork()

    expect(rehydratedHost.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['review'])
    const reviewSessionId = rehydratedHost.createdSessions[0]?.id
    expect(reviewSessionId).toBeDefined()
    expect(rehydratedHost.sentMessages.get(reviewSessionId ?? '')?.[0]).toContain('review draft output')
    expect(rehydratedHost.sentMessages.get(reviewSessionId ?? '')?.[0]).not.toContain('MUTATED')
  })

  test('rehydrate 会恢复运行参数与 verifyOnComplete，避免受 live task.yaml 漂移影响', async () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec({
      params: [
        { name: 'topic', type: 'string', default: 'beta' },
      ],
      nodes: [
        { id: 'draft', kind: 'session', prompt: 'draft ${params.topic}' },
        { id: 'review', kind: 'session', prompt: 'review ${params.topic} ${nodes.draft.output}', depends_on: ['draft'] },
      ],
    }))

    const firstHost = new FakeConductorSessionHost()
    const firstRunner = createRunner(workspaceRoot, firstHost)
    firstRunner.run('demo-task', {
      orchestratorSessionId: 'orchestrator-1',
      params: { topic: 'alpha' },
      verifyOnComplete: false,
    })
    await flushAsyncWork()

    saveTaskSpec(workspaceRoot, buildSpec({
      params: [
        { name: 'topic', type: 'string', default: 'gamma' },
      ],
      nodes: [
        { id: 'draft', kind: 'session', prompt: 'draft ${params.topic} (mutated)' },
        { id: 'review', kind: 'session', prompt: 'MUTATED ${params.topic} ${nodes.draft.output}', depends_on: ['draft'] },
      ],
    }))

    const rehydratedHost = new FakeConductorSessionHost()
    const rehydratedRunner = createRunner(workspaceRoot, rehydratedHost)

    rehydratedRunner.resume('demo-task', 'run-1')
    await flushAsyncWork()

    rehydratedHost.completeSession('session-1', { workspaceId: 'ws-1', finalText: 'draft output' })
    await flushAsyncWork()

    expect(rehydratedHost.createdSessions.map((session) => session.options.taskNodeId)).toEqual(['review'])
    const reviewSessionId = rehydratedHost.createdSessions[0]?.id
    expect(reviewSessionId).toBeDefined()
    expect(rehydratedHost.sentMessages.get(reviewSessionId ?? '')?.[0]).toContain('review alpha draft output')
    expect(rehydratedHost.sentMessages.get(reviewSessionId ?? '')?.[0]).not.toContain('MUTATED')

    rehydratedHost.completeSession(reviewSessionId ?? '', { workspaceId: 'ws-1', finalText: 'reviewed alpha' })

    await expect(rehydratedRunner.waitUntilSettled('demo-task', 'run-1')).resolves.toEqual(
      expect.objectContaining({
        status: 'completed',
      }),
    )
    expect(rehydratedHost.sentMessages.has('orchestrator-1')).toBe(false)
  })
})
