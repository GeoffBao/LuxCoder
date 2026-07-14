import { atom } from 'jotai'
import type { KanbanProject } from '@/components/app-shell/kanban/types'

/** 服务端项目快照；渲染状态不写入项目配置。 */
export const serverKanbanProjectsAtom = atom<KanbanProject[]>([])

/** 当前项目筛选；null 表示所有项目与 Inbox。 */
export const selectedProjectIdAtom = atom<string | null>(null)

export const selectedKanbanProjectAtom = atom((get) => {
  const selectedProjectId = get(selectedProjectIdAtom)
  if (!selectedProjectId) return null
  return get(serverKanbanProjectsAtom).find((project) => project.id === selectedProjectId) ?? null
})
