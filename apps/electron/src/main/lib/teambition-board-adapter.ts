/**
 * TB 缺陷看板 Adapter（main）
 *
 * 实现 TeambitionBoardGateway，程序化调用 TW user-mcp 的看板相关工具：
 * - SearchUserTasksV3 / SearchProjectTasksV3（任务列表，按 sfc 过滤缺陷）
 * - GetScenarioFieldsMCP（项目任务类型名映射）
 * - QueryTaskTfs（任务所在工作流状态集）
 * - ListTaskActivitiesV3（状态流转历史）
 * - UpdateTaskExecutorV3 / UpdateTaskStatusV3 / CreateTaskCommentV3（写回）
 * - GetUsersMe（当前用户）
 *
 * 复用现有 McpTeambitionAdapter 的 MCP client 连接，但不强制依赖它的工具名
 * 配置；看板工具名由调用方显式传入（与现有 toolNames 机制一致，先 listTools 探测）。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerEntry } from '@luxcoder/shared'
import type {
  TbDefectItem,
  TbStatusTransition,
  TbTaskAttachment,
  TbTaskDetail,
  TbWorkflow,
  TbWorkflowStatus,
} from '@luxcoder/shared/teambition-defect'
import { inferStatusStage } from '@luxcoder/shared/teambition-defect'
import { normalizeTeambitionTaskType } from './teambition-adapter'
import type { TeambitionBoardGateway } from './teambition-board-service'

/** 看板工具名映射（真实网关工具名，先 listTools 探测后填） */
export interface TeambitionBoardToolNames {
  getCurrentUser: string
  listMyOpenTasks: string
  listProjectTasks: string
  getScenarioFields: string
  queryTaskTfs: string
  listTaskActivities: string
  updateExecutor: string
  updateStatus: string
  postComment: string
  /** 任务详情（QueryTaskV3）；列表详情补充用 */
  getTaskDetail?: string
  /** 项目自定义字段（SearchProjectCustomFiledsV3）；cfId→字段名映射 */
  listProjectCustomFields?: string
  /** 企业级 TQL 搜索（SearchTasksByTQLV2）；已关闭区按时间窗口直接查询用 */
  searchTasksByTql?: string
  /** 项目详情（QueryProjectsV3）；projectId→项目名映射用 */
  queryProjects?: string
}

