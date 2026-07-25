/**
 * AgentHeader — Agent 会话头部
 *
 * 复用 SessionHeader；重命名时同步更新 Tab 标题和会话列表的新鲜度排序。
 * 若会话绑定了项目，在标题旁显示项目名 badge（含颜色圆点）。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { tabsAtom, updateTabTitle } from '@/atoms/tab-atoms'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'
import { replaceAgentSessionInFreshnessOrder } from '@/lib/agent-session-list'
import { SessionHeader } from '@/components/tabs/SessionHeader'

interface AgentHeaderProps {
  sessionId: string
}

export function AgentHeader({ sessionId }: AgentHeaderProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const session = sessions.find((s) => s.id === sessionId) ?? null
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setTabs = useSetAtom(tabsAtom)
  const projects = useAtomValue(serverKanbanProjectsAtom)

  if (!session) return null

  const project = session.projectId
    ? projects.find((p) => p.id === session.projectId) ?? null
    : null

  const handleRename = async (title: string): Promise<void> => {
    const updated = await window.electronAPI.updateAgentSessionTitle(session.id, title)
    setTabs((prev) => updateTabTitle(prev, updated.id, updated.title))
    setAgentSessions((prev) => replaceAgentSessionInFreshnessOrder(prev, updated))
  }

  return (
    <SessionHeader
      title={session.title}
      onRename={handleRename}
      badge={project ? <ProjectBadge name={project.name} color={project.color} /> : undefined}
    />
  )
}

/** 标题旁的项目名标签，样式与 TabBar workspace badge 一致 */
function ProjectBadge({ name, color }: { name: string; color?: string }): React.ReactElement {
  return (
    <span className="titlebar-no-drag shrink-0 inline-flex items-center gap-1 px-1.5 py-0 rounded-full bg-primary/10 text-[10px] leading-4 font-medium truncate max-w-[100px]">
      {color && (
        <span
          className="inline-block size-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {name}
    </span>
  )
}
