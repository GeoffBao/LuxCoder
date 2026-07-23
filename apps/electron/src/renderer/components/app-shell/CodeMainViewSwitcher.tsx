/**
 * CodeMainViewSwitcher / CodeMainViewSwitchControl - Code（agent）模式主区视图切换
 *
 * CodeMainViewSwitchControl 是纯控件（会话｜看板 segmented），两处复用：
 * 1. 左侧栏「最近会话｜项目」行嵌入版（compact，会话视图场景，见 LeftSidebar.tsx）
 * 2. 本文件的 CodeMainViewSwitcher：看板视图自己的顶部整行版
 *    （看板视图下侧栏可能折叠，需要自带切换入口保证能切回，
 *    对应 craft-agents-oss 里 Board 模式下 header 自带一份切换控件的做法）
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { LayoutDashboard, MessageSquare } from 'lucide-react'
import { codeMainViewAtom, workViewAtom } from '@/atoms/project-atoms'
import type { CodeMainView } from '@/atoms/project-atoms'
import { cn } from '@/lib/utils'

interface SwitcherOption {
  id: CodeMainView
  label: string
  icon: React.ReactNode
}

const OPTIONS: SwitcherOption[] = [
  { id: 'session', label: '会话', icon: <MessageSquare size={12} /> },
  { id: 'work', label: '看板', icon: <LayoutDashboard size={12} /> },
]

export interface CodeMainViewSwitchControlProps {
  /** 紧凑态：只显示图标，不显示文字（嵌入侧栏行内时用） */
  compact?: boolean
  className?: string
}

export function CodeMainViewSwitchControl({ compact, className }: CodeMainViewSwitchControlProps): React.ReactElement {
  const [mainView, setMainView] = useAtom(codeMainViewAtom)
  const setWorkView = useSetAtom(workViewAtom)

  const handleSelect = (id: CodeMainView): void => {
    // 切到 Work 时固定先看板，避免停留在上次「项目详情」造成的认知错位
    if (id === 'work') setWorkView('board')
    setMainView(id)
  }

  return (
    <div className={cn('view-switcher-control titlebar-no-drag flex items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5', className)}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mainView === option.id}
          aria-label={option.label}
          title={compact ? option.label : undefined}
          onClick={() => handleSelect(option.id)}
          className={cn(
            'view-switcher-option flex items-center rounded-lg font-medium transition-colors',
            compact ? 'h-6 w-6 justify-center' : 'h-7 gap-1.5 px-3 text-[12px]',
            mainView === option.id
              ? 'view-switcher-option-active bg-background text-foreground'
              : 'text-foreground/50 hover:text-foreground/80',
          )}
        >
          {option.icon}
          {!compact && option.label}
        </button>
      ))}
    </div>
  )
}

/** 看板视图自己顶部的整行版本（会话视图场景改用侧栏内嵌的 CodeMainViewSwitchControl） */
export function CodeMainViewSwitcher(): React.ReactElement {
  return (
    <div className="primary-view-switcher titlebar-drag-region flex h-[34px] flex-shrink-0 items-center px-3.5">
      <CodeMainViewSwitchControl />
    </div>
  )
}
