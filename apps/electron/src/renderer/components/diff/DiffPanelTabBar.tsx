/**
 * DiffPanelTabBar — 右侧面板顶部 Tab 栏
 *
 * 切换「会话文件」「工作区文件」和「代码改动」三个视图。最右侧有关闭按钮。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { PanelRightClose, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WINDOW_CONTROLS_INSET_RIGHT } from '@/lib/platform'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { agentDiffUnseenChangesAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import type { AgentSidePanelTab } from '@/atoms/agent-atoms'
import { interfaceVariantAtom } from '@/atoms/theme'

interface DiffPanelTabBarProps {
  activeTab: AgentSidePanelTab
  onTabChange: (tab: AgentSidePanelTab) => void
  onClose?: () => void
  onCloseChat?: () => void
  showChatTab?: boolean
  isWindows?: boolean
}

interface PreviousTabState {
  sessionId: string | null
  activeTab: AgentSidePanelTab
}

export function DiffPanelTabBar({
  activeTab,
  onTabChange,
  onClose,
  onCloseChat,
  showChatTab = false,
  isWindows = false,
}: DiffPanelTabBarProps): React.ReactElement {
  const unseenMap = useAtomValue(agentDiffUnseenChangesAtom)
  const setUnseenMap = useSetAtom(agentDiffUnseenChangesAtom)
  const currentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const interfaceVariant = useAtomValue(interfaceVariantAtom)
  const isClassic = interfaceVariant === 'classic'
  const unseenChanges = unseenMap.get(currentSessionId ?? '') ?? false
  const prevTabStateRef = React.useRef<PreviousTabState>({ sessionId: currentSessionId, activeTab })

  const clearUnseen = React.useCallback((sessionId = currentSessionId) => {
    if (!sessionId) return
    setUnseenMap((prev) => {
      if (prev.get(sessionId) === false) return prev
      const m = new Map(prev)
      m.set(sessionId, false)
      return m
    })
  }, [currentSessionId, setUnseenMap])

  // 同一会话内，从「文件改动」切走时，说明用户已经看过当前改动。
  React.useEffect(() => {
    const previous = prevTabStateRef.current
    if (previous.sessionId === currentSessionId && previous.activeTab === 'changes' && activeTab !== 'changes') {
      clearUnseen(currentSessionId)
    }
    prevTabStateRef.current = { sessionId: currentSessionId, activeTab }
  }, [activeTab, currentSessionId, clearUnseen])

  const handleChangesClick = () => {
    clearUnseen()
    if (activeTab !== 'changes') {
      onTabChange('changes')
    }
  }

  return (
    <div className={cn(
      'relative flex flex-shrink-0 tabbar-bg',
      isClassic ? 'h-[34px] items-end' : 'inspector-tabbar h-[40px] items-center px-2',
    )}>
      <div className={cn("absolute inset-0 titlebar-drag-region", isWindows && WINDOW_CONTROLS_INSET_RIGHT)} />
      <div className={cn(
        'relative flex flex-1 titlebar-no-drag',
        isClassic
          ? 'h-[34px] items-end'
          : 'inspector-tabbar-control h-7 items-stretch rounded-lg bg-foreground/[0.04] p-0.5',
      )}>
        <button
          type="button"
          onClick={() => onTabChange('session')}
          className={cn(
            isClassic
              ? 'h-[34px] flex-1 overflow-hidden whitespace-nowrap px-3 text-xs transition-colors select-none cursor-pointer'
              : 'inspector-tab flex-1 overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors select-none cursor-pointer',
            isClassic ? 'rounded-t-lg' : 'rounded-none',
            'border-t border-l border-r',
            activeTab === 'session'
              ? isClassic
                ? 'bg-content-area text-foreground border-border/50'
                : 'app-tab-active text-foreground border-border/80'
              : isClassic
                ? 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                : 'app-tab-inactive text-muted-foreground border-transparent hover:text-foreground',
          )}
        >
          会话文件
        </button>
        <button
          type="button"
          onClick={() => onTabChange('workspace')}
          className={cn(
            isClassic
              ? 'h-[34px] flex-1 overflow-hidden whitespace-nowrap px-3 text-xs transition-colors select-none cursor-pointer'
              : 'inspector-tab flex-1 overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors select-none cursor-pointer',
            isClassic ? 'rounded-t-lg' : 'rounded-none',
            'border-t border-l border-r',
            activeTab === 'workspace'
              ? isClassic
                ? 'bg-content-area text-foreground border-border/50'
                : 'app-tab-active text-foreground border-border/80'
              : isClassic
                ? 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                : 'app-tab-inactive text-muted-foreground border-transparent hover:text-foreground',
          )}
        >
          工作区文件
        </button>
        <button
          type="button"
          onClick={handleChangesClick}
          className={cn(
            isClassic
              ? 'relative h-[34px] flex-1 overflow-hidden whitespace-nowrap px-3 text-xs transition-colors select-none cursor-pointer'
              : 'inspector-tab relative flex-1 overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors select-none cursor-pointer',
            isClassic ? 'rounded-t-lg' : 'rounded-none',
            'border-t border-l border-r',
            activeTab === 'changes'
              ? isClassic
                ? 'bg-content-area text-foreground border-border/50'
                : 'app-tab-active text-foreground border-border/80'
              : isClassic
                ? 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                : 'app-tab-inactive text-muted-foreground border-transparent hover:text-foreground',
          )}
        >
          <span className="inline-flex items-center gap-1">
            {unseenChanges && activeTab !== 'changes' && (
              <span className="size-2 rounded-full bg-primary ring-1 ring-background shrink-0" />
            )}
            文件改动
          </span>
        </button>
        {showChatTab && (
          <div
            className={cn(
              isClassic
                ? 'relative h-[34px] flex-1 overflow-hidden whitespace-nowrap text-xs transition-colors select-none'
                : 'inspector-tab relative flex-1 overflow-hidden whitespace-nowrap rounded-md text-[11px] font-medium transition-colors select-none',
              isClassic ? 'rounded-t-lg' : 'rounded-none',
              'border-t border-l border-r',
              activeTab === 'chat'
                ? isClassic
                  ? 'bg-content-area text-foreground border-border/50'
                  : 'app-tab-active text-foreground border-border/80'
                : isClassic
                  ? 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                  : 'app-tab-inactive text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <div className="flex h-full items-center">
              <button
                type="button"
                onClick={() => onTabChange('chat')}
                className="min-w-0 flex-1 self-stretch px-2 text-left"
              >
                <span className="block truncate text-center">问答</span>
              </button>
              {onCloseChat && (
                <button
                  type="button"
                  className="mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  aria-label="关闭问答 Tab"
                  onClick={onCloseChat}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        )}
        {/* 右侧关闭按钮（常驻，三个 tab 下都可见） */}
        {onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
                  isClassic ? 'mb-[3px] mr-1' : 'ml-1',
                )}
              >
                <PanelRightClose className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">折叠文件面板 ({navigator.platform.includes('Mac') ? '⌘⇧B' : 'Ctrl+Shift+B'})</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
