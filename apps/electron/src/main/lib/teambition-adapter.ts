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
import type { McpServerEntry } from '@luxcoder/shared'
import type { TaskType } from '@luxcoder/shared/tasks/task-record'
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
  /** 用户名下未 close 任务查询工具（如 TB 的 SearchUserTasksV3）；一键同步使用 */
  listMyOpenTasks?: string
  /** 企业级任务搜索（SearchTasksByTQLV2）；按 TQL 精确查询“我的任务”/搜索 */
  searchTasksByTql?: string
  /** 当前用户信息（GetUsersMe）；查询“我的任务”需要 userId */
  getCurrentUser?: string
  /** 项目任务类型（GetScenarioFieldsMCP）；解析 TB 任务类型（sfc）到本地 TaskType */
  getScenarioFields?: string
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
  // isDone → 看板状态：已完成 / 进行中（TB 的 done 对应看板已完成）
  const isDone = raw.isDone === true
  return {
    id,
    title,
    projectId: textField(raw, 'projectId', '_projectId') ?? fallbackProjectId,
    status: textField(raw, 'status', 'taskflowstatusId') ?? (isDone ? 'done' : 'doing'),
    ...(typeof raw.uniqueId === 'number' ? { uniqueId: raw.uniqueId } : {}),
    ...(timestampField(raw, 'updatedAt', 'updated') !== undefined
      ? { updatedAt: timestampField(raw, 'updatedAt', 'updated') }
      : {}),
    // Mock 种子直接给本地枚举 type；真实 TB 详情只有 sfcId，由 adapter 用 GetScenarioFieldsMCP 补全
    ...(textField(raw, 'type') !== undefined
      ? { type: normalizeTeambitionTaskType(textField(raw, 'type')) }
      : {}),
    ...(textField(raw, 'sfcId') !== undefined ? { typeId: textField(raw, 'sfcId') } : {}),
  }
}

