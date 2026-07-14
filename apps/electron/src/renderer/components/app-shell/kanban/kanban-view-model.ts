import type { AgentSessionMeta } from '@luxagents/shared'
import {
  INBOX_COLUMN_ID,
  type KanbanFilter,
  type KanbanItem,
  type KanbanProject,
  type KanbanTaskRun,
  type KanbanViewModel,
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
}

function findTaskRun(session: AgentSessionMeta, runs: KanbanTaskRun[]): KanbanTaskRun | undefined {
  if (!session.taskSlug) return undefined
  return runs.find((run) =>
    run.taskSlug === session.taskSlug && (session.taskRunId === undefined || run.runId === session.taskRunId),
  )
}

function buildItem(
  session: AgentSessionMeta,
  projectsById: Map<string, KanbanProject>,
  runs: KanbanTaskRun[],
  bindingsBySessionId: Map<string, TeambitionBinding>,
): KanbanItem {
  const run = findTaskRun(session, runs)
  const totalNodes = session.taskNodeCount ?? (run ? Object.keys(run.nodeStates).length : 0)
  const completedNodes = run
    ? Object.values(run.nodeStates).filter((state) => state === 'done').length
    : 0
  const binding = bindingsBySessionId.get(session.id)

  return {
    id: session.id,
    title: session.title,
    columnId: session.kanbanColumn ?? INBOX_COLUMN_ID,
    session,
    project: session.projectId ? projectsById.get(session.projectId) ?? null : null,
    ...(run && totalNodes > 0 ? { taskRun: { completedNodes, totalNodes } } : {}),
    ...(binding
      ? {
          teambition: {
            taskId: binding.taskId,
            ...(binding.title ? { title: binding.title } : {}),
            ...(binding.status ? { status: binding.status } : {}),
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
  const sessions = input.filter.projectId === null
    ? input.sessions
    : input.sessions.filter((session) => session.projectId === input.filter.projectId)
  const items = sessions
    .map((session) => buildItem(session, projectsById, input.runs, bindingsBySessionId))
    .sort((left, right) => right.session.updatedAt - left.session.updatedAt || left.id.localeCompare(right.id))

  return { boardItems: items, listItems: items }
}
