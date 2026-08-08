import { atom } from 'jotai'
import type { TaskWorkflow } from '@yoda/shared/tasks'

/** Workflow 筛选：'all' 表示不筛选。 */
export const taskBoardWorkflowFilterAtom = atom<'all' | TaskWorkflow>('all')

/** 是否在看板中展示已归档 Task（默认关闭；开启后已归档卡片灰显，可取消归档）。 */
export const taskBoardShowArchivedAtom = atom<boolean>(false)

/** 来源筛选：'all' 表示不筛选。manual=手动创建，teambition=TB 同步，other=其他来源。 */
export type TaskBoardSourceFilter = 'all' | 'manual' | 'teambition' | 'other'
export const taskBoardSourceFilterAtom = atom<TaskBoardSourceFilter>('all')

/** 选中的 Labels；空数组本身不构成筛选。 */
export const taskBoardLabelFilterAtom = atom<string[]>([])

/** 纳入无标签 Task；未选择 Label 时表示仅看无标签。 */
export const taskBoardIncludeUnlabeledAtom = atom<boolean>(false)

/** 供角标展示的活跃 facet 数量。 */
export const taskBoardFilterCountAtom = atom<number>((get) => {
  let count = 0
  if (get(taskBoardWorkflowFilterAtom) !== 'all') count++
  if (get(taskBoardSourceFilterAtom) !== 'all') count++
  if (get(taskBoardLabelFilterAtom).length > 0 || get(taskBoardIncludeUnlabeledAtom)) count++
  if (get(taskBoardShowArchivedAtom)) count++
  return count
})

/** 清除全部 Task 看板筛选。 */
export const clearTaskBoardFiltersAtom = atom(null, (_get, set) => {
  set(taskBoardWorkflowFilterAtom, 'all')
  set(taskBoardSourceFilterAtom, 'all')
  set(taskBoardLabelFilterAtom, [])
  set(taskBoardIncludeUnlabeledAtom, false)
  set(taskBoardShowArchivedAtom, false)
})
