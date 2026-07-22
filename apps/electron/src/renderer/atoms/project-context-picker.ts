/**
 * ProjectContextPicker 流状态 — 新任务选项目、⌘O 聚焦浏览
 */

import { atom } from 'jotai'

/** 新任务流：先经项目选择器，选定后再开 TaskEditor */
export const newTaskProjectFlowOpenAtom = atom(false)

/**
 * 递增请求令牌：已挂载的 ProjectContextPicker 监听到「相对自身基线」的递增后执行「浏览…」。
 * 挂载时只同步基线、不回放历史值（避免点新会话/新任务误弹系统选目录）。
 * 若需先打开对话框再浏览（⌘O 无 Draft / 项目菜单），应在 host 挂载后再递增。
 */
export const projectContextBrowseRequestAtom = atom(0)

/** 项目投影是否显示已归档项目 */
export const showArchivedProjectsAtom = atom(false)
