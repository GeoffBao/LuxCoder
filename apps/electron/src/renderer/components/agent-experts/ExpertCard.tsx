/**
 * ExpertCard — Agent 专家视图中的专家卡片
 */

import * as React from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpertPackage } from '@luxcodex/shared/experts'

interface ExpertCardProps {
  expert: ExpertPackage
  onOpen: () => void
}

export function ExpertCard({ expert, onOpen }: ExpertCardProps): React.ReactElement {
  const skillCount = expert.skillSlugs.length
  const mcpCount = expert.mcpIds.length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-all cursor-pointer',
        'hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-500/12 p-2 text-emerald-600 dark:text-emerald-400 shadow-sm shrink-0">
          <Bot size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{expert.label}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{expert.id}</div>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {expert.identityMd.split('\n').slice(1).join(' ').trim() || '暂无身份描述'}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {skillCount} 个 Skill
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {mcpCount} 个 MCP
        </span>
      </div>
    </div>
  )
}
