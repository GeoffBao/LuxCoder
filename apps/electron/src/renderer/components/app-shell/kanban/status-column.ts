import { DEFAULT_KANBAN_COLUMNS } from './board-model'

export const KANBAN_COLUMNS = DEFAULT_KANBAN_COLUMNS

export function statusToColumn(statusId?: string): string {
  switch (statusId) {
    case 'running':
    case 'in-progress':
    case 'needs-review':
      return 'in-progress'
    case 'done':
    case 'completed':
    case 'cancelled':
      return 'done'
    default:
      return 'todo'
  }
}
