/**
 * Release Notes 未读状态 atom
 *
 * 记录用户最后一次查看的版本号，用于「更新日志」入口的未读红点提示。
 * 持久化到 localStorage（key: whats-new-last-seen-version）。
 * 完全本地判定，不依赖网络。
 */

import { atom } from 'jotai'

const STORAGE_KEY = 'whats-new-last-seen-version'

/** 内部存储值（不持久化，纯内存态） */
const baseSeenVersionAtom = atom<string | null>(null)

/**
 * 上次已读的版本号（可写）。
 * 写入时同步到 localStorage，并更新内存态。
 */
export const lastSeenReleaseVersionAtom = atom<string | null, [string | null], void>(
  (get) => {
    const cached = get(baseSeenVersionAtom)
    if (cached !== null) return cached
    // 首次读取：从 localStorage 初始化
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  (_get, set, version: string | null) => {
    try {
      if (version) localStorage.setItem(STORAGE_KEY, version)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage 不可用（隐私模式等）时静默忽略
    }
    set(baseSeenVersionAtom, version)
  }
)
