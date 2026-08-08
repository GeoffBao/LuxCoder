/**
 * ReleaseNotesDialog - 通用「更新日志」对话框
 *
 * 展示本地化版本历史的合并 Markdown（完全离线）。空态页、左侧边栏版本号入口
 * 共用。打开时自动将最新版本标记为已读（清除未读红点）。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ReleaseNoteMarkdown } from './ReleaseNoteMarkdown'
import { lastSeenReleaseVersionAtom } from '@/atoms/release-notes-atoms'

export interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReleaseNotesDialog({
  open,
  onOpenChange,
}: ReleaseNotesDialogProps): React.ReactElement {
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const setLastSeen = useSetAtom(lastSeenReleaseVersionAtom)

  // 打开时加载合并版本历史，并标记最新版本为已读
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setContent(null)
    setError(null)
    window.electronAPI.getCombinedReleaseNotes().then((text) => {
      if (cancelled) return
      setContent(text)
    }).catch((err) => {
      console.error('[更新日志] 加载失败:', err)
      if (!cancelled) setError('加载失败，请稍后重试')
    })
    // 标记已读最新版本
    window.electronAPI.getLatestReleaseVersion().then((latest) => {
      if (latest) setLastSeen(latest)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, setLastSeen])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>更新日志</DialogTitle>
          <DialogDescription>Yoda 各版本更新内容</DialogDescription>
        </DialogHeader>
        {content === null && !error ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载更新日志...
          </p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : content ? (
          <ReleaseNoteMarkdown content={content} />
        ) : (
          <p className="text-sm text-muted-foreground">暂无更新日志</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
