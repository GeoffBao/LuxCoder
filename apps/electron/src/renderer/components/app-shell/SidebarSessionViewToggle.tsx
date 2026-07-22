/**
 * SidebarSessionViewToggle — 「最近会话｜项目」切换
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { cn } from '@/lib/utils'
import {
  sidebarSessionViewModeAtom,
  type SidebarSessionViewMode,
} from '@/atoms/sidebar-session-view'

const OPTIONS: { id: SidebarSessionViewMode; label: string }[] = [
  { id: 'recent', label: '最近会话' },
  { id: 'projects', label: '项目' },
]

export function SidebarSessionViewToggle(): React.ReactElement {
  const [mode, setMode] = useAtom(sidebarSessionViewModeAtom)

  return (
    <div
      className="flex items-center gap-0.5 rounded-[10px] bg-foreground/[0.04] p-0.5"
      role="tablist"
      aria-label="会话视图"
    >
      {OPTIONS.map((option) => {
        const active = mode === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setMode(option.id)}
            className={cn(
              'h-7 flex-1 rounded-[8px] px-2 text-[12px] font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/45 hover:text-foreground/70',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
