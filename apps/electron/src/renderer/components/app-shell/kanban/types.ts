import type { AgentSessionMeta } from '@luxagents/shared'

/** 未归属项目的会话默认显示在收件箱。 */
export const INBOX_COLUMN_ID = 'inbox'

export type KanbanBoardMode = 'board' | 'list'
export type KanbanNodeState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped'

/** 渲染进程使用的项目摘要，不包含本地文件路径。 */
export interface KanbanProject {
  id: string
  name: string
  kanbanColumns?: Array<{ id: string; name: string; color?: string }>
}

/** 从任务运行快照归一化后的最小节点状态。 */
export interface KanbanTaskRun {
  taskSlug: string
  runId: string
  nodeStates: Record<string, KanbanNodeState>
}

/** 可安全展示的 Teambition 绑定字段。 */
export interface TeambitionBinding {
  sessionId: string
  taskId: string
  title?: string
  status?: string
}

export interface KanbanFilter {
  projectId: string | null
}

export interface KanbanNodeProgress {
  completedNodes: number
  totalNodes: number
}

export interface KanbanTeambitionFields {
  taskId: string
  title?: string
  status?: string
}

/** 仅用于渲染的卡片；不会回写到 AgentSessionMeta。 */
export interface KanbanItem {
  id: string
  title: string
  columnId: string
  session: AgentSessionMeta
  project: KanbanProject | null
  taskRun?: KanbanNodeProgress
  teambition?: KanbanTeambitionFields
}

export interface KanbanViewModel {
  /** Board 与 List 共用这一排序后的数组，避免两种视图顺序漂移。 */
  boardItems: KanbanItem[]
  listItems: KanbanItem[]
}
