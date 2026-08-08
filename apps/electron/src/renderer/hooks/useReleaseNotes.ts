/**
 * useReleaseNotes - 版本号 + 最近更新日志 + 未读状态
 *
 * 供左侧边栏「更新日志与帮助」入口（ReleaseNotesPopover）使用：
 * - version：当前应用版本（vite define 注入）
 * - recentNotes：最近 3 条本地版本历史（semver 降序，含 markdown 正文）
 * - unseen：最新版本号与本地已读记录不一致时为 true（未读红点）
 * - markSeen：将最新版本标记为已读（清除未读红点）
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { ReleaseNote } from '@myyoda/shared'
import { lastSeenReleaseVersionAtom } from '@/atoms/release-notes-atoms'

/** 从 package.json 构建时由 Vite define 注入 */
declare const __APP_VERSION__: string

/** 「最新动态」列表展示条数 */
const RECENT_NOTES_LIMIT = 3

export interface UseReleaseNotesResult {
  /** 当前应用版本号（如 "0.7.1"） */
  version: string
  /** 是否有未读的新版本更新日志 */
  unseen: boolean
  /** 最近几条版本历史（semver 降序） */
  recentNotes: ReleaseNote[]
  /** 将最新版本标记为已读 */
  markSeen: () => void
}

export function useReleaseNotes(): UseReleaseNotesResult {
  const lastSeen = useAtomValue(lastSeenReleaseVersionAtom)
  const setLastSeen = useSetAtom(lastSeenReleaseVersionAtom)
  const [recentNotes, setRecentNotes] = React.useState<ReleaseNote[]>([])

  React.useEffect(() => {
    let cancelled = false
    window.electronAPI.listReleaseNotes()
      .then((list) => { if (!cancelled) setRecentNotes(list.slice(0, RECENT_NOTES_LIMIT)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const version = __APP_VERSION__ ?? ''
  const latestVersion = recentNotes[0]?.version
  const unseen = !!latestVersion && lastSeen !== latestVersion

  const markSeen = React.useCallback((): void => {
    if (latestVersion) setLastSeen(latestVersion)
  }, [latestVersion, setLastSeen])

  return { version, unseen, recentNotes, markSeen }
}
