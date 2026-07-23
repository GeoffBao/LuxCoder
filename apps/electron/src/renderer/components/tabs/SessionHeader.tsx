/**
 * SessionHeader — Chat / Agent 会话共用的标题栏
 *
 * 显示会话标题（可点击编辑），右侧可选 actions 插槽由调用方传入
 * （Chat 传系统提示词选择器/置顶/并排模式，Agent 目前不传）。
 */

import * as React from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { detectIsWindows, WINDOW_CONTROLS_INSET_RIGHT } from '@/lib/platform'
import { cn } from '@/lib/utils'

export interface SessionHeaderProps {
  /** 当前标题 */
  title: string
  /** 保存新标题；title 为空或与当前值相同时不会被调用 */
  onRename: (newTitle: string) => Promise<void> | void
  /** 右侧操作区，不传则不渲染 */
  actions?: React.ReactNode
  /** 编辑态输入框最大长度 */
  maxLength?: number
}

export function SessionHeader({
  title,
  onRename,
  actions,
  maxLength = 100,
}: SessionHeaderProps): React.ReactElement {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  /** 进入编辑模式 */
  const startEdit = (): void => {
    setEditTitle(title)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** 保存标题：空值或未变化则跳过持久化，直接退出编辑态 */
  const saveTitle = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === title) {
      setEditing(false)
      return
    }
    try {
      await onRename(trimmed)
    } catch (error) {
      console.error('[SessionHeader] 更新标题失败:', error)
    } finally {
      setEditing(false)
    }
  }

  /** 键盘事件 */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="session-header-polished relative z-[51] flex items-center gap-2 px-5 h-[48px]">
      {/* 拖拽层覆盖整行（Windows 避开右上角 WindowControls ~126px），编辑/标题按钮内部已自带 titlebar-no-drag。 */}
      <div className={cn("absolute inset-0 titlebar-drag-region pointer-events-none", isWindows && WINDOW_CONTROLS_INSET_RIGHT)} />
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent text-sm font-medium border-b border-primary/50 outline-none px-0 py-0.5 min-w-0"
            maxLength={maxLength}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveTitle}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startEdit}
            className="titlebar-no-drag p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="编辑标题"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}

      {actions && (
        <div className="flex items-center gap-1 titlebar-no-drag ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