export interface McpTeambitionBoardAdapterConfig {
  server: McpServerEntry
  toolNames: TeambitionBoardToolNames
  /** 兜底：当工具缺失时的本地实现（如 Mock）；不传则缺失工具时抛 CapabilityError */
  fallback?: TeambitionBoardGateway
  /** 是否 mock（fallback 无真实网关语义时的标记） */
  isMock?: boolean
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

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toDate(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return undefined
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asTaskRawList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>
  const obj = asObject(payload)
  if (obj && Array.isArray(obj.result)) return obj.result as Array<Record<string, unknown>>
  if (obj && Array.isArray(obj.tasks)) return obj.tasks as Array<Record<string, unknown>>
  return []
}

/** 去 HTML 标签并还原常见转义，保留换行（富文本描述用） */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export class McpTeambitionBoardAdapter implements TeambitionBoardGateway {
  readonly isMock = false
  private client: Client | undefined
  private connecting: Promise<Client> | undefined

  constructor(private readonly config: McpTeambitionBoardAdapterConfig) {}

  private get fallback(): TeambitionBoardGateway | undefined {
    return this.config.fallback
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client
    if (!this.connecting) this.connecting = this.connect()
    this.client = await this.connecting
    return this.client
  }

  private async connect(): Promise<Client> {
    const { server } = this.config
    if (!server.url) throw new Error('TB 看板 MCP 配置缺少 url 字段')
    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
      fetch: globalThis.fetch,
    })
    const client = new Client({ name: 'luxcoder-tb-board', version: '1.0.0' })
    await client.connect(transport)
    return client
  }

  async listTools(): Promise<string[]> {
    const client = await this.getClient()
    const result = await client.listTools()
    return result.tools.map((t) => t.name)
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = undefined
      this.connecting = undefined
    }
  }

  private async call(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient()
    return extractToolPayload(await client.callTool({ name: toolName, arguments: args }))
  }

  /** 从 TB 任务 raw 提取看板项（宽容字段映射，未知字段不抛错） */
  private static mapDefect(raw: Record<string, unknown>, typeName?: string): TbDefectItem | null {
    const taskId = String(raw.id ?? raw._id ?? raw.taskId ?? '')
    const content = String(raw.content ?? raw.title ?? '')
    if (!taskId || !content) return null
    const projectId = String(raw.projectId ?? raw._projectId ?? '')
    const item: TbDefectItem = {
      taskId,
      content,
      projectId,
      tfsId: String(raw.tfsId ?? raw.taskflowstatusId ?? raw.status ?? ''),
      ...(raw.executorId !== undefined && raw.executorId !== null ? { executorId: String(raw.executorId) } : {}),
      involveMembers: Array.isArray(raw.involveMembers) ? raw.involveMembers.map(String) : [],
      ...(toNumber(raw.priority) !== undefined ? { priority: toNumber(raw.priority) } : {}),
      ...(toNumber(raw.progress) !== undefined ? { progress: toNumber(raw.progress) } : {}),
      ...(toDate(raw.dueDate) !== undefined ? { dueDate: toDate(raw.dueDate) } : {}),
      ...(toDate(raw.startDate) !== undefined ? { startDate: toDate(raw.startDate) } : {}),
      ...(toDate(raw.accomplishTime) !== undefined ? { accomplishTime: toDate(raw.accomplishTime) } : {}),
      ...(toNumber(raw.uniqueId) !== undefined ? { uniqueId: toNumber(raw.uniqueId) } : {}),
      // 类型（缺陷/需求/任务等）：由 TB 类型名归一化；无法识别时不携带（渲染层默认 task）
      ...(typeName ? { type: normalizeTeambitionTaskType(typeName) } : {}),
    }
    return item
  }

  async getCurrentUserId(): Promise<string> {
    if (this.fallback) return this.fallback.getCurrentUserId()
    const payload = await this.call(this.config.toolNames.getCurrentUser, {})
    const obj = asObject(payload)
    const id = obj?.id ?? obj?.userId
    if (typeof id !== 'string' || !id) throw new Error('GetUsersMe 未返回 userId')
    return id
  }

  async listTaskTypeNames(projectId: string): Promise<Map<string, string>> {
    if (this.fallback) return this.fallback.listTaskTypeNames(projectId)
    const payload = await this.call(this.config.toolNames.getScenarioFields, { projectId, pageSize: 100 })
    const list = Array.isArray(payload)
      ? payload as Array<Record<string, unknown>>
      : (asObject(payload)?.result as Array<Record<string, unknown>> | undefined) ?? []
    const map = new Map<string, string>()
    for (const item of list) {
      if (item?.id && item?.name) map.set(String(item.id), String(item.name))
    }
    return map
  }

  async listProjectCustomFields(projectId: string): Promise<Map<string, string>> {
    if (this.fallback) return this.fallback.listProjectCustomFields(projectId)
    const toolName = this.config.toolNames.listProjectCustomFields
    if (!toolName) return new Map()
    const payload = await this.call(toolName, { projectId, pageSize: 200 })
    const list = Array.isArray(payload)
      ? payload as Array<Record<string, unknown>>
      : (asObject(payload)?.result as Array<Record<string, unknown>> | undefined) ?? []
    const map = new Map<string, string>()
    for (const item of list) {
      if (item?.id && item?.name) map.set(String(item.id), String(item.name))
    }
    return map
  }

  /** 批量查询项目名（QueryProjectsV3，projectId → name；失败返回空映射，UI 可降级不显示标签） */
  async listProjectNames(projectIds: string[]): Promise<Map<string, string>> {
    if (this.fallback) return this.fallback.listProjectNames(projectIds)
    const toolName = this.config.toolNames.queryProjects
    if (!toolName || projectIds.length === 0) return new Map()
    try {
      const payload = await this.call(toolName, { projectIds: projectIds.join(','), pageSize: projectIds.length })
      const list = Array.isArray(payload)
        ? payload as Array<Record<string, unknown>>
        : (asObject(payload)?.result as Array<Record<string, unknown>> | undefined) ?? []
      const map = new Map<string, string>()
      for (const project of list) {
        if (project?.id && project?.name) map.set(String(project.id), String(project.name))
      }
      return map
    } catch (error) {
      console.warn('[TbBoard] 项目名查询失败（降级不显示项目标签）:', error)
      return new Map()
    }
  }

  async listMyDefects(roleTypes?: string): Promise<TbDefectItem[]> {
    if (this.fallback) return this.fallback.listMyDefects(roleTypes)
    // 分页全量拉取（对齐任务看板同步：SearchUserTasksV3 executor 角色，最多 50 页×100）
    const collected: Array<Record<string, unknown>> = []
    let nextPageToken: string | undefined
    for (let page = 0; page < 50; page++) {
      const args: Record<string, unknown> = {
        roleTypes: roleTypes ?? 'executor',
        pageSize: 100,
      }
      if (nextPageToken) args.pageToken = nextPageToken
      const payload = await this.call(this.config.toolNames.listMyOpenTasks, args)
      const rawTasks = asTaskRawList(payload)
      collected.push(...rawTasks)
      const next = asObject(payload)?.nextPageToken
      if (typeof next !== 'string' || !next) break
      nextPageToken = next
    }
    return this.mapTaskList(collected.filter((task) => task.isDone !== true && task.isArchived !== true))
  }

  /** 近 N 天内已关闭的我的任务（已关闭区懒加载用）：直接用 TQL 带时间窗口查询，不拉全量再过滤 */
  async listClosedDefects(days: number): Promise<TbDefectItem[]> {
    if (this.fallback) return this.fallback.listClosedDefects(days)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const userId = await this.getCurrentUserId()

    // 主路径：TQL 直接按「已关闭 + 我执行 + updated 时间窗口」查询（服务端过滤，零全量拉取）
    const tqlTool = this.config.toolNames.searchTasksByTql
    if (tqlTool) {
      try {
        const tql = `isDone = true AND executorId = "${userId}" AND updated >= "${since}"`
        const payload = await this.call(tqlTool, { tql, pageSize: 100 })
        const ids = Array.isArray(payload)
          ? payload.map(String)
          : (asObject(payload)?.result as unknown[] | undefined)?.map(String) ?? []
        const items: TbDefectItem[] = []
        // SearchTasksByTQLV2 只返回 ID；逐条 QueryTaskV3 拉详情（上限 50，避免刷屏）
        for (const taskId of ids.slice(0, 50)) {
          try {
            const raw = await this.fetchTaskRaw(taskId)
            if (raw) {
              const [mapped] = await this.mapTaskList([raw])
              if (mapped) items.push(mapped)
            }
          } catch (error) {
            console.warn(`[TbBoard] 查询已关闭任务详情失败 ${taskId}:`, error)
          }
        }
        return items
      } catch (error) {
        console.warn('[TbBoard] TQL 查询已关闭任务失败，回退分页过滤:', error)
      }
    }

    // 回退：分页拉取后按 isDone=true + 关闭时间窗口过滤（仅 TQL 不可用时）
    const collected: Array<Record<string, unknown>> = []
    let nextPageToken: string | undefined
    for (let page = 0; page < 50; page++) {
      const args: Record<string, unknown> = {
        roleTypes: 'executor',
        pageSize: 100,
      }
      if (nextPageToken) args.pageToken = nextPageToken
      const payload = await this.call(this.config.toolNames.listMyOpenTasks, args)
      const rawTasks = asTaskRawList(payload)
      collected.push(...rawTasks)
      const next = asObject(payload)?.nextPageToken
      if (typeof next !== 'string' || !next) break
      nextPageToken = next
    }
    const closedRaw = collected.filter((task) => {
      if (task.isDone !== true || task.isArchived === true) return false
      const closedAt = String(task.accomplishTime ?? task.updated ?? '')
      return Boolean(closedAt) && closedAt >= since
    })
    return this.mapTaskList(closedRaw)
  }

  /** 按 taskId 拉单个任务详情（已关闭列表用） */
  private async fetchTaskRaw(taskId: string): Promise<Record<string, unknown> | undefined> {
    const toolName = this.config.toolNames.getTaskDetail
    if (!toolName) return undefined
    const payload = await this.call(toolName, { taskId })
    const raws = asTaskRawList(payload)
    return raws[0]
  }

  async listProjectDefects(projectId: string): Promise<TbDefectItem[]> {
    if (this.fallback) return this.fallback.listProjectDefects(projectId)
    const payload = await this.call(this.config.toolNames.listProjectTasks, {
      projectId,
      q: 'isDone = false',
      pageSize: 100,
    })
    return this.mapTaskList(asTaskRawList(payload))
  }

  private async mapTaskList(raws: Array<Record<string, unknown>>): Promise<TbDefectItem[]> {
    // 先收集所有项目 id 用于解析类型名（批量一次）
    const projectIds = [...new Set(raws.map((r) => String(r.projectId ?? '')).filter(Boolean))]
    const typeNamesByProject = new Map<string, Map<string, string>>()
    for (const projectId of projectIds) {
      try {
        typeNamesByProject.set(projectId, await this.listTaskTypeNames(projectId))
      } catch {
        typeNamesByProject.set(projectId, new Map())
      }
    }
    // 批量补项目名（一次 QueryProjectsV3；失败则降级不显示）
    const projectNames = await this.listProjectNames(projectIds)
    const items: TbDefectItem[] = []
    for (const raw of raws) {
      const projectId = String(raw.projectId ?? '')
      const typeNameById = typeNamesByProject.get(projectId)
      const sfcId = String(raw.sfcId ?? '')
      const typeName = (sfcId && typeNameById) ? typeNameById.get(sfcId) : undefined
      const item = McpTeambitionBoardAdapter.mapDefect(raw, typeName)
      if (item) {
        const projectName = projectNames.get(projectId)
        if (projectName) item.projectName = projectName
        items.push(item)
      }
    }
    return items
  }

  async getTaskWorkflow(taskId: string): Promise<TbWorkflow | undefined> {
    if (this.fallback) return this.fallback.getTaskWorkflow(taskId)
    const payload = await this.call(this.config.toolNames.queryTaskTfs, { taskId })
    const raws = asTaskRawList(payload)
    const statuses: TbWorkflowStatus[] = []
    for (const raw of raws) {
      const id = String(raw.id ?? '')
      const name = String(raw.name ?? '')
      if (!id || !name) continue
      const kind = raw.kind === 'end' ? 'end' : raw.kind === 'start' ? 'start' : 'unset'
      statuses.push({
        id,
        name,
        kind,
        pos: toNumber(raw.pos) ?? 0,
        rejectStatusIds: Array.isArray(raw.rejectStatusIds) ? raw.rejectStatusIds.map(String) : [],
        stage: inferStatusStage(name, kind),
      })
    }
    if (statuses.length === 0) return undefined
    return { taskflowId: String(raws[0]?.taskflowId ?? taskId), statuses }
  }

  async listTransitions(taskId: string): Promise<TbStatusTransition[]> {
    if (this.fallback) return this.fallback.listTransitions(taskId)
    const payload = await this.call(this.config.toolNames.listTaskActivities, {
      taskId,
      pageSize: 100,
      language: 'zh_CN',
    })
    const raws = asTaskRawList(payload)
    const transitions: TbStatusTransition[] = []
    for (const raw of raws) {
      if (raw.action !== 'update.taskflowstatus') continue
      const contentRaw = typeof raw.content === 'string' ? raw.content : null
      let content: Record<string, unknown> | null = null
      if (contentRaw) {
        try { content = JSON.parse(contentRaw) as Record<string, unknown> } catch { content = null }
      }
      if (!content) continue
      const fromName = String(content.oldTaskflowstatus ?? content.oldTfsName ?? '')
      const toName = String(content.taskflowstatus ?? content.tfsName ?? '')
      if (!toName) continue
      const atRaw = typeof raw.createTime === 'string' ? Date.parse(raw.createTime) : toNumber(raw.createTime)
      if (typeof atRaw !== 'number' || !Number.isFinite(atRaw)) continue
      const at: number = atRaw
      transitions.push({
        fromName,
        toName,
        ...(content.tfsUpdateNote ? { note: String(content.tfsUpdateNote) } : {}),
        ...(typeof raw.creatorId === 'string' ? { by: raw.creatorId } : {}),
        at,
      })
    }
    return transitions.sort((a, b) => a.at - b.at)
  }

  async getTaskDetail(taskId: string): Promise<TbTaskDetail> {
    if (this.fallback) return this.fallback.getTaskDetail(taskId)
    const toolName = this.config.toolNames.getTaskDetail
    if (!toolName) throw new Error('TB 看板网关未配置 getTaskDetail 工具')
    const payload = await this.call(toolName, { taskId })
    const raws = asTaskRawList(payload)
    const raw = raws[0] as Record<string, unknown> | undefined
    if (!raw) throw new Error(`TB 任务详情为空: ${taskId}`)

    const projectId = String(raw.projectId ?? '')
    const content = String(raw.content ?? raw.title ?? '')
    const note = typeof raw.note === 'string' ? raw.note : undefined
    // 项目自定义字段名映射（cfId → 字段名）
    const cfNameById = projectId ? await this.listProjectCustomFields(projectId).catch(() => new Map<string, string>()) : new Map<string, string>()

    const fields: Array<{ name: string; value: string }> = []
    const attachments: TbTaskAttachment[] = []
    let description: string | undefined
    const customfields = Array.isArray(raw.customfields) ? raw.customfields as Array<Record<string, unknown>> : []
    for (const field of customfields) {
      const cfId = String(field.cfId ?? field.id ?? '')
      // 字段名：优先 customfields 自带 name，否则用项目映射
      const fieldName = String(field.name ?? '') || cfNameById.get(cfId) || ''
      const type = String(field.type ?? '')
      const values = Array.isArray(field.value) ? field.value as Array<Record<string, unknown>> : []

      if (type === 'work' || type === 'file') {
        // 附件：真实结构 value[].title = 文件名；resourceId 可能缺失（仅展示文件名）
        for (const value of values) {
          const name = String(value.title ?? '')
          const resourceId = String(value.resourceId ?? value.workId ?? value.id ?? value.url ?? '')
          if (name || resourceId) {
            attachments.push({ name: name || resourceId, ...(resourceId ? { resourceId } : {}) })
          }
        }
        continue
      }
      if (type === 'rtf') {
        // 富文本描述：优先取 value[].html（完整描述），否则 title
        for (const value of values) {
          const html = typeof value.html === 'string' ? stripHtml(value.html) : ''
          const title = String(value.title ?? '')
          const text = html || title
          if (text) description = description ? `${description}\n${text}` : text
        }
        continue
      }
      if (type === 'note') {
        const text = values.map((value) => String(value.title ?? value.text ?? '')).filter(Boolean).join('\n')
        if (text) description = description ? `${description}\n${text}` : text
        continue
      }
      // 普通字段：字段名 + 值（dropDown 值在 value[].title；避免塞入超长 metaString）
      const display = values
        .map((value) => String(value.title ?? value.text ?? ''))
        .filter(Boolean)
        .join('、')
      if (fieldName && display) fields.push({ name: fieldName, value: display })
    }

    return {
      taskId,
      ...(toNumber(raw.uniqueId) !== undefined ? { uniqueId: toNumber(raw.uniqueId) } : {}),
      content,
      projectId,
      ...(note ? { note } : {}),
      ...(description ? { description } : {}),
      attachments,
      fields,
      ...(raw.executorId !== undefined && raw.executorId !== null ? { executorId: String(raw.executorId) } : {}),
      involveMembers: Array.isArray(raw.involveMembers) ? raw.involveMembers.map(String) : [],
      ...(toNumber(raw.priority) !== undefined ? { priority: toNumber(raw.priority) } : {}),
      ...(toNumber(raw.progress) !== undefined ? { progress: toNumber(raw.progress) } : {}),
      ...(toDate(raw.dueDate) !== undefined ? { dueDate: toDate(raw.dueDate) } : {}),
      ...(toDate(raw.startDate) !== undefined ? { startDate: toDate(raw.startDate) } : {}),
      ...(toDate(raw.created) !== undefined ? { created: toDate(raw.created) } : {}),
    }
  }

  async claimTask(taskId: string): Promise<void> {
    if (this.fallback) return this.fallback.claimTask(taskId)
    const userId = await this.getCurrentUserId()
    await this.call(this.config.toolNames.updateExecutor, { taskId, requestBody: { executorId: userId } })
  }

  async updateStatus(taskId: string, targetTfsId: string, note?: string): Promise<void> {
    if (this.fallback) return this.fallback.updateStatus(taskId, targetTfsId, note)
    await this.call(this.config.toolNames.updateStatus, {
      taskId,
      requestBody: {
        taskflowstatusId: targetTfsId,
        ...(note ? { tfsUpdateNote: note } : {}),
      },
    })
  }

  async postComment(taskId: string, text: string): Promise<void> {
    if (this.fallback) return this.fallback.postComment(taskId, text)
    await this.call(this.config.toolNames.postComment, {
      taskId,
      requestBody: { content: text, renderMode: 'markdown' },
    })
  }
}

