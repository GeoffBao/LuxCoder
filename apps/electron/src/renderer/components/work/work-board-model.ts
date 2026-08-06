import type { KanbanNodeState, KanbanTaskRun } from '../app-shell/kanban/types'

interface BrowserRunLogEntry {
  kind: string
  nodeId?: string
  state?: string
  reason?: string
  result?: 'pass' | 'fail' | 'unparsed'
}

export interface BrowserTaskResultsForBoard {
  runId: string
  log: BrowserRunLogEntry[]
}

const NODE_STATES: ReadonlySet<string> = new Set([
  'pending',
  'running',
  'done',
  'failed',
  'cancelled',
  'skipped',
])

function isKanbanNodeState(value: string | undefined): value is KanbanNodeState {
  return value !== undefined && NODE_STATES.has(value)
}

/** 仅消费 IPC 返回的结构化日志，不在 React 中读取 task 运行文件。 */
export function buildKanbanTaskRun(
  taskSlug: string,
  results: BrowserTaskResultsForBoard,
): KanbanTaskRun {
  const nodeStates: Record<string, KanbanNodeState> = {}
  const failureReasons: string[] = []
  let hasFailedEvent = false

  for (const entry of results.log) {
    // 最终失败判定：仅 run-failed 事件（不依赖 reason，历史 run-failed 可能无 reason）。
    // 注意：verdict=fail 只是中间验收失败，会被 repairForVerdict 修复后重跑并可能最终
    // verdict=pass → run-completed，因此不作为最终失败判定；其 reason 仍收集，供
    // 最终失败且 run-failed 无 reason 时兜底展示具体原因。
    // node-finished state=failed 仅是节点级失败，可能被 node-retry 救回，同样不作为
    // 最终失败判定，但带 reason 时收集作为失败原因参考。
    if (entry.kind === 'run-failed') {
      hasFailedEvent = true
      if (entry.reason) failureReasons.push(entry.reason)
    } else if (entry.kind === 'verdict' && entry.result === 'fail' && entry.reason) {
      failureReasons.push(entry.reason)
    } else if (entry.kind === 'node-finished' && entry.state === 'failed' && entry.reason) {
      failureReasons.push(entry.reason)
    }
    if (!entry.nodeId) continue
    if (entry.kind === 'node-scheduled' || entry.kind === 'node-retry') {
      nodeStates[entry.nodeId] = 'pending'
    } else if (entry.kind === 'node-spawned') {
      nodeStates[entry.nodeId] = 'running'
    } else if (entry.kind === 'node-finished' && isKanbanNodeState(entry.state)) {
      nodeStates[entry.nodeId] = entry.state
    }
  }

  return {
    taskSlug,
    runId: results.runId,
    nodeStates,
    // 大体失败原因：优先取首个带 reason 的失败事件；事件存在但无 reason（历史数据）则给默认文案
    ...(hasFailedEvent
      ? { failureReason: failureReasons[0] ?? '任务执行失败（未通过验收）' }
      : {}),
  }
}
