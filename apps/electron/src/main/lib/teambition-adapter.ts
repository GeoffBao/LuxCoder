/**
 * Teambition 适配层
 *
 * 见 docs/plans/2026-07-07-work-mode-design.md §6。
 *
 * 两个实现：
 * - McpTeambitionAdapter：程序化调用 TW user-mcp（不走 LLM，由 TeambitionService
 *   用 @modelcontextprotocol/sdk client 调工具）。复用现有 McpServerEntry
 *   配置形状（type:'http' + url + headers 带 token），workspace mcp.json
 *   机制零改造。
 * - MockTeambitionAdapter：本地种子任务，开发/演示/单测兜底，不依赖网络。
 *
 * 重要：TW user-mcp 实际暴露哪些工具名、任务字段长什么样，在本仓库里从未
 * 验证过（open.teambition.com/user-mcp 需要登录，无法在此环境探测）。所以
 * 这里刻意不猜测/硬编码工具名——McpTeambitionAdapter 要求调用方显式传入
 * toolNames 映射，第一步必须先跑 listTools() 探测真实工具列表再填值
 * （对应方案文档 §6 的"首个任务：枚举 user-mcp 工具列表"）。fetchTasks /
 * fetchTaskDetail 返回未加工的原始负载（TeambitionTaskRaw），远端任务到本地绑定的
 * 字段映射留给拿到真实数据后再写，不在这里假装已知 schema。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerEntry } from '@luxcodex/shared'
import {
  TeambitionCapabilityError,
  type TeambitionGateway,
  type TeambitionGatewayCapabilities,
  type TeambitionRemoteTask,
} from './teambition-service'

/** TW 任务原始负载，字段未知，由上层按需窄化解析 */
export type TeambitionTaskRaw = Record<string, unknown>

export interface TeambitionToolDescriptor {
  name: string
  description?: string
}

export interface TeambitionAdapter extends TeambitionGateway {
  /** 枚举 user-mcp 实际暴露的工具列表（读写覆盖面验证用） */
  listTools(): Promise<TeambitionToolDescriptor[]>
  fetchTasks(projectId: string): Promise<TeambitionTaskRaw[]>
  fetchTaskDetail(taskId: string): Promise<TeambitionTaskRaw>
  /** 写能力若缺失应抛出错误，由服务层保留 pending 状态。 */
  updateStatus(taskId: string, status: string, idempotencyKey?: string): Promise<void>
  postComment(taskId: string, text: string): Promise<void>
  close(): Promise<void>
}

/** 调用 TW user-mcp 各工具时使用的真实工具名，需先跑 listTools() 探测后再填 */
export interface TeambitionToolNames {
  listTasks: string
  getTaskDetail: string
  updateStatus: string
  postComment: string
  claimTask?: string
  syncProgress?: string
}

export interface McpTeambitionAdapterConfig {
  /** user-mcp 连接配置，复用 McpServerEntry 形状（type:'http'，headers 带 token） */
  server: McpServerEntry
  toolNames: TeambitionToolNames
}

type CallToolResult = Awaited<ReturnType<Client['callTool']>>

function extractToolPayload(result: CallToolResult): unknown {
  const structuredContent = 'structuredContent' in result ? result.structuredContent : undefined
  const content = 'content' in result ? result.content : undefined
  const isError = 'isError' in result ? result.isError : undefined

  if (isError) {
    const message = Array.isArray(content)
      ? content.map((c) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : '')).join('\n')
      : 'MCP 工具调用返回错误'
    throw new Error(`TW MCP 工具调用失败: ${message}`)
  }
  if (structuredContent !== undefined) return structuredContent
  const first = Array.isArray(content) ? content[0] : undefined
  if (first && typeof first === 'object' && 'text' in first) {
    const text = String((first as { text: unknown }).text)
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return undefined
}

