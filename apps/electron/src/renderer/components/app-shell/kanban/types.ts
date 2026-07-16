import type { AgentSessionMeta } from '@luxagents/shared'

/** 未归属项目的会话默认显示在收件箱。 */
export const INBOX_COLUMN_ID = 'inbox'

export type KanbanBoardMode = 'board' | 'list'
export type KanbanNodeState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped'
export type SubtaskRunState = 'done' | 'running' | 'pending' | 'failed'

/** TaskEditor 的创建目标或已绑定会话目标。 */
export type TaskEditorTarget =
  | { mode: 'create'; initialProjectId?: string }
  | { mode: 'edit'; sessionId: string; taskSlug: string }

export interface KanbanSubtask {
  id: string
  sessionId?: string
  title: string
  runState: SubtaskRunState
  model: string
}

/** 渲染进程使用的项目摘要，不包含本地文件路径。 */
export interface KanbanProject {
  id: string
  slug?: string
  name: string
  description?: string
  details?: string
  color?: string
  archivedAt?: number
  /** 项目最近更新时间（侧边栏子分组排序用；preload 透传 ProjectConfig.updatedAt） */
  updatedAt?: number
  workspaceId?: string
  kanbanColumns?: Array<{ id: string; name: string; color?: string; dropStatusId?: string }>
}

/** 从任务运行快照归一化后的最小节点状态。 */
export interface KanbanTaskRun {
  taskSlug: string
  runId: string
  nodeStates: Record<string, KanbanNodeState>
}

/** 可安全展示的 Teambition 绑定字段。 */
export interface TeambitionBinding {
  bindingId?: string
  sessionId: string
  taskId: string
  title?: string
  status?: string
  syncState?: 'synced' | 'pending' | 'conflict' | 'stale' | 'needs-reauth'
  error?: string
}

export interface KanbanFilter {
  projectId: string | null
}

export interface KanbanNodeProgress {
  completedNodes: number
  totalNodes: number
}

export interface KanbanTeambitionFields {
  bindingId?: string
  taskId: string
  title?: string
  status?: string
  syncState?: 'synced' | 'pending' | 'conflict' | 'stale' | 'needs-reauth'
  error?: string
}

/** 仅用于渲染的卡片；不会回写到 AgentSessionMeta。 */
export interface KanbanItem {
  id: string
  title: string
  columnId: string
  session: AgentSessionMeta
  project: KanbanProject | null
  /** craft 对齐：卡片上展开的子任务行（spec nodes ∪ child sessions） */
  subtasks: KanbanSubtask[]
  /** Conductor 总节点数；进度分母在 subtasks 尚未填满时保持稳定 */
  subtaskTotal?: number
  /** 编排器或任一子任务正在流式执行 */
  isProcessing?: boolean
  taskRun?: KanbanNodeProgress
  teambition?: KanbanTeambitionFields
}

export interface KanbanViewModel {
  /** Board 与 List 共用这一排序后的数组，避免两种视图顺序漂移。 */
  boardItems: KanbanItem[]
  listItems: KanbanItem[]
}

/** 看板模型选择器中的单个模型项。 */
export interface KanbanModelOption {
  id: string
  name: string
  /** 提供该模型的渠道 ID（写入 spec.llmConnection） */
  channelId: string
}

/**
 * 按渠道分组的可选模型（对应 craft 的 provider groups；
 * LuxAgents 用 Channel 充当 connection，llmConnection = channelId）。
 */
export interface KanbanModelProviderGroup {
  provider: string
  label: string
  models: KanbanModelOption[]
}
