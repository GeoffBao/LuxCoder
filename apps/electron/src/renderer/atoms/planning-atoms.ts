import { atom } from 'jotai'
import type { PlanningWorkspaceScope } from '@luxcoder/shared'

/**
 * 定时任务视图的「空间范围」开关：当前空间 / 全部空间。
 * 原 Task 日历（Todo / 日程 / 定时任务三合一）已收窄为只保留定时任务，
 * 其余 Todo/日程 atom 随主界面一并移除，此处仅保留列表拉取所需的范围开关。
 */
export const planningWorkspaceScopeAtom = atom<PlanningWorkspaceScope>('current')
