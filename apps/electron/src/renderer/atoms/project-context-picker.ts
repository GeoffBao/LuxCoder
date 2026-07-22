/**
 * ProjectContextPicker 流状态 — 新任务选项目、⌘O 聚焦浏览
 */

import { atom } from 'jotai'

/** 新任务流：先经项目选择器，选定后再开 TaskEditor */
export const newTaskProjectFlowOpenAtom = atom(false)

/**
 * 递增请求令牌：ProjectContextPicker 监听到变化后执行「浏览…」。
 * GlobalShortcuts ⌘O / 侧栏空态均可触发。
 */
export const projectContextBrowseRequestAtom = atom(0)

/** 项目投影是否显示已归档项目 */
export const showArchivedProjectsAtom = atom(false)
