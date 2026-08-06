/**
 * TB 缺陷看板服务（main）
 *
 * 封装 TB 缺陷问题单的看板查询与流转能力，供渲染层 IPC 使用。
 *
 * 设计要点：
 * - 复用现有 TeambitionGateway 连接（listMyOpenTasks / QueryTaskV3 等），
 *   看板专用方法通过网关的通用 callTool 能力扩展（见 TeambitionBoardGateway）
 * - 状态机元数据（taskflowStatuses）与任务类型（sfc）做进程内缓存，避免重复拉取
 * - 三区划分 / 合法流转推导由 @luxcoder/shared/teambition-defect 纯函数承担
 * - 写回操作（updateStatus / claim / comment）统一走网关，错误映射到
 *   needs-reauth / conflict 等状态，供 UI 降级
 */

import type {
  TbDefectItem,
  TbStatusTransition,
  TbTaskDetail,
  TbWorkflow,
  TbWorkflowStatus,
} from '@luxcoder/shared/teambition-defect'

/** 网关需要暴露的看板能力（由 adapter 实现；Mock 提供本地兜底） */
export interface TeambitionBoardGateway {
  /** 是否为 Mock 网关（无真实 TB 语义，UI 展示「演示数据」角标用） */
  readonly isMock?: boolean
  /** 当前用户 id（GetUsersMe） */
  getCurrentUserId(): Promise<string>
  /** 用户名下未完成任务（SearchUserTasksV3 分页全量，含全部类型） */
  listMyDefects(roleTypes?: string): Promise<TbDefectItem[]>
  /** 项目内任务（SearchProjectTasksV3，含全部类型） */
  listProjectDefects(projectId: string): Promise<TbDefectItem[]>
  /** 项目任务类型（GetScenarioFieldsMCP），返回 id → name 映射 */
  listTaskTypeNames(projectId: string): Promise<Map<string, string>>
  /** 项目自定义字段（SearchProjectCustomFiledsV3），返回 cfId → 字段名 映射 */
  listProjectCustomFields(projectId: string): Promise<Map<string, string>>
  /** 任务所在工作流状态集（QueryTaskTfs 或 SearchTaskflowStatusesV3） */
  getTaskWorkflow(taskId: string): Promise<TbWorkflow | undefined>
  /** 任务流转历史（ListTaskActivitiesV3 update.taskflowstatus） */
  listTransitions(taskId: string): Promise<TbStatusTransition[]>
  /** 任务详情（QueryTaskV3：备注/描述/附件/自定义字段） */
  getTaskDetail(taskId: string): Promise<TbTaskDetail>
  /** 认领任务（UpdateTaskExecutorV3 executor=当前用户） */
  claimTask(taskId: string): Promise<void>
  /** 流转任务状态（UpdateTaskStatusV3 + 流转说明） */
  updateStatus(taskId: string, targetTfsId: string, note?: string): Promise<void>
  /** 评论（CreateTaskCommentV3） */
  postComment(taskId: string, text: string): Promise<void>
}

export interface TeambitionBoardServiceOptions {
  gateway: TeambitionBoardGateway
  /** 元数据缓存 TTL（ms），默认 5 分钟 */
  metaTtlMs?: number
  now?: () => number
}

interface MetaCacheEntry<T> {
  value: T
  expiresAt: number
}

/** 按项目缓存的元数据（任务类型映射 / 缺陷工作流 / 自定义字段名） */
interface ProjectMetaCache {
  typeNames: MetaCacheEntry<Map<string, string>>
  customFields: MetaCacheEntry<Map<string, string>>
  workflows: Map<string, MetaCacheEntry<TbWorkflow>>
}

export class TeambitionBoardService {
  private readonly metaTtlMs: number
  private readonly now: () => number
  private readonly projectMeta = new Map<string, ProjectMetaCache>()
  private currentUserIdPromise: Promise<string> | undefined

  constructor(private readonly options: TeambitionBoardServiceOptions) {
    this.metaTtlMs = options.metaTtlMs ?? 5 * 60_000
    this.now = options.now ?? Date.now
  }

  /** 当前用户 id（带缓存，直到失败才重置） */
  getCurrentUserId(): Promise<string> {
    if (!this.currentUserIdPromise) {
      this.currentUserIdPromise = this.options.gateway.getCurrentUserId().catch((cause) => {
        this.currentUserIdPromise = undefined
        throw cause
      })
    }
    return this.currentUserIdPromise
  }

  /** 是否 Mock 网关（无真实 TB 配置时的本地兜底，UI 展示「演示数据」角标） */
  isMock(): boolean {
    return this.options.gateway.isMock === true
  }

  /** 清空全部缓存（工作区切换 / 手动刷新时调用） */
  clearCache(): void {
    this.projectMeta.clear()
    this.currentUserIdPromise = undefined
  }

  // -------------------------------------------------------------------------
  // 任务列表
  // -------------------------------------------------------------------------

  /** 我的任务列表（SearchUserTasksV3 分页全量，含全部类型；卡片按类型徽章区分） */
  async listMyDefects(roleTypes?: string): Promise<TbDefectItem[]> {
    return this.options.gateway.listMyDefects(roleTypes)
  }

