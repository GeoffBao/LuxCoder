/**
 * ReleaseNotesPopover - 「更新日志与帮助」入口（参考 Codex 的 "What's new" 弹层）
 *
 * 独立的「?」图标按钮，比纯文本版本号更显眼；点击弹出：
 * - 最近几条更新日志（标题摘要 + 版本号），点击任意一条打开完整更新日志对话框
 * - 快捷链接：键盘快捷键地图
 *
 * 弹层展开即视为「已读」（对齐 Codex：打开列表就清红点，不需要再点进详情）；
 * 完整更新日志内容仍由 ReleaseNotesDialog 承载，此组件只负责摘要与入口。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { HelpCircle, Keyboard, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { extractReleaseHeadline, type ReleaseNote } from '@yoda/shared'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ReleaseNotesDialog } from './ReleaseNotesDialog'
import { shortcutGuideOpenAtom } from '@/atoms/shortcut-guide'

export interface ReleaseNotesPopoverProps {
  version: string
  unseen: boolean
  recentNotes: ReleaseNote[]
  onMarkSeen: () => void
  /** 触发按钮的额外 className（尺寸/圆角由调用方按折叠/展开场景控制） */
  triggerClassName: string
  tooltipSide: 'right' | 'top'
  side: 'right' | 'top'
  align: 'start' | 'center' | 'end'
}

export function ReleaseNotesPopover({
  version,
  unseen,
  recentNotes,
  onMarkSeen,
  triggerClassName,
  tooltipSide,
  side,
  align,
}: ReleaseNotesPopoverProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [fullDialogOpen, setFullDialogOpen] = React.useState(false)
  const setShortcutGuideOpen = useSetAtom(shortcutGuideOpenAtom)

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (next) onMarkSeen()
  }

  const handleOpenFullChangelog = (): void => {
    setOpen(false)
    setFullDialogOpen(true)
  }

  const handleOpenShortcutGuide = (): void => {
    setOpen(false)
    setShortcutGuideOpen(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <Tooltip open={open ? false : undefined}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="更新日志与帮助"
                className={cn('relative', triggerClassName)}
              >
                <HelpCircle size={16} strokeWidth={2} />
                {unseen && (
                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>更新日志与帮助 · 当前 v{version}</TooltipContent>
        </Tooltip>
        <PopoverContent side={side} align={align} className="w-72 p-0">
          <div className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">最新动态</div>
          <div className="px-1.5 pb-1.5">
            {recentNotes.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">暂无更新日志</p>
            ) : (
              recentNotes.map((note) => {
                const headline = extractReleaseHeadline(note.content) || `v${note.version} 更新`
                return (
                  <button
                    key={note.version}
                    type="button"
                    onClick={handleOpenFullChangelog}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <span className="flex-1 min-w-0 truncate">{headline}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      v{note.version}
                    </span>
                  </button>
                )
              })
            )}
            <button
              type="button"
              onClick={handleOpenFullChangelog}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
            >
              查看完整更新日志
              <ChevronRight size={14} className="shrink-0" />
            </button>
          </div>
          <div className="border-t border-border/60 p-1.5">
            <button
              type="button"
              onClick={handleOpenShortcutGuide}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <Keyboard size={15} className="shrink-0 text-muted-foreground" />
              键盘快捷键
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <ReleaseNotesDialog open={fullDialogOpen} onOpenChange={setFullDialogOpen} />
    </>
  )
}
