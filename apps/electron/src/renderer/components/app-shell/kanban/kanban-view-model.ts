import type { AgentSessionMeta } from '@luxagents/shared'
import { resolveExpertId } from '@luxagents/shared/experts'
import { mergeSubtaskRows, type SpecNodeSummary, type SubtaskChildRow } from './subtask-merge'
import {
  INBOX_COLUMN_ID,
  type KanbanFilter,
  type KanbanItem,
  type KanbanProject,
  type KanbanTaskRun,
  type KanbanViewModel,
  type SubtaskRunState,
  type TeambitionBinding,
} from './types'

export type {
  KanbanFilter,
  KanbanItem,
  KanbanProject,
  KanbanTaskRun,
  KanbanViewModel,
  TeambitionBinding,
} from './types'

export interface BuildKanbanViewModelInput {
  projects: KanbanProject[]
  sessions: AgentSessionMeta[]
  runs: KanbanTaskRun[]
  bindings: TeambitionBinding[]
  filter: KanbanFilter
  /** taskSlug → DAG nodes；缺省时仅展示 child sessions */
  specNodesBySlug?: Map<string, SpecNodeSummary[]>
  /** taskSlug → TaskSpec.defaults.expertId */
  expertIdsBySlug?: Map<string, string>
  fallbackModel?: string
}

function findTaskRun(session: AgentSessionMeta, runs: KanbanTaskRun[]): KanbanTaskRun | undefined {
  if (!session.taskSlug) return undefined
  return runs.find((run) =>
    run.taskSlug === session.taskSlug && (session.taskRunId === undefined || run.runId === session.taskRunId),
  )
}

/** 对齐 craft：closed → done；needs-review 单独成态（勿与 failed 混成红叉）；用户中断 → failed。 */
export function deriveSubtaskRunState(child: AgentSessionMeta): SubtaskRunState {
  if (child.stoppedByUser) return 'failed'
  const status = child.sessionStatus
  if (status === 'done' || status === 'completed') return 'done'
  if (status === 'needs-review') return 'needs-review'
  if (status === 'failed') return 'failed'
  if (status === 'running' || status === 'in-progress' || status === 'queued') return 'running'
  return 'pending'
}

function runStateFromNode(state: string | undefined): SubtaskRunState {
  if (state === 'done') return 'done'
  if (state === 'failed' || state === 'cancelled') return 'failed'
  if (state === 'running') return 'running'
  return 'pending'
}

function buildItem(
  session: AgentSessionMeta,
  projectsById: Map<string, KanbanProject>,
  runs: KanbanTaskRun[],
  bindingsBySessionId: Map<string, TeambitionBinding>,
  children: SubtaskChildRow[],
  specNodes: SpecNodeSummary[] | undefined,
  fallbackModel: string,
  taskExpertId: string | undefined,
): KanbanItem {
  const run = findTaskRun(session, runs)
  const totalNodes = session.taskNodeCount
    ?? specNodes?.length
    ?? (run ? Object.keys(run.nodeStates).length : 0)
  const completedNodes = run
    ? Object.values(run.nodeStates).filter((state) => state === 'done').length
    : 0
  const binding = bindingsBySessionId.get(session.id)
  const project = session.projectId ? projectsById.get(session.projectId) ?? null : null
  const expertId = resolveExpertId(taskExpertId, project?.defaultExpertId) ?? undefined

  // 有 run 节点状态但还没 child session 时，用 nodeStates 合成行标题，避免卡片只有 0/N 进度条
  const nodesForMerge = specNodes?.length
    ? specNodes
    : run
      ? Object.keys(run.nodeStates).map((id) => ({
          id,
          title: id,
          model: fallbackModel,
        }))
      : undefined

  let subtasks = mergeSubtaskRows(nodesForMerge, children, fallbackModel)
  if (run && subtasks.length > 0) {
    subtasks = subtasks.map((row) => {
      const nodeId = row.id.startsWith('node:') ? row.id.slice(5) : children.find((c) => c.id === row.id)?.taskNodeId
      if (!nodeId || !(nodeId in run.nodeStates)) return row
      return { ...row, runState: runStateFromNode(run.nodeStates[nodeId]) }
    })
  }

  return {
    id: session.id,
    title: session.title,
    columnId: session.kanbanColumn ?? INBOX_COLUMN_ID,
    session,
    project,
    subtasks,
    ...(expertId ? { expertId } : {}),
    ...(totalNodes > 0 ? { subtaskTotal: totalNodes } : {}),
    ...(run && totalNodes > 0 ? { taskRun: { completedNodes, totalNodes } } : {}),
    ...(binding
      ? {
          teambition: {
            ...(binding.bindingId ? { bindingId: binding.bindingId } : {}),
            taskId: binding.taskId,
            ...(binding.title ? { title: binding.title } : {}),
            ...(binding.status ? { status: binding.status } : {}),
            ...(binding.syncState ? { syncState: binding.syncState } : {}),
            ...(binding.error ? { error: binding.error } : {}),
          },
        }
      : {}),
  }
}

/**
 * 将服务端快照合并为纯渲染模型。排序只在这里发生，Board 与 List 共享同一顺序。
 */
export function buildKanbanViewModel(input: BuildKanbanViewModelInput): KanbanViewModel {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]))
  const bindingsBySessionId = new Map(input.bindings.map((binding) => [binding.sessionId, binding]))
  const fallbackModel = input.fallbackModel ?? ''
  const childrenByParent = new Map<string, SubtaskChildRow[]>()
  for (const session of input.sessions) {
    if (!session.parentSessionId || session.archived || session.taskDraft) continue
    const row: SubtaskChildRow = {
      id: session.id,
      title: session.title,
      runState: deriveSubtaskRunState(session),
      model: session.modelId ?? fallbackModel,
      ...(session.taskNodeId ? { taskNodeId: session.taskNodeId } : {}),
      createdAt: session.createdAt,
    }
    const siblings = childrenByParent.get(session.parentSessionId)
    if (siblings) siblings.push(row)
    else childrenByParent.set(session.parentSessionId, [row])
  }

  const topLevelSessions = input.sessions.filter((session) =>
    !session.archived && !session.taskDraft && !session.parentSessionId,
  )
  const sessions = input.filter.projectId === null
    ? topLevelSessions
    : topLevelSessions.filter((session) => session.projectId === input.filter.projectId)
  const items = sessions
    .map((session) => buildItem(
      session,
      projectsById,
      input.runs,
      bindingsBySessionId,
      childrenByParent.get(session.id) ?? [],
      session.taskSlug ? input.specNodesBySlug?.get(session.taskSlug) : undefined,
      fallbackModel,
      session.taskSlug ? input.expertIdsBySlug?.get(session.taskSlug) : undefined,
    ))
    .sort((left, right) => right.session.updatedAt - left.session.updatedAt || left.id.localeCompare(right.id))

  return { boardItems: items, listItems: items }
}
