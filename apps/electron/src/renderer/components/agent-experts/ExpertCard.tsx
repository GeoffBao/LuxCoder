/**
 * ExpertCard — Agent 专家视图中的专家 / 专家团卡片
 *
 * 升级点（专家团重设计）：
 * - avatar（lucide 图标 + accent 色）优先，fallback 现有 Bot/Users + 主题色
 * - description 字段优先，fallback identityMd 首段
 * - 专家团卡片：团长 + 成员头像组（`-space-x-2` 堆叠），role 标注
 */

import * as React from 'react'
import { Bot, Users, ShieldCheck, Layers, Code2, ClipboardCheck, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpertPackage, TeamSquad } from '@myyoda/shared/experts'

/** 常用图标映射：expert.json / team.json 的 avatar.icon 只允许白名单（避免动态导入全量图标） */
const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Users,
  ShieldCheck,
  Layers,
  Code2,
  ClipboardCheck,
  UserRound,
}

const ACCENT_CLASSES: Record<string, string> = {
  primary: 'bg-primary/12 text-primary dark:text-primary',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  indigo: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
}

function accentClass(accent: string | undefined): string {
  return ACCENT_CLASSES[accent ?? ''] ?? ACCENT_CLASSES['primary']!
}


interface ExpertCardProps {
  expert: ExpertPackage
  onOpen: () => void
  /** 可选：专家团数据（用于团队卡解析团长/成员） */
  teams?: TeamSquad[]
  /** 可选：专家 label 索引（解析团长/成员名称） */
  expertLabels?: Record<string, string>
}

function avatarIcon(expert: ExpertPackage): LucideIcon {
  const name = expert.avatar?.icon
  if (name && ICON_MAP[name]) return ICON_MAP[name]!
  return expert.kind === 'team' ? Users : Bot
}

function fallbackAccent(expert: ExpertPackage): string {
  return expert.kind === 'team' ? 'indigo' : 'emerald'
}

function cardDescription(expert: ExpertPackage): string {
  if (expert.description?.trim()) return expert.description.trim()
  const derived = expert.identityMd.split('\n').slice(1).join(' ').trim()
  return derived || '暂无身份描述'
}

/** 团队卡头像组：团长 + 前 3 个成员（-space-x-2 堆叠） */
function TeamAvatarStack({
  team,
  expertLabels,
}: {
  team: TeamSquad
  expertLabels: Record<string, string>
}): React.ReactElement {
  const members = [team.leaderExpertId, ...team.members.map((m) => m.expertId)].slice(0, 4)
  return (
    <div className="flex -space-x-2">
      {members.map((expertId, index) => {
        const label = expertLabels[expertId] ?? expertId
        const isLeader = index === 0
        return (
          <div
            key={`${expertId}-${index}`}
            title={`${label}${isLeader ? '（团长）' : ''}`}
            className={cn(
              'flex size-6 items-center justify-center rounded-full border-2 border-content-area text-[10px] font-semibold',
              isLeader
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {label.slice(0, 1)}
          </div>
        )
      })}
    </div>
  )
}

export function ExpertCard({ expert, onOpen, teams = [], expertLabels = {} }: ExpertCardProps): React.ReactElement {
  const isTeam = expert.kind === 'team'
  const roleLabels = expert.roleLabels ?? []
  const skillCount = expert.skillSlugs.length
  const mcpCount = expert.mcpIds.length
  const team = isTeam ? teams.find((item) => item.id === expert.id) ?? null : null
  const Icon = avatarIcon(expert)

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
        'group flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-content-area p-4 text-left transition-[border-color,box-shadow,background-color] duration-fast cursor-pointer',
        'hover:border-border hover:shadow-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'rounded-xl p-2 shadow-sm shrink-0',
            accentClass(expert.avatar?.accent ?? fallbackAccent(expert)),
          )}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{expert.label}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{expert.id}</div>
        </div>
        {isTeam && team && (
          <div className="shrink-0 pt-0.5">
            <TeamAvatarStack team={team} expertLabels={expertLabels} />
          </div>
        )}
      </div>

      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {cardDescription(expert)}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {isTeam && team ? (
          <>
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              团长: {expertLabels[team.leaderExpertId] ?? team.leaderExpertId}
            </span>
            {team.members.slice(0, 2).map((member) => (
              <span
                key={member.expertId}
                className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400"
              >
                {expertLabels[member.expertId] ?? member.expertId}
                {member.role ? `·${member.role}` : ''}
              </span>
            ))}
            {team.members.length > 2 && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                +{team.members.length - 2}
              </span>
            )}
          </>
        ) : roleLabels.length > 0 ? (
          roleLabels.slice(0, 3).map((role) => (
            <span
              key={role}
              className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400"
            >
              {role}
            </span>
          ))
        ) : (
          <>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {skillCount} 个 Skill
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {mcpCount} 个 MCP
            </span>
          </>
        )}
      </div>
    </div>
  )
}
