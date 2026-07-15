import { describe, expect, test } from 'bun:test'
import { MockTeambitionAdapter, McpTeambitionAdapter } from './teambition-adapter'

describe('MockTeambitionAdapter', () => {
  test('listTools 返回固定的 mock 工具描述', async () => {
    const adapter = new MockTeambitionAdapter()
    const tools = await adapter.listTools()
    expect(tools.map((t) => t.name)).toEqual(['mock.listTasks', 'mock.getTaskDetail', 'mock.updateStatus', 'mock.postComment'])
  })

  test('fetchTasks 返回种子任务，fetchTaskDetail 能取到单条', async () => {
    const adapter = new MockTeambitionAdapter()
    const tasks = await adapter.fetchTasks('mock-project')
    expect(tasks.length).toBe(2)

    const detail = await adapter.fetchTaskDetail('TW-MOCK-1001')
    expect(detail.title).toBe('（演示）相机启动耗时优化')
  })

  test('fetchTaskDetail 对不存在的任务抛错', async () => {
    const adapter = new MockTeambitionAdapter()
    await expect(adapter.fetchTaskDetail('不存在的任务')).rejects.toThrow()
  })

  test('updateStatus / postComment 修改内存态并可再次读到', async () => {
    const adapter = new MockTeambitionAdapter()
    await adapter.updateStatus('TW-MOCK-1001', 'coding')
    await adapter.postComment('TW-MOCK-1001', '第一条评论')
    await adapter.postComment('TW-MOCK-1001', '第二条评论')

    const detail = await adapter.fetchTaskDetail('TW-MOCK-1001')
    expect(detail.mockPhase).toBe('coding')
    expect(detail.mockComments).toEqual(['第一条评论', '第二条评论'])
  })

  test('自定义 seedTasks 覆盖默认种子', async () => {
    const adapter = new MockTeambitionAdapter([{ id: 'X-1', title: '自定义任务', projectId: 'p1' }])
    const tasks = await adapter.fetchTasks('p1')
    expect(tasks).toEqual([{ id: 'X-1', title: '自定义任务', projectId: 'p1' }])
  })
})

describe('McpTeambitionAdapter', () => {
  test('缺少 url 配置时，调用任意方法都应抛出明确错误而不是静默失败', async () => {
    const adapter = new McpTeambitionAdapter({
      server: { type: 'http', enabled: true },
      toolNames: { listTasks: 'listTasks', getTaskDetail: 'getTaskDetail', updateStatus: 'updateStatus', postComment: 'postComment' },
    })
    await expect(adapter.listTools()).rejects.toThrow('url')
  })

  test('close() 在从未连接时是安全的 no-op', async () => {
    const adapter = new McpTeambitionAdapter({
      server: { type: 'http', url: 'https://example.invalid/mcp', enabled: true },
      toolNames: { listTasks: 'listTasks', getTaskDetail: 'getTaskDetail', updateStatus: 'updateStatus', postComment: 'postComment' },
    })
    await expect(adapter.close()).resolves.toBeUndefined()
  })
})
