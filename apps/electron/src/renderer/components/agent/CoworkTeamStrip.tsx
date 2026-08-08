/**
 * CoworkTeamStrip — 会话内队友条（对齐 Synara subagent strip）
 *
 * 显示当前会话拉入的 cowork 子会话（parentSessionId === 当前会话）：
 * 状态点 / 名称 / 角色徽标 / 模型，点击切换查看，运行中可停止。
 * 挂在 AgentView 输入区上方，与 ActiveTasksBar 同层。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Bot, Crown, Loader2, Square, Users } from 'lucide-react'
import { agentSessionsAtom, agentStreamingStatesAtom } from '@/atoms/agent-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import { cn } from '@/lib/utils'
import type { AgentSessionMeta } from '@myyoda/shared'

/** cowork 子会话的委派角色集合（区别于 collaboration explore/research 等） */
const COWORK_ROLES = new Set(['expert-cowork', 'team-leader', 'team-member', 'team-summary'])

function roleMeta(delegationRole: string | undefined): { label: string; icon: React.ReactElement; className: string } {
  switch (delegationRole) {
    case 'team-leader':
      return { label: '团长', icon: <Crown className="size-3" />, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
    case 'team-summary':
      return { label: '汇总', icon: <Users className="size-3" />, className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' }
    case 'team-member':
      return { label: '成员', icon: <Bot className="size-3" />, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
    default:
      return { label: '专家', icon: <Bot className="size-3" />, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  }
}

function statusDot(status: string | undefined, running: boolean): React.ReactElement {
  const dotClass = running
    ? 'bg-emerald-500 animate-pulse'
    : status === 'completed' || status === 'done'
      ? 'bg-emerald-500/70'
      : status === 'failed'
        ? 'bg-rose-500'
        : 'bg-muted-foreground/40'
  return <span className={cn('size-1.5 shrink-0 rounded-full', dotClass)} title={running ? '运行中' : (status ?? '')} />
}

interface CoworkTeamStripProps {
  sessionId: string
  className?: string
}

export function CoworkTeamStrip({ sessionId, className }: CoworkTeamStripProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const streamStates = useAtomValue(agentStreamingStatesAtom)
  const openSession = useOpenSession()

  const coworkers = React.useMemo(
    () =>
      sessions
        .filter(
          (session): session is AgentSessionMeta =>
            session.parentSessionId === sessionId && COWORK_ROLES.has(session.delegationRole ?? ''),
        )
        .sort((a, b) => a.createdAt - b.createdAt),
    [sessions, sessionId],
  )

  if (coworkers.length === 0) return null

  const handleStop = (event: React.MouseEvent, childId: string): void => {
    event.stopPropagation()
    void window.electronAPI.stopAgent(childId)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 px-3 pt-2', className)}>
      <span className="text-[11px] font-medium text-muted-foreground/70">队友</span>
      {coworkers.map((child) => {
        const running = Boolean(streamStates.get(child.id)?.running) || child.delegationStatus === 'running'
        const meta = roleMeta(child.delegationRole)
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => openSession('agent', child.id, child.title)}
            className={cn(
              'group inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border border-border/60 bg-content-area py-0.5 pl-2 pr-1.5 text-left transition-colors hover:border-border',
            )}
            title={`${child.title}${child.modelId ? ` · ${child.modelId}` : ''} — 点击切换查看`}
          >
            {statusDot(child.delegationStatus, running)}
            <span className="truncate text-[11px] font-medium text-foreground">{child.title}</span>
            <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px]', meta.className)}>
              {meta.icon}
              {meta.label}
            </span>
            {running ? (
              <span className="shrink-0 rounded-full p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => handleStop(event, child.id)}>
                <Square className="size-2.5" />
              </span>
            ) : (
              <Loader2 className="hidden" />
            )}
          </button>
        )
      })}
    </div>
  )
}