/**
 * Mock 看板网关：本地种子缺陷，开发/演示/单测兜底。
 */
export class MockTeambitionBoardAdapter implements TeambitionBoardGateway {
  readonly isMock = true
  private readonly defects: TbDefectItem[]
  private readonly workflows: Map<string, TbWorkflow>

  constructor(seed?: { defects?: TbDefectItem[]; workflows?: Map<string, TbWorkflow> }) {
    this.defects = seed?.defects ?? MockTeambitionBoardAdapter.defaultDefects()
    this.workflows = seed?.workflows ?? new Map()
  }

  static defaultDefects(): TbDefectItem[] {
    const now = Date.now()
    return [
      {
        taskId: 'tb-mock-1001',
        uniqueId: 1001,
        content: '（演示）相机黑屏问题修复',
        projectId: 'mock-project',
        tfsId: 's-open',
        executorId: 'user-me',
        involveMembers: ['user-me', 'user-tester'],
        priority: 2,
        progress: 40,
        dueDate: new Date(now + 2 * 86_400_000).toISOString(),
        type: 'bug',
      },
      {
        taskId: 'tb-mock-1002',
        uniqueId: 1002,
        content: '（演示）蓝牙断连问题',
        projectId: 'mock-project',
        tfsId: 's-reopen',
        executorId: 'user-me',
        involveMembers: ['user-me'],
        priority: 1,
        progress: 10,
        dueDate: new Date(now - 1 * 86_400_000).toISOString(),
        type: 'bug',
      },
      {
        taskId: 'tb-mock-1003',
        uniqueId: 1003,
        content: '（演示）音量键失灵',
        projectId: 'mock-project',
        tfsId: 's-new',
        executorId: undefined,
        involveMembers: ['user-me'],
        priority: 0,
        progress: 0,
        type: 'bug',
      },
      {
        taskId: 'tb-mock-1004',
        uniqueId: 1004,
        content: '（演示）相机黑屏已修复待测试',
        projectId: 'mock-project',
        tfsId: 's-fixed',
        executorId: 'user-tester',
        involveMembers: ['user-me'],
        priority: 2,
        progress: 100,
        type: 'bug',
      },
      {
        taskId: 'tb-mock-1005',
        uniqueId: 1005,
        content: '（演示）亮度调节异常',
        projectId: 'mock-project',
        tfsId: 's-close',
        executorId: 'user-me',
        involveMembers: [],
        priority: 0,
        progress: 100,
        type: 'bug',
      },
    ]
  }