function textField(raw: TeambitionTaskRaw, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function timestampField(raw: TeambitionTaskRaw, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

/** 集中窄化未知 Teambition payload，避免字段猜测散落在 handler/UI。 */
export function mapTeambitionTask(raw: TeambitionTaskRaw, fallbackProjectId = ''): TeambitionRemoteTask {
  const id = textField(raw, 'id', '_id', 'taskId')
  const title = textField(raw, 'title', 'content', 'name')
  if (!id || !title) throw new Error('Teambition 任务缺少 id 或 title/content 字段')
  return {
    id,
    title,
    projectId: textField(raw, 'projectId', '_projectId') ?? fallbackProjectId,
    ...(textField(raw, 'status', 'taskflowstatusId') ? { status: textField(raw, 'status', 'taskflowstatusId') } : {}),
    ...(timestampField(raw, 'updatedAt', 'updated') !== undefined
      ? { updatedAt: timestampField(raw, 'updatedAt', 'updated') }
      : {}),
  }
}

export class McpTeambitionAdapter implements TeambitionAdapter {
  private client: Client | undefined
  private connecting: Promise<Client> | undefined

  constructor(private readonly config: McpTeambitionAdapterConfig) {}

  private async getClient(): Promise<Client> {
    if (this.client) return this.client
    if (!this.connecting) {
      this.connecting = this.connect()
    }
    this.client = await this.connecting
    return this.client
  }

  private async connect(): Promise<Client> {
    const { server } = this.config
    if (!server.url) {
      throw new Error('TW MCP 配置缺少 url 字段')
    }
    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    })
    const client = new Client({ name: 'luxcodex-work-mode', version: '1.0.0' })
    await client.connect(transport)
    return client
  }

  async listTools(): Promise<TeambitionToolDescriptor[]> {
    const client = await this.getClient()
    const result = await client.listTools()
    return result.tools.map((t) => ({ name: t.name, description: t.description }))
  }

  async probeCapabilities(): Promise<TeambitionGatewayCapabilities> {
    const toolNames = new Set((await this.listTools()).map((tool) => tool.name))
    return {
      listTasks: toolNames.has(this.config.toolNames.listTasks),
      claimTask: !!this.config.toolNames.claimTask && toolNames.has(this.config.toolNames.claimTask),
      updateStatus: toolNames.has(this.config.toolNames.updateStatus),
      syncProgress: (!!this.config.toolNames.syncProgress && toolNames.has(this.config.toolNames.syncProgress))
        || toolNames.has(this.config.toolNames.postComment),
    }
  }

  async fetchTasks(projectId: string): Promise<TeambitionTaskRaw[]> {
    const client = await this.getClient()
    const result = await client.callTool({
      name: this.config.toolNames.listTasks,
      arguments: { projectId },
    })
    const payload = extractToolPayload(result)
    if (Array.isArray(payload)) return payload as TeambitionTaskRaw[]
    if (payload && typeof payload === 'object' && Array.isArray((payload as { tasks?: unknown }).tasks)) {
      return (payload as { tasks: TeambitionTaskRaw[] }).tasks
    }
    throw new Error('TW MCP listTasks 返回了非预期的结构，请检查 toolNames.listTasks 配置是否正确')
  }

  async fetchTaskDetail(taskId: string): Promise<TeambitionTaskRaw> {
    const client = await this.getClient()
    const result = await client.callTool({
      name: this.config.toolNames.getTaskDetail,
      arguments: { taskId },
    })
    const payload = extractToolPayload(result)
    if (payload && typeof payload === 'object') return payload as TeambitionTaskRaw
    throw new Error('TW MCP getTaskDetail 返回了非预期的结构，请检查 toolNames.getTaskDetail 配置是否正确')
  }

  async listClaimableTasks(projectId: string): Promise<TeambitionRemoteTask[]> {
    return (await this.fetchTasks(projectId)).map((task) => mapTeambitionTask(task, projectId))
  }

  async claimTask(taskId: string, idempotencyKey: string): Promise<TeambitionRemoteTask> {
    const toolName = this.config.toolNames.claimTask
    if (!toolName) throw new TeambitionCapabilityError('Teambition MCP 未配置 claimTask 工具')
    const client = await this.getClient()
    const payload = extractToolPayload(await client.callTool({
      name: toolName,
      arguments: { taskId, idempotencyKey },
    }))
    if (!payload || typeof payload !== 'object') throw new Error('Teambition claimTask 返回结构无效')
    return mapTeambitionTask(payload as TeambitionTaskRaw)
  }

  async updateStatus(taskId: string, status: string, idempotencyKey?: string): Promise<void> {
    const client = await this.getClient()
    const result = await client.callTool({
      name: this.config.toolNames.updateStatus,
      arguments: { taskId, status, idempotencyKey },
    })
    extractToolPayload(result)
  }

  async syncProgress(taskId: string, progress: number, idempotencyKey: string): Promise<void> {
    const client = await this.getClient()
    if (this.config.toolNames.syncProgress) {
      extractToolPayload(await client.callTool({
        name: this.config.toolNames.syncProgress,
        arguments: { taskId, progress, idempotencyKey },
      }))
      return
    }
    await this.postComment(taskId, `[LuxCodex:${idempotencyKey}] 任务进度 ${progress}%`)
  }

  async postComment(taskId: string, text: string): Promise<void> {
    const client = await this.getClient()
    const result = await client.callTool({
      name: this.config.toolNames.postComment,
      arguments: { taskId, text },
    })
    extractToolPayload(result)
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = undefined
      this.connecting = undefined
    }
  }
}

