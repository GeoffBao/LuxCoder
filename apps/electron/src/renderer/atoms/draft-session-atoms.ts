/**
 * Draft Session Atoms
 *
 * 追踪"草稿"会话 ID。草稿会话是真实的会话（拥有有效 ID），
 * 但尚未发送任何消息，因此不在侧边栏中显示。
 * 当用户发送第一条消息后，会话从 draft 集合中移除，出现在侧边栏。
 *
 * 持久化到 localStorage（myyoda-draft-sessions），
 * 避免应用重启后空草稿会话重新出现在侧边栏列表。
 */

import { atomWithStorage } from 'jotai/utils'

/** Set ↔ JSON 序列化适配器 */
const draftSetStorage = {
  getItem: (key: string, initialValue: Set<string>): Set<string> => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return initialValue
      const arr: string[] = JSON.parse(stored)
      if (!Array.isArray(arr)) return initialValue
      return new Set(arr)
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: Set<string>): void => {
    localStorage.setItem(key, JSON.stringify([...value]))
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key)
  },
}

/** 草稿会话 ID 集合（Chat + Agent 共用）；持久化到 localStorage */
export const draftSessionIdsAtom = atomWithStorage<Set<string>>(
  'myyoda-draft-sessions',
  new Set<string>(),
  draftSetStorage,
)
