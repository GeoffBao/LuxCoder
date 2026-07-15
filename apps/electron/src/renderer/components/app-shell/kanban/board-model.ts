import { INBOX_COLUMN_ID, type KanbanItem } from './types'

export interface KanbanColumnDefinition {
  id: string
  name: string
  color?: string
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

export const DEFAULT_KANBAN_COLUMNS: KanbanColumnDefinition[] = [
  { id: INBOX_COLUMN_ID, name: '收件箱', color: 'var(--muted-foreground)' },
  { id: 'todo', name: '待办', color: 'var(--chart-2)' },
  { id: 'in-progress', name: '进行中', color: 'var(--chart-4)' },
  { id: 'done', name: '已完成', color: 'var(--chart-1)' },
]

function resolveColumns(customColumns?: KanbanColumnDefinition[]): KanbanColumnDefinition[] {
  if (!customColumns?.length) return DEFAULT_KANBAN_COLUMNS

  const columns: KanbanColumnDefinition[] = [DEFAULT_KANBAN_COLUMNS[0]!]
  const seen = new Set([INBOX_COLUMN_ID])
  for (const column of customColumns) {
    if (!column.id || seen.has(column.id)) continue
    seen.add(column.id)
    columns.push(column)
  }
  return columns
}

/** Board 与 List 从同一输入序列派生，分组过程不会改变卡片顺序。 */
export function buildKanbanBoardModel(
  items: KanbanItem[],
  customColumns?: KanbanColumnDefinition[],
): KanbanBoardModel {
  const definitions = resolveColumns(customColumns)
  const columnIds = new Set(definitions.map((column) => column.id))
  const fallbackColumnId = definitions.find((column) => column.id !== INBOX_COLUMN_ID)?.id ?? INBOX_COLUMN_ID
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
