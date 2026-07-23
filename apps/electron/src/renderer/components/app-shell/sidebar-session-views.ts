/**
 * 侧栏「最近会话」排序纯函数
 * 数据源同一批 AgentSessionMeta，不创建副本。
 */

import type { AgentSessionMeta } from '@luxcoder/shared'

export function buildRecentSessionList(
  sessions: AgentSessionMeta[],
): AgentSessionMeta[] {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
