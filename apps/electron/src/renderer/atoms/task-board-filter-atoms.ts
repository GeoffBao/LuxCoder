import { atom } from 'jotai'
import type { TaskWorkflow } from '@luxcoder/shared/tasks'

/** Workflow filter: 'all' means no filter. */
export const taskBoardWorkflowFilterAtom = atom<'all' | TaskWorkflow>('all')

/** Selected labels; empty = no filter. */
export const taskBoardLabelFilterAtom = atom<string[]>([])

/** Include Tasks without any labels when labels are selected. */
export const taskBoardIncludeUnlabeledAtom = atom<boolean>(true)

/** Count of active filters for badge display. */
export const taskBoardFilterCountAtom = atom<number>((get) => {
  let count = 0
  if (get(taskBoardWorkflowFilterAtom) !== 'all') count++
  if (get(taskBoardLabelFilterAtom).length > 0) count++
  return count
})

/** Clear all task board filters. */
export const clearTaskBoardFiltersAtom = atom(null, (_get, set) => {
  set(taskBoardWorkflowFilterAtom, 'all')
  set(taskBoardLabelFilterAtom, [])
  set(taskBoardIncludeUnlabeledAtom, true)
})
