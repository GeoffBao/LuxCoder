/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 安静空态（对齐 Cursor / Codex）：
 * 1. 个性化时段问候（大字号 + regular 字重，层级靠字号不靠加粗）
 * 2. 一行弱化的平台感知 Tip
 * 3. 幽灵态 Chat/Code 模式切换（无色块轨道，选中 = 墨水填充）
 */

import * as React from 'react'
import { useAtomValue, useAtom } from 'jotai'
import { MessageSquare, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { userProfileAtom } from '@/atoms/user-profile'
import { appModeAtom } from '@/atoms/app-mode'
import { normalizeAppModeForUi } from '@/components/app-shell/code-main-view-model'
import { getRandomTip, getPlatform, type Tip } from '@/lib/tips'

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/** UI 实际展示的模式配置（cowork/scratch 已退役） */
const MODE_CONFIG: Record<'chat' | 'agent', { icon: React.ReactNode; label: string }> = {
  chat: { icon: <MessageSquare size={15} />, label: 'Chat' },
  agent: { icon: <Code2 size={15} />, label: 'Code' },
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const [mode, setMode] = useAtom(appModeAtom)

  // 稳定的随机 Tip（组件挂载时选一条）
  const [tip] = React.useState<Tip>(() => getRandomTip(getPlatform()))

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const uiMode = normalizeAppModeForUi(mode)

  /** 切换模式：仅切换模式，不创建新会话；遗留 cowork 点 Chat/Code 正常切走 */
  const handleModeSwitch = React.useCallback((targetMode: 'chat' | 'agent'): void => {
    if (targetMode === uiMode) return
    setMode(targetMode)
  }, [uiMode, setMode])

  return (
    <div className="welcome-empty-state flex h-full flex-col items-center justify-center gap-5 px-4">
      {/* 问候语：层级靠字号，不靠加粗 */}
      <h1 className="text-[28px] font-normal tracking-tight text-foreground/90">
        {displayName}，{greeting}
      </h1>

      {/* Tip：一行弱化文字，不做胶囊色块 */}
      <p className="max-w-[52ch] text-center text-[13px] leading-relaxed text-foreground/40">
        {tip.text}
      </p>

      {/* 模式切换：幽灵分段，选中 = 墨水填充 */}
      <div className="mt-1 flex items-center gap-1">
        {(['agent', 'chat'] as const).map((m) => {
          const config = MODE_CONFIG[m]
          const isSelected = uiMode === m
          return (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] transition-colors duration-150',
                isSelected
                  ? 'bg-foreground/10 text-foreground/90'
                  : 'text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground/75',
              )}
            >
              {config.icon}
              {config.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
