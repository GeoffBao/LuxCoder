import { atom } from 'jotai'
import type { AgentSessionMeta } from '@luxagents/shared'
import { buildKanbanViewModel } from '@/components/app-shell/kanban/kanban-view-model'
import {
  INBOX_COLUMN_ID,
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
export const optimisticKanbanColumnsAtom = atom<Map<string, string>>(new Map())

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
    const columnId = optimisticColumns.get(session.id)
    return columnId === undefined ? session : { ...session, kanbanColumn: columnId }
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

function getCurrentColumn(session: AgentSessionMeta | undefined, optimisticColumn: string | undefined): string {
  return optimisticColumn ?? session?.kanbanColumn ?? INBOX_COLUMN_ID
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '移动看板卡片失败'
}

/**
 * 先更新本地列，再通过 nested preload bridge 持久化。失败时仅回滚本次仍生效的覆盖。
 */
export const moveCardAtom = atom(
  null,
  async (get, set, input: MoveCardInput): Promise<void> => {
    const session = get(serverKanbanSessionsAtom).find((item) => item.id === input.sessionId)
    const currentOptimisticColumns = get(optimisticKanbanColumnsAtom)
    const hadOptimisticColumn = currentOptimisticColumns.has(input.sessionId)
    const previousColumn = getCurrentColumn(session, currentOptimisticColumns.get(input.sessionId))
    const nextOptimisticColumns = new Map(currentOptimisticColumns)
    nextOptimisticColumns.set(input.sessionId, input.columnId)
    set(optimisticKanbanColumnsAtom, nextOptimisticColumns)

    try {
      const updated = await window.electronAPI.sessions.move(input.sessionId, input.columnId)
      set(serverKanbanSessionsAtom, (sessions) =>
        sessions.map((item) => item.id === input.sessionId ? updated : item),
      )
      set(optimisticKanbanColumnsAtom, (columns) => {
        if (columns.get(input.sessionId) !== input.columnId) return columns
        const next = new Map(columns)
        next.delete(input.sessionId)
        return next
      })
    } catch (cause) {
      set(optimisticKanbanColumnsAtom, (columns) => {
        if (columns.get(input.sessionId) !== input.columnId) return columns
        const next = new Map(columns)
        if (hadOptimisticColumn) next.set(input.sessionId, previousColumn)
        else next.delete(input.sessionId)
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
