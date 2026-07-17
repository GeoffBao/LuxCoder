import type { KanbanNodeState, KanbanTaskRun } from '../app-shell/kanban/types'

interface BrowserRunLogEntry {
  kind: string
  nodeId?: string
  state?: string
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

  for (const entry of results.log) {
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
  }
}
