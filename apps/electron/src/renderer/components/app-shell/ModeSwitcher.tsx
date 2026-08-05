/**
 * ModeSwitcher - pwork/cowork 双模式切换（带滑动指示器）
 *
 * 切换模式时自动恢复上一次在该模式下查看的对话/会话：
 * 1. 优先恢复上次选中的对话 ID
 * 2. 其次查找已打开的同类型 Tab
 * 3. 兜底打开最近的对话/会话（列表首项）
 * 4. 都没有则仅切换模式
 *
 * 顶栏 Work 已下线；pwork 承载主工作区，cowork 预留协作入口。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { appModeAtom, type AppMode } from '@/atoms/app-mode'
import { conversationsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import { agentSessionsAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { tabsAtom } from '@/atoms/tab-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import { normalizeAppModeForUi } from '@/components/app-shell/code-main-view-model'
import { Code2, House } from 'lucide-react'
import { cn } from '@/lib/utils'

const modes: { id: 'pwork' | 'cowork'; value: AppMode; label: string; icon: React.ReactNode }[] = [
  // pwork = Agent 编程模式（主工作区，融合 chat 菜单）；cowork 占位暂复用 agent（后续补占位页）
  { id: 'pwork', value: 'agent', label: 'pwork', icon: <Code2 size={15} /> },
  { id: 'cowork', value: 'agent', label: 'cowork', icon: <House size={15} /> },
]

const SLIDER_TRANSLATE = ['translate-x-0', 'translate-x-full'] as const

export function ModeSwitcher(): React.ReactElement {
  const [mode, setMode] = useAtom(appModeAtom)
  const openSession = useOpenSession()
  const conversations = useAtomValue(conversationsAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const currentAgentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const tabs = useAtomValue(tabsAtom)

  // 当前高亮的是 pwork 还是 cowork（两者内部都走 agent 模式，仅用于 slider/高亮区分）
  const [activeTabId, setActiveTabId] = React.useState<'pwork' | 'cowork'>('pwork')
  const uiMode = normalizeAppModeForUi(mode)
  const modeIndex = modes.findIndex((m) => m.id === activeTabId)
  const sliderTranslate = SLIDER_TRANSLATE[modeIndex] ?? 'translate-x-0'

  const restoreSession = React.useCallback((targetMode: 'chat' | 'agent') => {
    const isChatMode = targetMode === 'chat'
    const sessions = isChatMode ? conversations : agentSessions
    const lastId = isChatMode ? currentConversationId : currentAgentSessionId

    // 1. 上次选中的对话仍存在 → 恢复
    if (lastId) {
      const match = sessions.find((s) => s.id === lastId)
      if (match) {
        openSession(targetMode, match.id, match.title)
        return
      }
    }
    // 2. 已打开的同类型 Tab → 聚焦
    const tab = tabs.find((t) => t.type === targetMode)
    if (tab) {
      openSession(targetMode, tab.sessionId, tab.title)
      return
    }
    // 3. 最近的未归档对话/会话 → 打开
    const recent = sessions.find((s) => !s.archived)
    if (recent) {
      openSession(targetMode, recent.id, recent.title)
      return
    }
    // 4. 无任何对话，仅切换模式
    setMode(targetMode)
  }, [openSession, conversations, agentSessions, currentConversationId, currentAgentSessionId, tabs, setMode])

  const handleModeSwitch = React.useCallback((targetId: 'pwork' | 'cowork') => {
    setActiveTabId(targetId)
    // pwork / cowork 当前都走 agent 编程模式；cowork 占位待后续开发
    if (mode !== 'agent') setMode('agent')
    // 恢复最近 agent 会话
    restoreSession('agent')
  }, [mode, setMode, restoreSession])

  return (
    <div className="pt-2 titlebar-drag-region select-none">
      <div
        className="relative flex rounded-xl p-1 titlebar-drag-region mode-switcher-track sidebar-control-surface"
      >
        {/* 滑动背景指示器（双模式各占一半） */}
        <div
          className={cn(
            'mode-slider pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-background shadow-sm transition-transform duration-base ease-out',
            sliderTranslate
          )}
        />
        {modes.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleModeSwitch(id)}
            className={cn(
              'mode-btn titlebar-no-drag relative z-[1] h-8 flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-0 text-sm font-medium transition-colors duration-200 select-none',
              activeTabId === id
                ? 'mode-btn-selected text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
