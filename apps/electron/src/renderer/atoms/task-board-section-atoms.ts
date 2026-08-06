import { atom } from 'jotai'

/** 任务看板页面内的区段 tab：TB 问题看板（主） / Task 执行看板 */
export type TaskBoardSection = 'agent' | 'tb-defect'

/** 当前任务看板区段（不持久化，默认 TB 问题看板；Task 执行看板按需进入） */
export const taskBoardSectionAtom = atom<TaskBoardSection>('tb-defect')
