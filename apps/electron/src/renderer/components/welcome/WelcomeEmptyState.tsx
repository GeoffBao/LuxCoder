/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 现代个人版空态（对齐 Cursor / Codex 的轻量视觉）：
 * 1. 前景完整展示 hero 图（不裁剪，保持原始比例），圆角卡片 + 阴影提升质感
 * 2. 个性化时段问候（大字号 + 适中字重）
 * 3. 一行轻量功能提示（按 Chat / Agent 模式展示各自相关能力）——不占空间、无按钮感
 *
 * 不在空态页内重复放 Home/Code 切换按钮——侧边栏 ModeSwitcher 提供唯一出入口，
 * 空态页聚焦于「开始打字」一个 CTA。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import {
  ArrowLeftRight,
  AtSign,
  Blocks,
  MessageSquarePlus,
  Paperclip,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { userProfileAtom } from '@/atoms/user-profile'
import { appModeAtom } from '@/atoms/app-mode'
import { normalizeAppModeForUi, type PrimaryUiMode } from '@/components/app-shell/code-main-view-model'
import { getPlatform, type Platform } from '@/lib/tips'
import welcomeHeroUrl from '@/assets/brand/welcome-hero.avif'

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

interface GuideItem {
  icon: LucideIcon
  title: string
  /** 快捷键提示；有值时以键帽形式展示 */
  hint?: string
}

/** 平台感知 + 模式感知的功能提示（一行轻量展示） */
function getGuideItems(uiMode: PrimaryUiMode, platform: Platform): GuideItem[] {
  const isMac = platform === 'mac'

  // Agent 模式：展示工作区/工具相关的引用能力
  if (uiMode === 'agent') {
    return [
      { icon: AtSign, title: '引用文件', hint: '@' },
      { icon: Blocks, title: '调用 MCP 工具', hint: '#' },
      { icon: Sparkles, title: '使用 Skill', hint: '/' },
      { icon: Paperclip, title: '上传附件' },
    ]
  }

  // Chat / Scratch 模式：日常对话快捷操作
  return [
    { icon: MessageSquarePlus, title: '新建对话', hint: isMac ? '⌘N' : 'Ctrl+N' },
    { icon: Paperclip, title: '上传附件' },
    { icon: Search, title: '搜索历史', hint: isMac ? '⌘⇧F' : 'Ctrl+Shift+F' },
    { icon: ArrowLeftRight, title: '切换模式', hint: isMac ? '⌘⇧M' : 'Ctrl+Shift+M' },
  ]
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const mode = useAtomValue(appModeAtom)
  const uiMode = normalizeAppModeForUi(mode)
  const platform = getPlatform()

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const items = getGuideItems(uiMode, platform)

  return (
    <div className="welcome-empty-state relative h-full w-full overflow-hidden">
      {/* 内容滚动区（小窗口可滚动，避免图过高被截断） */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-8">
          {/* 前景 hero 图：h-auto 按宽度等比缩放，完整展示、绝不裁剪 */}
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
            <img
              src={welcomeHeroUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="block h-auto w-full"
            />
          </div>

          {/* 问候语 */}
          <h1 className="text-[26px] font-medium tracking-tight text-foreground/90">
            {displayName}，{greeting}
          </h1>

          {/* 功能提示一行：轻量内联展示，避免卡片/按钮的视觉负担 */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-foreground/40">
            {items.map((item, index) => (
              <React.Fragment key={item.title}>
                {index > 0 && <span aria-hidden="true" className="text-foreground/20">·</span>}
                <span className="inline-flex items-center gap-1.5">
                  <item.icon className="size-3.5" aria-hidden="true" />
                  {item.title}
                  {item.hint && (
                    <kbd className="rounded border border-foreground/10 bg-foreground/5 px-1 py-px font-sans text-[10px] leading-none text-foreground/45">
                      {item.hint}
                    </kbd>
                  )}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
