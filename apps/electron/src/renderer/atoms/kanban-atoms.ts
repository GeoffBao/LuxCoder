import { atom } from 'jotai'
import type { AgentSessionMeta } from '@luxagents/shared'
import { buildKanbanViewModel } from '@/components/app-shell/kanban/kanban-view-model'
import type { SpecNodeSummary } from '@/components/app-shell/kanban/subtask-merge'
import {
  type KanbanBoardMode,
  type KanbanItem,
  type KanbanTaskRun,
  type TeambitionBinding,
} from '@/components/app-shell/kanban/types'
import { agentModelIdAtom, agentStreamingStatesAtom } from './agent-atoms'
import { selectedProjectIdAtom, serverKanbanProjectsAtom } from './project-atoms'

/** 服务端会话快照，始终保持原始 AgentSessionMeta。 */
export const serverKanbanSessionsAtom = atom<AgentSessionMeta[]>([])
export const serverKanbanRunsAtom = atom<KanbanTaskRun[]>([])
export const serverTeambitionBindingsAtom = atom<TeambitionBinding[]>([])
/** taskSlug → DAG nodes，供卡片合并子任务行 */
export const kanbanSpecNodesAtom = atom<Map<string, SpecNodeSummary[]>>(new Map())

/** 仅保存尚未得到服务端确认的列覆盖，避免污染服务端快照。 */
interface OptimisticKanbanColumn {
  columnId: string
  sequence: number
}

export const optimisticKanbanColumnsAtom = atom<Map<string, OptimisticKanbanColumn>>(new Map())
const kanbanMoveSequenceAtom = atom(0)
const latestKanbanMoveSequenceAtom = atom<Map<string, number>>(new Map())

export const boardModeAtom = atom<KanbanBoardMode>('board')

export interface KanbanNotification {
  level: 'error'
  message: string
}

/** 由容器转为 Sonner toast；状态层只描述通知，便于测试与复用。 */
export const kanbanNotificationsAtom = atom<KanbanNotification[]>([])

export const kanbanItemsAtom = atom<KanbanItem[]>((get) => {
  const optimisticColumns = get(optimisticKanbanColumnsAtom)
  const streamStates = get(agentStreamingStatesAtom)
  const sessions = get(serverKanbanSessionsAtom).map((session) => {
    const optimisticColumn = optimisticColumns.get(session.id)
    return optimisticColumn === undefined ? session : { ...session, kanbanColumn: optimisticColumn.columnId }
  })
  const items = buildKanbanViewModel({
    projects: get(serverKanbanProjectsAtom),
    sessions,
    runs: get(serverKanbanRunsAtom),
    bindings: get(serverTeambitionBindingsAtom),
    filter: { projectId: get(selectedProjectIdAtom) },
    specNodesBySlug: get(kanbanSpecNodesAtom),
    fallbackModel: get(agentModelIdAtom) ?? '',
  }).listItems

  // 流式 running 覆盖到卡片：编排器自身或任一子任务 session 在跑都算 live
  return items.map((item) => {
    const childIds = item.subtasks
      .map((subtask) => subtask.sessionId)
      .filter((id): id is string => Boolean(id))
    const isProcessing = Boolean(streamStates.get(item.id)?.running)
      || childIds.some((id) => streamStates.get(id)?.running)
      || item.subtasks.some((subtask) => subtask.runState === 'running')
    if (!isProcessing) return item
    return {
      ...item,
      isProcessing: true,
      subtasks: item.subtasks.map((subtask) => {
        if (!subtask.sessionId || !streamStates.get(subtask.sessionId)?.running) return subtask
        return { ...subtask, runState: 'running' as const }
      }),
    }
  })
})

export interface MoveCardInput {
  sessionId: string
  columnId: string
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '移动看板卡片失败'
}

/**
 * 先更新本地列，再通过 nested preload bridge 持久化。所有异步回写都必须属于该卡片的最新请求。
 */
export const moveCardAtom = atom(
  null,
  async (get, set, input: MoveCardInput): Promise<void> => {
    const currentOptimisticColumns = get(optimisticKanbanColumnsAtom)
    const sequence = get(kanbanMoveSequenceAtom) + 1
    set(kanbanMoveSequenceAtom, sequence)
    set(latestKanbanMoveSequenceAtom, (sequences) => {
      const next = new Map(sequences)
      next.set(input.sessionId, sequence)
      return next
    })
    const nextOptimisticColumns = new Map(currentOptimisticColumns)
    nextOptimisticColumns.set(input.sessionId, { columnId: input.columnId, sequence })
    set(optimisticKanbanColumnsAtom, nextOptimisticColumns)

    try {
      const updated = await window.electronAPI.sessions.move(input.sessionId, input.columnId)
      if (get(latestKanbanMoveSequenceAtom).get(input.sessionId) !== sequence) return
      set(serverKanbanSessionsAtom, (sessions) =>
        sessions.map((item) => item.id === input.sessionId ? updated : item),
      )
      set(optimisticKanbanColumnsAtom, (columns) => {
        if (columns.get(input.sessionId)?.sequence !== sequence) return columns
        const next = new Map(columns)
        next.delete(input.sessionId)
        return next
      })
    } catch (cause) {
      if (get(latestKanbanMoveSequenceAtom).get(input.sessionId) !== sequence) return
      set(optimisticKanbanColumnsAtom, (columns) => {
        if (columns.get(input.sessionId)?.sequence !== sequence) return columns
        const next = new Map(columns)
        next.delete(input.sessionId)
        return next
      })
      set(kanbanNotificationsAtom, (notifications) => [
        ...notifications,
        { level: 'error', message: toErrorMessage(cause) },
      ])
    }
  },
)
