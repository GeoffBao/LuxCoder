/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 安静空态（对齐 Cursor / Codex）：
 * 1. OpenMoji robot 吉祥物插图（居中）
 * 2. 个性化时段问候（大字号 + regular 字重，层级靠字号不靠加粗）
 * 3. 一行弱化的平台感知 Tip
 * 4. 幽灵态 Chat/Code 模式切换（无色块轨道，选中 = 墨水填充；顺序与侧边栏一致：Chat | Code）
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

/** UI 实际展示的模式配置（顺序与侧边栏 ModeSwitcher 一致：Chat | Code） */
const MODE_ORDER: ('chat' | 'agent')[] = ['chat', 'agent']

const MODE_CONFIG: Record<'chat' | 'agent', { icon: React.ReactNode; label: string }> = {
  chat: { icon: <MessageSquare size={15} />, label: 'Chat' },
  agent: { icon: <Code2 size={15} />, label: 'Code' },
}

/**
 * OpenMoji Robot (1F916) — 吉祥物插图。
 * 内联 SVG，暗色模式下 stroke 自动切换为 foreground 色值。
 */
function MascotRobot({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 72 72"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'drop-shadow-sm',
        // 暗色模式：stroke 跟随 foreground，否则黑色线条不可见
        'dark:[&_[stroke]]:stroke-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <g id="color">
        <path fill="#D22F27" d="M34,16.1123v-2.5109c0-1.3807,1.1193-2.5,2.5-2.5l0,0c1.3807,0,2.5,1.1193,2.5,2.5v2.5"/>
        <path fill="#D0CFCE" d="M13.5,41.1014L13.5,41.1014c-1.3807,0-2.5-1.1193-2.5-2.5v-8c0-1.3807,1.1193-2.5,2.5-2.5l0,0 c1.3807,0,2.5,1.1193,2.5,2.5v8C16,39.9821,14.8807,41.1014,13.5,41.1014z"/>
        <path fill="#D0CFCE" d="M58.5,41.1014L58.5,41.1014c1.3807,0,2.5-1.1193,2.5-2.5v-8c0-1.3807-1.1193-2.5-2.5-2.5l0,0 c-1.3807,0-2.5,1.1193-2.5,2.5v8C56,39.9821,57.1193,41.1014,58.5,41.1014z"/>
        <path fill="#D0CFCE" d="M47.4505,56.1123h-22.901c-4.7022,0-8.5495-3.8473-8.5495-8.5495v-22.901 c0-4.7022,3.8473-8.5495,8.5495-8.5495h22.901c4.7022,0,8.5495,3.8473,8.5495,8.5495v22.901 C56,52.2649,52.1527,56.1123,47.4505,56.1123z"/>
        <path fill="#9B9B9A" d="M35.4977,56.1115h13.2865c3.9687,0,7.2158-3.8473,7.2158-8.5495V24.661 c0-4.7022-3.2471-8.5495-7.2158-8.5495h-2.3526"/>
        <ellipse cx="44.8346" cy="29.0027" rx="2.8338" ry="2.8338" fill="#FFFFFF"/>
        <ellipse cx="27.3342" cy="29.0022" rx="2.8338" ry="2.8338" fill="#FFFFFF"/>
        <path fill="#FFFFFF" d="M44.5,47.5005h-17c-2.2,0-4-1.8-4-4l0,0c0-2.2,1.8-4,4-4h17c2.2,0,4,1.8,4,4l0,0 C48.5,45.7005,46.7,47.5005,44.5,47.5005z"/>
      </g>
      <g id="hair"/>
      <g id="skin"/>
      <g id="skin-shadow"/>
      <g id="line">
        <path fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2" d="M34,16.0109V13.5c0-1.3807,1.1193-2.5,2.5-2.5l0,0c1.3807,0,2.5,1.1193,2.5,2.5V16"/>
        <path fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2" d="M47.4505,56h-22.901C19.8473,56,16,52.1527,16,47.4505v-22.901C16,19.8473,19.8473,16,24.5495,16h22.901 C52.1527,16,56,19.8473,56,24.5495v22.901C56,52.1527,52.1527,56,47.4505,56z"/>
        <ellipse cx="44.8346" cy="29.0022" rx="2.8338" ry="2.8338" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
        <ellipse cx="27.3342" cy="29.0017" rx="2.8338" ry="2.8338" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
        <path fill="none" stroke="#000000" strokeMiterlimit="2" strokeWidth="2" d="M44.5,47.5h-17c-2.2,0-4-1.8-4-4l0,0 c0-2.2,1.8-4,4-4h17c2.2,0,4,1.8,4,4l0,0C48.5,45.7,46.7,47.5,44.5,47.5z"/>
        <path fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2" d="M13.5,41L13.5,41c-1.3807,0-2.5-1.1193-2.5-2.5v-8c0-1.3807,1.1193-2.5,2.5-2.5l0,0c1.3807,0,2.5,1.1193,2.5,2.5v8 C16,39.8807,14.8807,41,13.5,41z"/>
        <path fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2" d="M58.5,41L58.5,41c1.3807,0,2.5-1.1193,2.5-2.5v-8c0-1.3807-1.1193-2.5-2.5-2.5l0,0c-1.3807,0-2.5,1.1193-2.5,2.5v8 C56,39.8807,57.1193,41,58.5,41z"/>
        <line x1="28" x2="28" y1="40" y2="47" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
        <line x1="33" x2="33" y1="40" y2="47" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
        <line x1="38" x2="38" y1="40" y2="47" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
        <line x1="43" x2="43" y1="40" y2="47" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="2" strokeWidth="2"/>
      </g>
    </svg>
  )
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
      {/* 吉祥物插图：OpenMoji Robot */}
      <MascotRobot className="size-28 opacity-85" />

      {/* 问候语：层级靠字号，不靠加粗 */}
      <h1 className="text-[28px] font-normal tracking-tight text-foreground/90">
        {displayName}，{greeting}
      </h1>

      {/* Tip：一行弱化文字，不做胶囊色块 */}
      <p className="max-w-[52ch] text-center text-[13px] leading-relaxed text-foreground/40">
        {tip.text}
      </p>

      {/* 模式切换：幽灵分段，选中 = 墨水填充；顺序与侧边栏一致：Chat | Code */}
      <div className="mt-1 flex items-center gap-1">
        {MODE_ORDER.map((m) => {
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
