/**
 * 侧边栏状态 Atoms
 *
 * 管理侧边栏视图模式（活跃 / 已归档）。
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

/** 侧边栏视图模式 */
export type SidebarViewMode = 'active' | 'archived'

/** 侧边栏视图模式（active = 显示活跃对话，archived = 显示已归档对话） */
export const sidebarViewModeAtom = atom<SidebarViewMode>('active')

/** 项目列表高度（px），用户可拖拽调整，持久化到 localStorage */
export const projectListHeightAtom = atomWithStorage<number>(
  'myyoda-workspace-list-height',
  120,
)

/** 左侧边栏最小宽度（px）；AppShell 拖拽调整用于夹取，LeftSidebar 渲染兜底用于保持一致 */
export const MIN_LEFT_SIDEBAR_WIDTH = 240

/** 左侧边栏宽度（px），用户可拖拽调整，持久化到 localStorage */
export const leftSidebarWidthAtom = atomWithStorage<number>(
  'myyoda-left-sidebar-width',
  260,
)
