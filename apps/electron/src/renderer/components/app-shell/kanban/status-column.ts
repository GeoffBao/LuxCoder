import { DEFAULT_KANBAN_COLUMNS } from './board-model'

export const KANBAN_COLUMNS = DEFAULT_KANBAN_COLUMNS

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
