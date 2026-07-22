/**
 * CodeMainViewSwitcher - Code（agent）模式主区视图切换条
 *
 * 「会话 | 看板」segmented 切换，渲染在主区顶部（会话视图位于 TabBar 之上，
 * Work 视图位于 WorkBoardView 之上），让用户不依赖左栏也能切换主区视图。
 * 看板 / 项目详情的子视图切换由 WorkBoardView 自带工具条负责。
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

export function CodeMainViewSwitcher(): React.ReactElement {
  const [mainView, setMainView] = useAtom(codeMainViewAtom)
  const setWorkView = useSetAtom(workViewAtom)

  const handleSelect = (id: CodeMainView): void => {
    // 切到 Work 时固定先看板，避免停留在上次「项目详情」造成的认知错位
    if (id === 'work') setWorkView('board')
    setMainView(id)
  }

  return (
    <div className="primary-view-switcher titlebar-drag-region flex h-[34px] flex-shrink-0 items-center px-3.5">
      <div className="view-switcher-control titlebar-no-drag flex items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={mainView === option.id}
            onClick={() => handleSelect(option.id)}
            className={cn(
              'view-switcher-option flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors',
              mainView === option.id
                ? 'view-switcher-option-active bg-background text-foreground'
                : 'text-foreground/50 hover:text-foreground/80',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
