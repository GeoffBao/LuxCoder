import type { TaskWorkflow } from '@luxcoder/shared/tasks'
import { DEFAULT_KANBAN_COLUMNS } from './board-model'

export const KANBAN_COLUMNS = DEFAULT_KANBAN_COLUMNS

/** Task workflow → 三列看板的缺省归置；workflow 仍保留完整五态，不被列 ID 覆盖。 */
export function workflowForKanbanColumn(columnId: string): TaskWorkflow {
  if (columnId === 'in-progress') return 'in-progress'
  if (columnId === 'done') return 'done'
  return 'todo'
}

export function deriveDefaultKanbanColumn(workflow?: string): string {
  if (workflow === 'in-progress') return 'in-progress'
  if (workflow === 'needs-review' || workflow === 'done' || workflow === 'cancelled') return 'done'
  return 'todo'
}

/**
 * status → 默认列映射（仅缺省归置用；列由用户拖放决定，允许与 badge 漂移——对齐 craft 双字段模型）。
 * needs-review 归「已完成」列：由 dag-attention 提醒环表达「验收前再看一眼」，
 * 不再映射进「进行中」（它不是机器还在跑的状态）。
 */
export function statusToColumn(statusId?: string): string {
  switch (statusId) {
    case 'running':
    case 'in-progress':
      return 'in-progress'
    case 'needs-review':
    case 'done':
    case 'completed':
    case 'cancelled':
      return 'done'
    default:
      return 'todo'
  }
}
