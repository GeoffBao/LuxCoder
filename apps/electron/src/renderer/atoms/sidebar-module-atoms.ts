/**
 * 左栏模块折叠态 Atoms
 *
 * 管理左栏各模块（项目等）的折叠状态，按 `${mode}:${moduleId}` 存储，
 * 持久化到 ~/.luxagents/settings.json 的 `sidebarModuleCollapsed` 字段
 * （遵循"配置文件优于 localStorage"约束）。
 */

import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

/** 折叠态映射（key = `${mode}:${moduleId}`，如 `agent:projects`） */
export const sidebarModuleCollapsedMapAtom = atom<Record<string, boolean>>({})

/**
 * 单个模块的折叠态（读写）
 *
 * key 由 sidebarModuleCollapseKey(mode, moduleId) 生成；
 * key 集合固定且极少（各模式 × 模块），atomFamily 的强引用缓存无泄漏风险。
 * 写入时同步持久化到 settings.json（直接写，与 theme 持久化模式一致）。
 */
export const sidebarModuleCollapsedAtomFamily = atomFamily((key: string) =>
  atom(
    (get) => get(sidebarModuleCollapsedMapAtom)[key] ?? false,
    (get, set, collapsed: boolean) => {
      const next = { ...get(sidebarModuleCollapsedMapAtom), [key]: collapsed }
      set(sidebarModuleCollapsedMapAtom, next)
      window.electronAPI
        .updateSettings({ sidebarModuleCollapsed: next })
        .catch((error) => console.error('[左栏模块] 折叠态持久化失败:', error))
    },
  ),
)

/**
 * 初始化左栏模块折叠态
 *
 * 从主进程加载持久化设置并写入 atom。
 */
export async function initializeSidebarModuleCollapsed(
  setMap: (map: Record<string, boolean>) => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setMap(settings.sidebarModuleCollapsed ?? {})
  } catch (error) {
    console.error('[左栏模块] 折叠态加载失败:', error)
  }
}
