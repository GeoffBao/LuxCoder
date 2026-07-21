/**
 * 左栏模块契约 - 纯逻辑（视图模型）
 *
 * 与 UI 无关的格式化 / key 生成函数，供 SidebarModule、
 * atoms 与测试复用。
 */

import type { AppMode } from '@/atoms/app-mode'

/** 模块计数徽标格式化：>99 显示 "99+" */
export function formatSidebarModuleCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/**
 * 折叠态持久化 key：`${mode}:${moduleId}`（如 `agent:projects`）
 *
 * 同一模块在不同模式下独立记忆折叠态。
 */
export function sidebarModuleCollapseKey(mode: AppMode, moduleId: string): string {
  return `${mode}:${moduleId}`
}
