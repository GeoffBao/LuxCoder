import { describe, expect, test } from 'bun:test'
import type {
  TbDefectItem,
  TbStatusTransition,
  TbTaskDetail,
  TbWorkflow,
} from '@yoda/shared/teambition-defect'
import { TeambitionBoardService, type TeambitionBoardGateway } from './teambition-board-service'

const bugWorkflow: TbWorkflow = {
  taskflowId: 'defect-flow',
  statuses: [
    { id: 's-audit', name: '待审核', kind: 'start', pos: 65536, rejectStatusIds: ['s-new'], stage: 'waiting' },
    { id: 's-new', name: 'New', kind: 'unset', pos: 131072, rejectStatusIds: ['s-close'], stage: 'dev' },
    { id: 's-open', name: 'Open', kind: 'unset', pos: 851968, rejectStatusIds: ['s-new', 's-fixed'], stage: 'dev' },
    { id: 's-fixed', name: 'Fixed', kind: 'unset', pos: 786432, rejectStatusIds: ['s-open', 's-reopen', 's-close'], stage: 'waiting' },
    { id: 's-reopen', name: 'Reopen', kind: 'unset', pos: 917504, rejectStatusIds: ['s-open', 's-close'], stage: 'dev' },
    { id: 's-close', name: 'Close', kind: 'end', pos: 983040, rejectStatusIds: [], stage: 'closed' },
  ],
}

class StubGateway implements TeambitionBoardGateway {
  typeNamesCalls = 0
  workflowCalls = 0
  claimCalls: string[] = []
  statusCalls: Array<{ taskId: string; target: string; note?: string }> = []
  comments: Array<{ taskId: string; text: string }> = []
  private readonly typeNames: Map<string, string>
  constructor(workflow?: TbWorkflow) {
    this.workflow = workflow ?? bugWorkflow
    this.typeNames = new Map([['sfc-bug', '缺陷'], ['sfc-req', '需求']])
  }
  private readonly workflow: TbWorkflow
  async getCurrentUserId(): Promise<string> { return 'user-me' }
  async listTaskTypeNames(_projectId: string): Promise<Map<string, string>> {
    this.typeNamesCalls += 1
    return this.typeNames
  }
  async listProjectCustomFields(_projectId: string): Promise<Map<string, string>> {
    return new Map()
  }
  async listProjectNames(_projectIds: string[]): Promise<Map<string, string>> {
    return new Map()
  }
  async listMyDefects(_roleTypes?: string): Promise<TbDefectItem[]> {
    return []
  }
  async listClosedDefects(_days: number): Promise<TbDefectItem[]> {
    return []
  }
  async listProjectDefects(_projectId: string): Promise<TbDefectItem[]> {
    return []
  }
  async getTaskWorkflow(_taskId: string): Promise<TbWorkflow | undefined> {
    this.workflowCalls += 1
    return this.workflow
  }
  async listTransitions(_taskId: string): Promise<TbStatusTransition[]> { return [] }
  async getTaskDetail(taskId: string): Promise<TbTaskDetail> {
    return { taskId, content: 'c', projectId: 'p1', involveMembers: [], attachments: [], fields: [] }
  }
  async claimTask(taskId: string): Promise<void> { this.claimCalls.push(taskId) }
  async updateStatus(taskId: string, targetTfsId: string, note?: string): Promise<void> {
    this.statusCalls.push({ taskId, target: targetTfsId, note })
  }
  async postComment(taskId: string, text: string): Promise<void> {
    this.comments.push({ taskId, text })
  }
}

describe('TeambitionBoardService', () => {
  test('getCurrentUserId 带缓存：多次调用只走一次网关', async () => {
    let calls = 0
    const gateway: TeambitionBoardGateway = {
      getCurrentUserId: async () => { calls += 1; return 'user-me' },
      listTaskTypeNames: async () => new Map(),
      listProjectCustomFields: async () => new Map(),
      listMyDefects: async () => [],
      listClosedDefects: async () => [],
      listProjectNames: async () => new Map(),
      listProjectDefects: async () => [],
      getTaskWorkflow: async () => undefined,
      listTransitions: async () => [],
      getTaskDetail: async (taskId) => ({ taskId, content: 'c', projectId: 'p1', involveMembers: [], attachments: [], fields: [] }),
      claimTask: async () => undefined,
      updateStatus: async () => undefined,
      postComment: async () => undefined,
    }
    const service = new TeambitionBoardService({ gateway })
    expect(await service.getCurrentUserId()).toBe('user-me')
    expect(await service.getCurrentUserId()).toBe('user-me')
    expect(calls).toBe(1)
    service.clearCache()
    await service.getCurrentUserId()
    expect(calls).toBe(2)
  })

  test('listTaskTypeNames 带缓存：TTL 内不重复拉取，失败降级为空 Map', async () => {
    const gateway = new StubGateway()
    const service = new TeambitionBoardService({ gateway })
    const first = await service.listTaskTypeNames('p1')
    expect(first.get('sfc-bug')).toBe('缺陷')
    const second = await service.listTaskTypeNames('p1')
    expect(second.get('sfc-bug')).toBe('缺陷')
    expect(gateway.typeNamesCalls).toBe(1)
  })

  test('getTaskWorkflow 带缓存：同一任务不重复拉取', async () => {
    const gateway = new StubGateway()
    const service = new TeambitionBoardService({ gateway })
    const a = await service.getTaskWorkflow('t1', 'p1')
    const b = await service.getTaskWorkflow('t1', 'p1')
    expect(a?.statuses.length).toBe(6)
    expect(b?.statuses.length).toBe(6)
    expect(gateway.workflowCalls).toBe(1)
  })

  test('listWorkflowsForTasks 返回 Record（IPC 可序列化），可按 taskId 索引', async () => {
    const gateway = new StubGateway()
    const service = new TeambitionBoardService({ gateway })
    const result = await service.listWorkflowsForTasks(['t1', 't2'], 'p1')
    // Record 而非 Map：可用 Object.entries 遍历（IPC 传输不丢结构）
    expect(Object.keys(result)).toEqual(['t1', 't2'])
    expect(result.t1?.statuses.find((s) => s.id === 's-open')?.name).toBe('Open')
    expect(result.t2?.statuses.length).toBe(6)
  })

  test('attachStatusNames 补充 tfsName', async () => {
    const service = new TeambitionBoardService({ gateway: new StubGateway() })
    const items: TbDefectItem[] = [
      { taskId: 't1', content: 'c', projectId: 'p1', tfsId: 's-open', involveMembers: [] },
      { taskId: 't2', content: 'c', projectId: 'p1', tfsId: 's-fixed', involveMembers: [] },
    ]
    const workflowByTask = new Map<string, TbWorkflow | undefined>([
      ['t1', bugWorkflow],
      ['t2', bugWorkflow],
    ])
    const enriched = await service.attachStatusNames(items, workflowByTask)
    expect(enriched[0]?.tfsName).toBe('Open')
    expect(enriched[1]?.tfsName).toBe('Fixed')
  })

  test('写回方法透传给网关', async () => {
    const gateway = new StubGateway()
    const service = new TeambitionBoardService({ gateway })
    await service.claimTask('t1')
    await service.updateStatus('t1', 's-fixed', '已修复')
    await service.postComment('t1', 'hello')
    expect(gateway.claimCalls).toEqual(['t1'])
    expect(gateway.statusCalls).toEqual([{ taskId: 't1', target: 's-fixed', note: '已修复' }])
    expect(gateway.comments).toEqual([{ taskId: 't1', text: 'hello' }])
  })
})