/**
 * 本地种子任务，开发/演示/单测兜底。不依赖网络，写操作只更新内存态。
 */
export class MockTeambitionAdapter implements TeambitionAdapter {
  private tasks: Map<string, TeambitionTaskRaw>

  constructor(seedTasks: TeambitionTaskRaw[] = MockTeambitionAdapter.defaultSeed()) {
    this.tasks = new Map(seedTasks.map((t) => [String(t.id), t]))
  }

  static defaultSeed(): TeambitionTaskRaw[] {
    return [
      {
        id: 'TW-MOCK-1001',
        title: '（演示）相机启动耗时优化',
        type: 'requirement',
        priority: 'P1',
        projectId: 'mock-project',
      },
      {
        id: 'TW-MOCK-1002',
        title: '（演示）HAL3 预览流 buffer 泄漏修复',
        type: 'bug',
        priority: 'P1',
        projectId: 'mock-project',
      },
    ]
  }

  async listTools(): Promise<TeambitionToolDescriptor[]> {
    return [
      { name: 'mock.listTasks', description: '(mock) 列出项目任务' },
      { name: 'mock.getTaskDetail', description: '(mock) 获取任务详情' },
      { name: 'mock.updateStatus', description: '(mock) 更新任务状态' },
      { name: 'mock.postComment', description: '(mock) 发表评论' },
    ]
  }

  async probeCapabilities(): Promise<TeambitionGatewayCapabilities> {
    return { listTasks: true, claimTask: true, updateStatus: true, syncProgress: true }
  }

  async fetchTasks(projectId: string): Promise<TeambitionTaskRaw[]> {
    return [...this.tasks.values()].filter((t) => t.projectId === projectId || projectId === 'mock-project')
  }

  async fetchTaskDetail(taskId: string): Promise<TeambitionTaskRaw> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Mock TW 任务不存在: ${taskId}`)
    return task
  }

  async listClaimableTasks(projectId: string): Promise<TeambitionRemoteTask[]> {
    return (await this.fetchTasks(projectId)).map((task) => mapTeambitionTask(task, projectId))
  }

  async claimTask(taskId: string, _idempotencyKey: string): Promise<TeambitionRemoteTask> {
    return mapTeambitionTask(await this.fetchTaskDetail(taskId))
  }

  async updateStatus(taskId: string, status: string, _idempotencyKey?: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Mock TW 任务不存在: ${taskId}`)
    this.tasks.set(taskId, { ...task, mockPhase: status })
  }

  async syncProgress(taskId: string, progress: number, idempotencyKey: string): Promise<void> {
    await this.postComment(taskId, `[LuxCodex:${idempotencyKey}] 任务进度 ${progress}%`)
  }

  async postComment(taskId: string, text: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Mock TW 任务不存在: ${taskId}`)
    const comments = Array.isArray(task.mockComments) ? (task.mockComments as string[]) : []
    this.tasks.set(taskId, { ...task, mockComments: [...comments, text] })
  }

  async close(): Promise<void> {
    // no-op
  }
}
