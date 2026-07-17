/**
 * 将有 spec 支撑的任务 DAG nodes 与实时 child sessions 合并为卡片的 subtask rows。
 *
 * 卡片和编辑器此前展示的是互斥数据：卡片只展示 child SESSIONS，因此已编写但未运行的节点不可见；
 * 编辑器只展示 spec NODES，因此 quick-add children 不可见。合并后，卡片按每个 DAG node 展示一行，
 * 解析优先级如下：
 *
 *   最新 run child（`taskNodeId` 匹配；重跑时 `createdAt` 最新者胜出）
 *   → 否则为已接纳的 quick-add session（node ID 为 `qa-<sessionId>`）
 *   → 否则为合成的 pending 行（已编写但尚未运行，没有可打开的 session）。
 *
 * 不代表 spec node 的 children（未接纳的 quick-add、已移除 node 的 children）按创建时间追加在
 * node 行之后。已合并 node 的早期运行会被最新结果取代，折叠进同一 node 行而不重复展示。没有 spec
 * 时，行仅按 children 展示（兼容旧卡片）。
 */
import type { KanbanSubtask, SubtaskRunState } from './types'
import { quickAddSessionId } from './task-spec-form'

/** 卡片行所需的最小 spec node 信息（model 已从 spec 计算默认值）。 */
export interface SpecNodeSummary {
  id: string
  title: string
  model?: string
}

/** 合并所需的最小 child session 信息（run state 由调用方预先计算）。 */
export interface SubtaskChildRow {
  id: string
  title: string
  runState: SubtaskRunState
  model: string
  taskNodeId?: string
  createdAt?: number
}

const toRow = (child: SubtaskChildRow): KanbanSubtask => ({
  id: child.id,
  sessionId: child.id,
  title: child.title,
  runState: child.runState,
  model: child.model,
})

export function mergeSubtaskRows(
  specNodes: readonly SpecNodeSummary[] | undefined,
  children: readonly SubtaskChildRow[],
  fallbackModel: string
): KanbanSubtask[] {
  const ordered = [...children].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  if (!specNodes?.length) return ordered.map(toRow)

  // 升序遍历时，node 的最后一次写入就是最新 child（重跑结果会取代早期结果）。
  const latestByNode = new Map<string, SubtaskChildRow>()
  for (const child of ordered) {
    if (child.taskNodeId) latestByNode.set(child.taskNodeId, child)
  }
  const childById = new Map(ordered.map(c => [c.id, c]))
  const nodeIds = new Set(specNodes.map(n => n.id))

  const consumed = new Set<string>()
  const rows: KanbanSubtask[] = []
  for (const node of specNodes) {
    const adoptedId = quickAddSessionId(node.id)
    const adopted = adoptedId ? childById.get(adoptedId) : undefined
    // 已接纳的 quick-add session 是该 node 的运行前执行；一旦出现 Conductor run child，
    // 就和早期运行一样被取代。
    if (adopted) consumed.add(adopted.id)
    const child = latestByNode.get(node.id) ?? adopted
    if (child) {
      consumed.add(child.id)
      rows.push(toRow(child))
    } else {
      rows.push({ id: `node:${node.id}`, title: node.title, runState: 'pending', model: node.model ?? fallbackModel })
    }
  }
  for (const child of ordered) {
    if (consumed.has(child.id)) continue
    // 已合并 node 的非最新 run child 已被取代，不单独显示。
    if (child.taskNodeId && nodeIds.has(child.taskNodeId)) continue
    rows.push(toRow(child))
  }
  return rows
}
