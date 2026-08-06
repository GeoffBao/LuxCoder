/**
 * greeting — 空状态共享的问候语与企业吉祥物
 *
 * 从 WelcomeEmptyState 抽出，供 Code 模式的 AgentNewSessionHero 复用，
 * 避免问候语文案 / 吉祥物图形在两处重复维护。
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import luxshareIctMascotUrl from '@/assets/brand/luxshare-ict-mascot.png'

/** 根据小时返回时段问候 */
export function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function EnterpriseMascot({ className }: { className?: string }): React.ReactElement {
  return (
    <img
      src={luxshareIctMascotUrl}
      className={cn(
        'rounded-full object-cover shadow-[0_12px_40px_rgba(28,82,180,0.18)] ring-1 ring-blue-500/15',
        className,
      )}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