  static defaultWorkflow(): TbWorkflow {
    return {
      taskflowId: 'mock-defect-flow',
      statuses: [
        { id: 's-audit', name: '待审核', kind: 'start', pos: 65536, rejectStatusIds: ['s-new'], stage: 'waiting' },
        { id: 's-new', name: 'New', kind: 'unset', pos: 131072, rejectStatusIds: ['s-audit', 's-close'], stage: 'dev' },
        { id: 's-open', name: 'Open', kind: 'unset', pos: 851968, rejectStatusIds: ['s-new', 's-fixed'], stage: 'dev' },
        { id: 's-fixed', name: 'Fixed', kind: 'unset', pos: 786432, rejectStatusIds: ['s-open', 's-reopen', 's-close'], stage: 'waiting' },
        { id: 's-reopen', name: 'Reopen', kind: 'unset', pos: 917504, rejectStatusIds: ['s-open', 's-close'], stage: 'dev' },
        { id: 's-close', name: 'Close', kind: 'end', pos: 983040, rejectStatusIds: [], stage: 'closed' },
        { id: 's-postpone', name: 'Postpone', kind: 'end', pos: 1048576, rejectStatusIds: [], stage: 'closed' },
      ],
    }
  }

  async getCurrentUserId(): Promise<string> {
    return 'user-me'
  }

