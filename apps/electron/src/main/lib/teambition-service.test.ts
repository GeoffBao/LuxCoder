import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  TeambitionAuthenticationError,
  TeambitionConflictError,
  TeambitionService,
  type TeambitionGateway,
  type TeambitionGatewayCapabilities,
  type TeambitionRemoteTask,
} from './teambition-service'

class MockGateway implements TeambitionGateway {
  capabilities: TeambitionGatewayCapabilities = {
    listTasks: true,
    claimTask: true,
    updateStatus: true,
    syncProgress: true,
  }
  tasks: TeambitionRemoteTask[] = []
  claims: string[] = []
  statuses: string[] = []
  progress: number[] = []
  failure: Error | null = null

  async probeCapabilities(): Promise<TeambitionGatewayCapabilities> { return this.capabilities }
  async listClaimableTasks(): Promise<TeambitionRemoteTask[]> { return this.tasks }
  async claimTask(taskId: string, idempotencyKey: string): Promise<TeambitionRemoteTask> {
    if (this.failure) throw this.failure
    this.claims.push(idempotencyKey)
    const task = this.tasks.find((candidate) => candidate.id === taskId)
    if (!task) throw new Error('任务不存在')
    return task
  }
  async updateStatus(_taskId: string, status: string): Promise<void> {
    if (this.failure) throw this.failure
    this.statuses.push(status)
  }
  async syncProgress(_taskId: string, progress: number): Promise<void> {
    if (this.failure) throw this.failure
    this.progress.push(progress)
  }
}

function createFixture(gateway?: TeambitionGateway, now: () => number = () => 1_000): {
  service: TeambitionService
  cleanup: () => void
} {
  const root = mkdtempSync(join(tmpdir(), 'luxcoder-teambition-'))
  return {
    service: new TeambitionService({
      storagePath: join(root, 'bindings.json'),
      gateway,
      now,
      staleAfterMs: 100,
      statusMap: { done: 'remote-done' },
    }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

describe('TeambitionService', () => {
  test('缺少凭据时 capability 返回 needsReauth，不阻塞本地看板', async () => {
    const { service, cleanup } = createFixture()
    try {
      await expect(service.probeCapabilities()).resolves.toEqual({
        listTasks: false,
        claimTask: false,
        updateStatus: false,
        syncProgress: false,
        needsReauth: true,
      })
      await expect(service.listClaimableTasks('project-a')).resolves.toEqual({ tasks: [], needsReauth: true })
    } finally { cleanup() }
  })

  test('capability 缺失时不会调用远端写操作', async () => {
    const gateway = new MockGateway()
    gateway.capabilities.claimTask = false
    gateway.tasks = [{ id: 'TW-1', title: '远端任务', projectId: 'project-a', updatedAt: 1_000 }]
    const { service, cleanup } = createFixture(gateway)
    try {
      await expect(service.claimTask({
        projectId: 'project-a',
        remoteTaskId: 'TW-1',
        sessionId: 'session-1',
        idempotencyKey: 'claim-1',
      })).rejects.toThrow('不支持认领')
      expect(gateway.claims).toEqual([])
    } finally { cleanup() }
  })

  test('claim 使用幂等键，只调用一次远端并持久化 binding', async () => {
    const gateway = new MockGateway()
    gateway.tasks = [{ id: 'TW-1', title: '远端任务', projectId: 'project-a', status: 'todo', updatedAt: 1_000 }]
    const { service, cleanup } = createFixture(gateway)
    try {
      const input = {
        projectId: 'project-a',
        remoteTaskId: 'TW-1',
        sessionId: 'session-1',
        idempotencyKey: 'claim-1',
      }
      const first = await service.claimTask(input)
      const second = await service.claimTask(input)
      expect(second).toEqual(first)
      expect(gateway.claims).toEqual(['claim-1'])

      const reloaded = new TeambitionService({ storagePath: service.storagePath, gateway })
      expect(reloaded.getBinding('session-1')).toEqual(first)
    } finally { cleanup() }
  })

  test('同步状态应用项目映射，网络失败保留 pending 供重试', async () => {
    const gateway = new MockGateway()
    const { service, cleanup } = createFixture(gateway)
    try {
      const binding = service.bindTask('session-1', {
        id: 'TW-1', title: '远端任务', projectId: 'project-a', updatedAt: 1_000,
      })
      await expect(service.syncStatus(binding.id, 'done')).resolves.toEqual(expect.objectContaining({ syncState: 'synced' }))
      expect(gateway.statuses).toEqual(['remote-done'])

      gateway.failure = new Error('offline')
      const pending = await service.syncStatus(binding.id, 'todo')
      expect(pending).toEqual(expect.objectContaining({ syncState: 'pending', pendingOperation: expect.any(Object) }))
    } finally { cleanup() }
  })

  test('远端冲突与鉴权失败分别映射 conflict / needs-reauth', async () => {
    const gateway = new MockGateway()
    const { service, cleanup } = createFixture(gateway)
    try {
      const binding = service.bindTask('session-1', {
        id: 'TW-1', title: '远端任务', projectId: 'project-a', updatedAt: 1_000,
      })
      gateway.failure = new TeambitionConflictError('远端已更新')
      expect(await service.syncProgress(binding.id, 50)).toEqual(expect.objectContaining({ syncState: 'conflict' }))

      gateway.failure = new TeambitionAuthenticationError('token 失效')
      expect(await service.syncProgress(binding.id, 60)).toEqual(expect.objectContaining({ syncState: 'needs-reauth' }))
    } finally { cleanup() }
  })

  test('过期远端任务标记 stale，已绑定任务不再出现在可认领列表', async () => {
    const gateway = new MockGateway()
    gateway.tasks = [
      { id: 'TW-old', title: '旧任务', projectId: 'project-a', updatedAt: 800 },
      { id: 'TW-bound', title: '已绑定', projectId: 'project-a', updatedAt: 1_000 },
    ]
    const { service, cleanup } = createFixture(gateway)
    try {
      service.bindTask('session-1', gateway.tasks[1]!)
      const oldTask = gateway.tasks[0]!
      expect(await service.listClaimableTasks('project-a')).toEqual({
        tasks: [{ ...oldTask, syncState: 'stale' }],
        needsReauth: false,
      })
    } finally { cleanup() }
  })
})
