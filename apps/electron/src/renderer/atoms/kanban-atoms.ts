import { atom } from 'jotai'
import type { LoadedProject } from '@luxagents/shared/projects/types'

export type KanbanColumnId = 'todo' | 'in-progress' | 'done'

export interface KanbanTaskCard {
  slug: string
  title: string
  goal: string
  column: KanbanColumnId
  runId?: string
}

export const kanbanTasksAtom = atom<KanbanTaskCard[]>([])
export const kanbanProjectsAtom = atom<LoadedProject[]>([])
export const kanbanLoadingAtom = atom(false)
export const kanbanErrorAtom = atom<string | null>(null)