  async listTaskTypeNames(_projectId: string): Promise<Map<string, string>> {
    return new Map([['sfc-bug', '缺陷']])
  }

  async listProjectCustomFields(_projectId: string): Promise<Map<string, string>> {
    return new Map([
      ['cf-probability', '出现几率'],
      ['cf-severity', '严重程度'],
      ['cf-version', '软件版本'],
    ])
  }

  async listProjectNames(_projectIds: string[]): Promise<Map<string, string>> {
    // Mock：返回演示项目名
    return new Map([['mock-project', 'Mock 项目']])
  }

  async listMyDefects(_roleTypes?: string): Promise<TbDefectItem[]> {
    return this.defects
  }

  async listClosedDefects(_days: number): Promise<TbDefectItem[]> {
    // Mock：返回终态缺陷（s-close / s-postpone）作为演示
    return this.defects.filter((item) => item.tfsId === 's-close' || item.tfsId === 's-postpone')
  }

  async listProjectDefects(_projectId: string): Promise<TbDefectItem[]> {
    return this.defects
  }

  async getTaskWorkflow(_taskId: string): Promise<TbWorkflow | undefined> {
    return this.workflows.get(_taskId) ?? MockTeambitionBoardAdapter.defaultWorkflow()
  }

  async listTransitions(_taskId: string): Promise<TbStatusTransition[]> {
    return []
  }

