/**
 * Code 侧边栏会话列表筛选/分组/排序偏好 Atoms
 *
 * 持久化到 ~/.myyoda/settings.json 的 `sessionListPreference` 字段
 * （遵循"配置文件优于 localStorage"约束，与 sidebar-module-atoms.ts 同一套模式）。
 * 只影响 Project 模式的会话列表——Chat 模式的归档切换继续用独立的 sidebarViewModeAtom。
 */

import { atom } from 'jotai'
import type { SessionListPreference } from '@myyoda/shared'

const DEFAULT_PREFERENCE: SessionListPreference = { status: 'active', groupBy: 'date', sortBy: 'recency' }

/** 原始值 atom：仅供启动时从 settings.json 水合，不触发持久化写回 */
export const sessionListPreferenceValueAtom = atom<SessionListPreference>(DEFAULT_PREFERENCE)

/** 会话列表偏好（读写）；写入时同步持久化到 settings.json */
export const sessionListPreferenceAtom = atom(
  (get) => get(sessionListPreferenceValueAtom),
  (get, set, next: Partial<SessionListPreference>) => {
    const merged = { ...get(sessionListPreferenceValueAtom), ...next }
    set(sessionListPreferenceValueAtom, merged)
    window.electronAPI
      .updateSettings({ sessionListPreference: merged })
      .catch((error) => console.error('[会话列表偏好] 持久化失败:', error))
  },
)

/** 从主进程加载持久化的会话列表偏好 */
export async function initializeSessionListPreference(
  setPreference: (preference: SessionListPreference) => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setPreference(settings.sessionListPreference ?? DEFAULT_PREFERENCE)
  } catch (error) {
    console.error('[会话列表偏好] 加载失败:', error)
  }
}
