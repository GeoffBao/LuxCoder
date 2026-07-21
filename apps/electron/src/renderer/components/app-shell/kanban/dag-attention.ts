import { buildProgressSegments } from './SubtaskProgress'
import type { KanbanSubtask } from './types'

export type DagAttentionKind = 'has-failed' | 'needs-review' | 'incomplete'

export interface DagAttention {
  kind: DagAttentionKind
  label: string
}

/**
 * DAG 未完全成功结算时的注意力标记。
 * 用于「已完成」列里进度仍半截 / 有失败 / 待处理的卡片，避免列名暗示整任务做完。
 */
export function resolveDagAttention(
  subtasks: KanbanSubtask[],
  total?: number,
): DagAttention | null {
  const segments = buildProgressSegments(subtasks, total)
  if (segments.length === 0) return null
  const failed = segments.some((state) => state === 'failed')
  const review = segments.some((state) => state === 'needs-review')
  const open = segments.some((state) => state === 'pending' || state === 'running')
  if (failed) return { kind: 'has-failed', label: '有失败' }
  if (review) return { kind: 'needs-review', label: '待处理' }
  if (open) return { kind: 'incomplete', label: '未跑完' }
  return null
}

/** 仅在「已完成」列展示：列位可手拖，与 DAG 终态解耦。 */
export function shouldShowDoneColumnAttention(
  columnId: string,
  attention: DagAttention | null,
): boolean {
  return columnId === 'done' && attention !== null
}