  async getTaskDetail(taskId: string): Promise<TbTaskDetail> {
    const item = this.defects.find((d) => d.taskId === taskId)
    if (!item) throw new Error(`Mock TB 任务不存在: ${taskId}`)
    return {
      taskId: item.taskId,
      ...(item.uniqueId !== undefined ? { uniqueId: item.uniqueId } : {}),
      content: item.content,
      projectId: item.projectId,
      tfsName: item.tfsName,
      note: '（演示）Mock 任务备注：请补充真实问题描述。',
      description: '（演示）Mock 任务描述。',
      attachments: [],
      fields: [{ name: '演示', value: 'Mock 数据' }],
      ...(item.executorId ? { executorId: item.executorId } : {}),
      involveMembers: item.involveMembers,
      ...(item.priority !== undefined ? { priority: item.priority } : {}),
      ...(item.progress !== undefined ? { progress: item.progress } : {}),
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
    }
  }

  async claimTask(taskId: string): Promise<void> {
    const item = this.defects.find((d) => d.taskId === taskId)
    if (item) item.executorId = 'user-me'
  }

  async updateStatus(taskId: string, targetTfsId: string): Promise<void> {
    const item = this.defects.find((d) => d.taskId === taskId)
    if (item) item.tfsId = targetTfsId
  }

  async postComment(_taskId: string, _text: string): Promise<void> {
    // no-op
  }
}
