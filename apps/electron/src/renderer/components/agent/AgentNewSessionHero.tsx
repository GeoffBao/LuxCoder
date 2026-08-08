/**
 * AgentNewSessionHero — Code 模式新会话首屏
 *
 * 空会话时展示：吉祥物 + 问候语 + 三个场景 Tab（日常办公/代码开发/设计创意）
 * + 对应的一排快捷入口 chip。发送第一条消息后，AgentView 会切到常规布局，
 * 本组件随之卸载。
 *
 * 只负责 UI 与 Tab 选中态；chip 点击后具体做什么（写入 prompt / 调用 Skill /
 * 跳转看板）交给父组件 AgentView 处理，因为它才持有输入框 ref 和路由 atom。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { userProfileAtom } from '@/atoms/user-profile'
import { getGreeting, EnterpriseMascot } from '@/components/welcome/greeting'
import {
  QUICKSTART_CATEGORIES,
  QUICKSTART_CHIPS,
  type QuickstartCategory,
  type QuickstartChip,
} from '@/lib/agent-quickstart-chips'
import { cn } from '@/lib/utils'

interface AgentNewSessionHeroProps {
  onPickChip: (chip: QuickstartChip) => void
}

/** 首屏输入技巧提示：与输入框 placeholder 一致，帮助企业新用户快速熟悉符号能力 */
const INPUT_TIPS: Array<{ symbol: string; label: string }> = [
  { symbol: '@', label: '引用文件' },
  { symbol: '/', label: '调用 Skill' },
  { symbol: '#', label: '使用 MCP' },
  { symbol: '&', label: '引用会话' },
  { symbol: '～', label: '引用待办/日程' },
]

export function AgentNewSessionHero({ onPickChip }: AgentNewSessionHeroProps): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const [category, setCategory] = React.useState<QuickstartCategory>('office')

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const chips = QUICKSTART_CHIPS[category]

  return (
    <div className="agent-new-session-hero flex w-full max-w-[820px] flex-col items-center gap-5 px-4">
      <EnterpriseMascot className="size-20 opacity-95" />

      <h1 className="text-[26px] font-normal tracking-tight text-foreground/90">
        {displayName}，{greeting}
      </h1>

      <div className="flex items-center gap-1.5 rounded-full border-[0.5px] border-border bg-background/60 p-1">
        {QUICKSTART_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-fast',
              item.id === category
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const Icon = chip.icon
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onPickChip(chip)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border-[0.5px] border-border bg-background/60 px-3 py-1.5 text-[13px] text-foreground/70 transition-colors duration-fast hover:border-foreground/20 hover:bg-background hover:text-foreground"
            >
              <Icon className="size-3.5 shrink-0" />
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* 输入技巧提示：输入框 placeholder 的符号能力一览，降低企业新用户上手门槛 */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground/70">
        <span className="font-medium text-foreground/60">输入技巧</span>
        {INPUT_TIPS.map((tip) => (
          <span key={tip.symbol} className="flex items-center gap-1.5">
            <kbd className="flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-border bg-background/70 px-1.5 font-mono text-[11px] leading-none text-foreground/80">
              {tip.symbol}
            </kbd>
            <span>{tip.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
