import type { TaskWorkflow } from '@myyoda/shared/tasks'
import { INBOX_COLUMN_ID, type KanbanItem } from './types'

export interface KanbanColumnDefinition {
  id: string
  name: string
  color?: string
  /** 拖卡片到此列时自动套用的状态（仅自定义列路径使用，松耦合存 TaskWorkflow 字符串） */
  dropStatusId?: string
}

export interface KanbanBoardColumn extends KanbanColumnDefinition {
  items: KanbanItem[]
}

export interface KanbanBoardModel {
  columns: KanbanBoardColumn[]
  listItems: KanbanItem[]
}

export interface BoardNotification {
  level: 'error'
  message: string
}

/**
 * 活跃 Workflow 的默认四列。cancelled 仍是可筛选状态，但不占活动看板列。
 * 「未分类」由 scope facet 表达；历史 inbox 卡片回退到第一列。
 */
export const DEFAULT_KANBAN_COLUMNS: KanbanColumnDefinition[] = [
  { id: 'todo', name: '待办', color: '#6366f1' },
  { id: 'in-progress', name: '进行中', color: '#f59e0b' },
  { id: 'needs-review', name: '待验收', color: '#8b5cf6' },
  { id: 'done', name: '已完成', color: '#10b981' },
]

function resolveColumns(customColumns?: KanbanColumnDefinition[]): KanbanColumnDefinition[] {
  if (!customColumns?.length) return DEFAULT_KANBAN_COLUMNS

  const columns: KanbanColumnDefinition[] = []
  const seen = new Set<string>()
  for (const column of customColumns) {
    // 历史项目自定义列里可能显式配过 inbox 列；inbox 已下线，跳过（存量卡片走 fallback）
    if (!column.id || column.id === INBOX_COLUMN_ID || seen.has(column.id)) continue
    seen.add(column.id)
    columns.push(column)
  }
  return columns.length > 0 ? columns : DEFAULT_KANBAN_COLUMNS
}

/** Cancelled 不属于活动流程；只有用户显式筛选该状态时才投影到 Board。 */
export function activeBoardItems(items: KanbanItem[], workflow: 'all' | TaskWorkflow): KanbanItem[] {
  if (workflow === 'cancelled') return items
  return items.filter((item) => item.task?.workflow !== 'cancelled')
}

/** Board 与 List 从同一输入序列派生，分组过程不会改变卡片顺序。 */
export function buildKanbanBoardModel(
  items: KanbanItem[],
  customColumns?: KanbanColumnDefinition[],
): KanbanBoardModel {
  const definitions = resolveColumns(customColumns)
  const columnIds = new Set(definitions.map((column) => column.id))
  // 未知列（含历史 inbox）回退到第一列（默认「待办」）
  const fallbackColumnId = definitions[0]?.id ?? 'todo'
  const grouped = new Map(definitions.map((column) => [column.id, [] as KanbanItem[]]))

  for (const item of items) {
    const columnId = columnIds.has(item.columnId) ? item.columnId : fallbackColumnId
    grouped.get(columnId)!.push(item)
  }

  return {
    columns: definitions.map((column) => ({ ...column, items: grouped.get(column.id)! })),
    listItems: items,
  }
}

export function openKanbanItem(item: KanbanItem, onOpen: (item: KanbanItem) => void): void {
  onOpen(item)
}

/** 容器每次只弹出一条通知，避免多个 toast 在同一帧堆叠。 */
export function consumeFirstNotification(notifications: BoardNotification[]): {
  notification?: BoardNotification
  remaining: BoardNotification[]
} {
  const [notification, ...remaining] = notifications
  return { ...(notification ? { notification } : {}), remaining }
}
