import { atom } from 'jotai'
import type { AgentSessionMeta } from '@luxagents/shared'
import { buildKanbanViewModel } from '@/components/app-shell/kanban/kanban-view-model'
import {
  type KanbanBoardMode,
  type KanbanItem,
  type KanbanTaskRun,
  type TeambitionBinding,
} from '@/components/app-shell/kanban/types'
import { selectedProjectIdAtom, serverKanbanProjectsAtom } from './project-atoms'
import type { LoadedProject } from '@luxagents/shared/projects/types'

/** 旧 WorkBoardView 的兼容类型；Task 10 清理 flat API 后一并移除。 */
export type KanbanColumnId = 'todo' | 'in-progress' | 'done'

/** 旧 WorkBoardView 的兼容卡片；新看板使用 kanbanItemsAtom。 */
export interface KanbanTaskCard {
  slug: string
  title: string
  goal: string
  column: KanbanColumnId
  runId?: string
}

/** 服务端会话快照，始终保持原始 AgentSessionMeta。 */
export const serverKanbanSessionsAtom = atom<AgentSessionMeta[]>([])
export const serverKanbanRunsAtom = atom<KanbanTaskRun[]>([])
export const serverTeambitionBindingsAtom = atom<TeambitionBinding[]>([])

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
  const sessions = get(serverKanbanSessionsAtom).map((session) => {
    const optimisticColumn = optimisticColumns.get(session.id)
    return optimisticColumn === undefined ? session : { ...session, kanbanColumn: optimisticColumn.columnId }
  })
  return buildKanbanViewModel({
    projects: get(serverKanbanProjectsAtom),
    sessions,
    runs: get(serverKanbanRunsAtom),
    bindings: get(serverTeambitionBindingsAtom),
    filter: { projectId: get(selectedProjectIdAtom) },
  }).listItems
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

// ===== 旧 WorkBoardView 兼容状态 =====

export const kanbanTasksAtom = atom<KanbanTaskCard[]>([])
export const kanbanProjectsAtom = atom<LoadedProject[]>([])
export const kanbanLoadingAtom = atom(false)
export const kanbanErrorAtom = atom<string | null>(null)
