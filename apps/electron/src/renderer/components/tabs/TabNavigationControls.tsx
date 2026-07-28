/** Tab 级后退 / 前进控件，复用同一套 store 动作供按钮与快捷键调用。 */

import * as React from 'react'
import { useAtomValue, useStore } from 'jotai'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  canGoBackAtom,
  canGoForwardAtom,
  popBackAtom,
  popForwardAtom,
  programmaticNavAtom,
} from '@/atoms/tab-history-atoms'
import { activateTab } from './activate-tab'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function TabNavigationControls({ className }: { className?: string }): React.ReactElement {
  const store = useStore()
  const canGoBack = useAtomValue(canGoBackAtom)
  const canGoForward = useAtomValue(canGoForwardAtom)
  const navigate = React.useCallback((direction: 'back' | 'forward') => {
    // 先通过 atom 取得 target（会同步维护对应栈），再回放完整 Tab 激活副作用。
    const target = store.set(direction === 'back' ? popBackAtom : popForwardAtom)
    if (!target) return
    store.set(programmaticNavAtom, true)
    try {
      activateTab(store, target)
    } finally {
      store.set(programmaticNavAtom, false)
    }
  }, [store])

  return (
    <div className={cn('relative z-10 flex h-[34px] flex-shrink-0 items-center gap-0.5 titlebar-no-drag', className)}>
      <Tooltip>
        {/* disabled button 不会触发 pointer event；以 no-drag wrapper 承接 Tooltip，空历史时也能解释快捷键。 */}
        <TooltipTrigger asChild>
          <span className="inline-flex titlebar-no-drag">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="后退（⌘[）"
              disabled={!canGoBack}
              className="h-7 w-7"
              onClick={() => navigate('back')}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">后退（⌘[）</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex titlebar-no-drag">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="前进（⌘]）"
              disabled={!canGoForward}
              className="h-7 w-7"
              onClick={() => navigate('forward')}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">前进（⌘]）</TooltipContent>
      </Tooltip>
    </div>
  )
}
