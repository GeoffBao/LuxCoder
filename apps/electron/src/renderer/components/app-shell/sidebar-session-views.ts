/**
 * 侧栏「最近会话」排序 / 分组纯函数
 * 数据源同一批 AgentSessionMeta，不创建副本（除排序需要的 slice）。
 */

import type { AgentSessionMeta, SessionGroup, SessionListSortBy } from '@myyoda/shared'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'

export function buildRecentSessionList(
  sessions: AgentSessionMeta[],
): AgentSessionMeta[] {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 按排序方式排列会话：只决定"桶内部"顺序，不改变分组桶本身的排列 */
export function sortSessions(sessions: AgentSessionMeta[], sortBy: SessionListSortBy): AgentSessionMeta[] {
  const sorted = sessions.slice()
  switch (sortBy) {
    case 'alphabetical':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    case 'createdAt':
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    case 'recency':
    default:
      return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

/** 「分组方式：状态」的桶优先级与展示标签，与左侧色条使用的 SessionIndicatorStatus 复用同一套状态 */
const STATE_GROUP_ORDER: Array<{ status: SessionIndicatorStatus; label: string }> = [
  { status: 'blocked', label: '需要处理' },
  { status: 'running', label: '进行中' },
  { status: 'completed', label: '已完成' },
  { status: 'idle', label: '空闲' },
]

/** 按会话状态（复用左侧色条的 SessionIndicatorStatus）分组，固定优先级排序 */
export function groupSessionsByState(
  sessions: AgentSessionMeta[],
  indicatorMap: Map<string, SessionIndicatorStatus>,
): Array<{ label: string; items: AgentSessionMeta[] }> {
  const buckets = new Map<SessionIndicatorStatus, AgentSessionMeta[]>()
  for (const session of sessions) {
    const status = indicatorMap.get(session.id) ?? 'idle'
    const bucket = buckets.get(status)
    if (bucket) bucket.push(session)
    else buckets.set(status, [session])
  }

  return STATE_GROUP_ORDER
    .map(({ status, label }) => ({ label, items: buckets.get(status) ?? [] }))
    .filter((group) => group.items.length > 0)
}

/** 未分组会话的固定桶标签，殿后展示 */
export const UNGROUPED_SESSION_LABEL = '未分组'

/** 按用户自建分组（customGroupId）分组，分组按名称排列，未分组的会话固定殿后 */
export function groupSessionsByCustomGroup(
  sessions: AgentSessionMeta[],
  groups: SessionGroup[],
): Array<{ label: string; groupId?: string; items: AgentSessionMeta[] }> {
  const byGroupId = new Map<string, AgentSessionMeta[]>()
  const ungrouped: AgentSessionMeta[] = []

  for (const session of sessions) {
    if (session.customGroupId && groups.some((g) => g.id === session.customGroupId)) {
      const bucket = byGroupId.get(session.customGroupId)
      if (bucket) bucket.push(session)
      else byGroupId.set(session.customGroupId, [session])
    } else {
      ungrouped.push(session)
    }
  }

  const result: Array<{ label: string; groupId?: string; items: AgentSessionMeta[] }> = groups
    .filter((group) => (byGroupId.get(group.id)?.length ?? 0) > 0)
    .map((group) => ({ label: group.name, groupId: group.id, items: byGroupId.get(group.id) ?? [] }))

  if (ungrouped.length > 0) {
    result.push({ label: UNGROUPED_SESSION_LABEL, items: ungrouped })
  }

  return result
}
