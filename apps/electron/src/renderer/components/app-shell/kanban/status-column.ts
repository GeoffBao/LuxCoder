import type { TaskWorkflow } from '@myyoda/shared/tasks'
import { DEFAULT_KANBAN_COLUMNS } from './board-model'

export const KANBAN_COLUMNS = DEFAULT_KANBAN_COLUMNS

/** Task workflow → 活跃四列看板；cancelled 不作为可拖入的活动列。 */
export function workflowForKanbanColumn(columnId: string): TaskWorkflow {
  if (columnId === 'in-progress') return 'in-progress'
  if (columnId === 'needs-review') return 'needs-review'
  if (columnId === 'done') return 'done'
  return 'todo'
}

export function deriveDefaultKanbanColumn(workflow?: string): string {
  if (workflow === 'in-progress') return 'in-progress'
  if (workflow === 'needs-review') return 'needs-review'
  if (workflow === 'done' || workflow === 'cancelled') return 'done'
  return 'todo'
}

/**
 * status → 默认列映射（仅缺省归置用；列由用户拖放决定，允许与 badge 漂移——对齐 craft 双字段模型）。
 * needs-review 使用独立「待验收」列；cancelled 仅在筛选/列表中查询，缺省归入完成列。
 */
export function statusToColumn(statusId?: string): string {
  switch (statusId) {
    case 'running':
    case 'in-progress':
      return 'in-progress'
    case 'needs-review':
      return 'needs-review'
    case 'done':
    case 'completed':
    case 'cancelled':
      return 'done'
    default:
      return 'todo'
  }
}