/** 将 TB 任务类型名（sfc name / 本地枚举）归一化为本地 TaskType；未知归 task。 */
export function normalizeTeambitionTaskType(typeName?: string): TaskType | undefined {
  if (!typeName) return undefined
  const name = typeName.trim().toLowerCase()
  // bug 用精确/前缀匹配（覆盖 Bug/Bugs/Bugfix），避免误伤 debug 等含 bug 子串的类型名
  if (name.includes('缺陷') || name === 'bug' || name.startsWith('bug')) return 'bug'
  if (name.includes('需求') || name === 'requirement' || name === 'story' || name.includes('story')) return 'requirement'
  if (name.includes('活动') || name === 'activity') return 'activity'
  if (name.includes('硬件') || name === 'hardware') return 'hardware'
  if (name.includes('checklist')) return 'checklist'
  return 'task'
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

    // 使用 Electron 主进程的 Node 原生 fetch 直连 TB 网关（不经代理；bun/undici 会被
    // 企业 Squid 拦截，Node 原生 fetch 可正常直连内网 MCP）。
    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
      fetch: globalThis.fetch,
    })
    const client = new Client({ name: 'luxcoder-work-mode', version: '1.0.0' })
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

  async listMyOpenTasks(_roleTypes?: string): Promise<TeambitionRemoteTask[]> {
    const client = await this.getClient()

    // 优先用 TQL 精确查询「我的任务」= 我执行且未完成（与 TB 系统“我的任务”视图一致）
    const tqlTool = this.config.toolNames.searchTasksByTql
    const meTool = this.config.toolNames.getCurrentUser
    if (tqlTool && meTool) {
      try {
        // 1. 获取当前用户 id
        const mePayload = extractToolPayload(await client.callTool({ name: meTool, arguments: {} }))
        const me = (mePayload && typeof mePayload === 'object')
          ? (mePayload as { id?: string; userId?: string })
          : {}
        const userId = me.id ?? me.userId
        if (!userId) {
          console.warn('[Teambition] GetUsersMe 未返回 userId，回退 SearchUserTasksV3')
        } else {
          const tql = `isDone = false AND executorId = "${userId}"`
          const args: Record<string, unknown> = { tql, pageSize: 100 }
          const payload = extractToolPayload(await client.callTool({ name: tqlTool, arguments: args }))
          const ids = Array.isArray(payload)
            ? payload as string[]
            : payload && typeof payload === 'object'
              ? (payload as { result?: string[] }).result ?? []
              : []
          // SearchTasksByTQLV2 只返回任务 ID 列表；逐条 QueryTaskV3 拉详情（最多 50 条，避免刷屏）
          const detailTool = this.config.toolNames.getTaskDetail
          if (!detailTool || ids.length === 0) return []
          const details: TeambitionTaskRaw[] = []
          for (const taskId of ids.slice(0, 50)) {
            try {
              const detailPayload = extractToolPayload(await client.callTool({
                name: detailTool,
                arguments: { taskId },
              }))
              const raw = Array.isArray(detailPayload)
                ? detailPayload[0]
                : (detailPayload as { result?: TeambitionTaskRaw[] }).result?.[0]
              if (raw) details.push(raw as TeambitionTaskRaw)
            } catch (error) {
              console.warn(`[Teambition] 查询任务详情失败 ${taskId}:`, error)
            }
          }
          return this.attachTaskTypes(
            details
              .filter((task) => task.isDone !== true && task.isArchived !== true)
              .map((task) => mapTeambitionTask(task)),
          )
        }
      } catch (error) {
        console.warn('[Teambition] TQL 查询我的任务失败，回退 SearchUserTasksV3:', error)
      }
    }

    // 回退：SearchUserTasksV3 分页拉取（默认 executor）
    const toolName = this.config.toolNames.listMyOpenTasks
    if (!toolName) return []
    const collected: TeambitionTaskRaw[] = []
    let nextPageToken: string | undefined
    for (let page = 0; page < 50; page++) {
      const args: Record<string, unknown> = {
        roleTypes: 'executor',
        pageSize: 100,
      }
      if (nextPageToken) args.pageToken = nextPageToken

      const payload = extractToolPayload(await client.callTool({ name: toolName, arguments: args }))
      const rawTasks = Array.isArray(payload)
        ? payload as TeambitionTaskRaw[]
        : payload && typeof payload === 'object'
          ? (payload as { result?: TeambitionTaskRaw[] }).result ?? []
          : []
      collected.push(...rawTasks)

      const next = payload && typeof payload === 'object'
        ? (payload as { nextPageToken?: string }).nextPageToken
        : undefined
      if (!next) break
      nextPageToken = next
    }

    return this.attachTaskTypes(
      collected
        .filter((task) => task.isDone !== true && task.isArchived !== true)
        .map((task) => mapTeambitionTask(task)),
    )
  }

  /**
   * 用 GetScenarioFieldsMCP 批量解析任务 sfcId → TB 类型名 → 本地 TaskType（按项目缓存）。
   * 仅在任务缺少 type 但带 typeId（sfcId）时查询，避免对每条任务都发起额外调用。
   */
  private async attachTaskTypes(tasks: TeambitionRemoteTask[]): Promise<TeambitionRemoteTask[]> {
    const toolName = this.config.toolNames.getScenarioFields
    if (!toolName) return tasks
    const pending = tasks.filter((task) => !task.type && task.typeId && task.projectId)
    if (pending.length === 0) return tasks
    const client = await this.getClient()
    const projectIds = [...new Set(pending.map((task) => task.projectId))]
    const cache = new Map<string, Map<string, string>>()
    for (const projectId of projectIds) {
      try {
        const payload = extractToolPayload(await client.callTool({
          name: toolName,
          arguments: { projectId, pageSize: 100 },
        }))
        const list = Array.isArray(payload)
          ? payload as Array<{ id?: string; name?: string }>
          : (payload as { result?: Array<{ id?: string; name?: string }> }).result ?? []
        const byId = new Map<string, string>()
        for (const item of list) {
          if (item?.id && item?.name) byId.set(item.id, item.name)
        }
        cache.set(projectId, byId)
      } catch (error) {
        console.warn(`[Teambition] 查询项目任务类型失败 ${projectId}:`, error)
      }
    }
    for (const task of pending) {
      const typeName = cache.get(task.projectId)?.get(task.typeId ?? '')
      if (typeName) task.type = normalizeTeambitionTaskType(typeName)
    }
    return tasks
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
    await this.postComment(taskId, `[LuxCoder:${idempotencyKey}] 任务进度 ${progress}%`)
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

  async listMyOpenTasks(): Promise<TeambitionRemoteTask[]> {
    // Mock：返回所有 mock 任务（未 close 模拟）
    return [...this.tasks.values()]
      .filter((task) => (task.mockPhase ?? 'todo') !== 'closed')
      .map((task) => mapTeambitionTask(task))
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
    await this.postComment(taskId, `[LuxCoder:${idempotencyKey}] 任务进度 ${progress}%`)
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
