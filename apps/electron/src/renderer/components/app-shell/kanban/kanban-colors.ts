export const DEFAULT_KANBAN_COLUMN_COLORS: Record<string, string> = {
  inbox: '#64748b',
  todo: '#6366f1',
  'in-progress': '#f59e0b',
  done: '#10b981',
}

export function resolveKanbanColumnColor(columnId: string, color?: string): string {
  return color ?? DEFAULT_KANBAN_COLUMN_COLORS[columnId] ?? '#64748b'
}
