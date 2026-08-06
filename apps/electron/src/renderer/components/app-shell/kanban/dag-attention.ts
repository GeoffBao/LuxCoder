import { buildProgressSegments } from './SubtaskProgress'
import type { KanbanSubtask } from './types'

export type DagAttentionKind = 'has-failed' | 'needs-review' | 'incomplete'

export interface DagAttention {
  kind: DagAttentionKind
  label: string
  /** 大体失败原因（首个失败节点 reason），仅 has-failed 时有值 */
  reason?: string
}

/**
 * DAG 未完全成功结算时的注意力标记。
 * 用于「已完成」列里进度仍半截 / 有失败 / 待处理的卡片，避免列名暗示整任务做完。
 */
export function resolveDagAttention(
  subtasks: KanbanSubtask[],
  total?: number,
  failureReason?: string,
): DagAttention | null {
  const segments = buildProgressSegments(subtasks, total)
  // 有失败原因（run log 首个失败节点 reason）＝ 明确执行失败，优先展示失败标注
  if (failureReason) {
    return { kind: 'has-failed', label: '执行失败', reason: failureReason }
  }
  if (segments.length === 0) return null
  const failed = segments.some((state) => state === 'failed')
  const review = segments.some((state) => state === 'needs-review')
  const open = segments.some((state) => state === 'pending' || state === 'running')
  if (failed) return { kind: 'has-failed', label: '执行失败' }
  if (review) return { kind: 'needs-review', label: '待验收' }
  if (open) return { kind: 'incomplete', label: '未跑完' }
  return null
}

/**
 * 在「已完成 / 待验收」列展示注意力标记；列位可手拖，与 DAG 终态解耦。
 * 待验收列同样展示失败/待处理，避免卡片静默停留在验收区。
 */
export function shouldShowDoneColumnAttention(
  columnId: string,
  attention: DagAttention | null,
): boolean {
  return (columnId === 'done' || columnId === 'needs-review') && attention !== null
}