  /** 项目内任务列表（SPM/全量场景，含全部类型） */
  async listProjectDefects(projectId: string): Promise<TbDefectItem[]> {
    return this.options.gateway.listProjectDefects(projectId)
  }

  // -------------------------------------------------------------------------
  // 元数据（带缓存）
  // -------------------------------------------------------------------------

  private projectMetaEntry(projectId: string): ProjectMetaCache {
    let entry = this.projectMeta.get(projectId)
    if (!entry) {
      entry = { typeNames: { value: new Map(), expiresAt: 0 }, customFields: { value: new Map(), expiresAt: 0 }, workflows: new Map() }
      this.projectMeta.set(projectId, entry)
    }
    return entry
  }

  private isFresh<T>(entry: MetaCacheEntry<T>): boolean {
    return entry.expiresAt > this.now()
  }

  /** 项目任务类型名映射（id → name），带缓存；失败返回空 Map 不抛错（UI 可降级） */
  async listTaskTypeNames(projectId: string): Promise<Map<string, string>> {
    const entry = this.projectMetaEntry(projectId).typeNames
    if (this.isFresh(entry) && entry.value.size > 0) return entry.value
    try {
      const value = await this.options.gateway.listTaskTypeNames(projectId)
      this.projectMetaEntry(projectId).typeNames = { value, expiresAt: this.now() + this.metaTtlMs }
      return value
    } catch (cause) {
      console.warn(`[TbBoard] 项目任务类型加载失败 ${projectId}:`, cause)
      return new Map()
    }
  }

  /** 项目自定义字段名映射（cfId → name），带缓存；失败返回空 Map */
  async listProjectCustomFields(projectId: string): Promise<Map<string, string>> {
    const entry = this.projectMetaEntry(projectId).customFields
    if (this.isFresh(entry) && entry.value.size > 0) return entry.value
    try {
      const value = await this.options.gateway.listProjectCustomFields(projectId)
      this.projectMetaEntry(projectId).customFields = { value, expiresAt: this.now() + this.metaTtlMs }
      return value
    } catch (cause) {
      console.warn(`[TbBoard] 项目自定义字段加载失败 ${projectId}:`, cause)
      return new Map()
    }
  }

  /**
   * 任务工作流状态集（按 taskId 缓存，同一任务 TTL 内不重复查询）。
   * 注：同一项目通常共享同一工作流，但列表查询前无法预知 taskId 所属 taskflowId；
   * 若任务量大可后续引入「taskflowId → 工作流」索引（P2 优化点）。
   */
  async getTaskWorkflow(taskId: string, projectId?: string): Promise<TbWorkflow | undefined> {
    // 先尝试项目级缓存（同一项目缺陷共用工作流）
    if (projectId) {
      const entry = this.projectMetaEntry(projectId).workflows.get(taskId)
      // 项目内按 taskId 缓存可能命中已查过的工作流
      if (entry && this.isFresh(entry)) return entry.value
    }
    const workflow = await this.options.gateway.getTaskWorkflow(taskId)
    if (workflow && projectId) {
      this.projectMetaEntry(projectId).workflows.set(taskId, {
        value: workflow,
        expiresAt: this.now() + this.metaTtlMs,
      })
    }
    return workflow
  }

  // -------------------------------------------------------------------------
  // 详情与写回
  // -------------------------------------------------------------------------

  async listTransitions(taskId: string): Promise<TbStatusTransition[]> {
    return this.options.gateway.listTransitions(taskId)
  }

  async getTaskDetail(taskId: string): Promise<TbTaskDetail> {
    return this.options.gateway.getTaskDetail(taskId)
  }

  /** 批量获取多个任务的工作流（带缓存），用于列表一次性补全状态名。返回 Record 而非 Map（IPC 序列化 Map 会丢结构） */
  async listWorkflowsForTasks(taskIds: string[], projectId?: string): Promise<Record<string, TbWorkflow | undefined>> {
    // 并行拉取（网关分页全量列表场景下同一批任务通常属于同一/少量工作流，缓存可复用）
    const entries = await Promise.all(
      taskIds.map(async (taskId) => [taskId, await this.getTaskWorkflow(taskId, projectId)] as const),
    )
    return Object.fromEntries(entries)
  }

  async claimTask(taskId: string): Promise<void> {
    return this.options.gateway.claimTask(taskId)
  }

  async updateStatus(taskId: string, targetTfsId: string, note?: string): Promise<void> {
    return this.options.gateway.updateStatus(taskId, targetTfsId, note)
  }

  async postComment(taskId: string, text: string): Promise<void> {
    return this.options.gateway.postComment(taskId, text)
  }

  /** 补充每条缺陷的状态名（tfsName）——由列表查询后统一映射，减少逐条请求 */
  async attachStatusNames(items: TbDefectItem[], workflowByTask: Map<string, TbWorkflow | undefined>): Promise<TbDefectItem[]> {
    return items.map((item) => {
      const workflow = workflowByTask.get(item.taskId)
      const status = workflow?.statuses.find((s) => s.id === item.tfsId)
      return status ? { ...item, tfsName: status.name } : item
    })
  }
}

export type { TbDefectItem, TbStatusTransition, TbWorkflow, TbWorkflowStatus }
