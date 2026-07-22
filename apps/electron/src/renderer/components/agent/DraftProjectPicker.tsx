/**
 * DraftProjectPicker — Draft 会话首条发送前可选/改绑 Project
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'
import { cn } from '@/lib/utils'
import { canBindProjectBeforeSend } from './draft-session-lifecycle'

export interface DraftProjectPickerProps {
  sessionId: string
  projectId?: string
  isDraft: boolean
  className?: string
}

export function DraftProjectPicker({
  sessionId,
  projectId,
  isDraft,
  className,
}: DraftProjectPickerProps): React.ReactElement | null {
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const [busy, setBusy] = React.useState(false)

  if (!canBindProjectBeforeSend({ projectId, isDraft })) return null

  const activeProjects = projects.filter((project) => !project.archivedAt)

  const bindProject = async (nextProjectId: string): Promise<void> => {
    setBusy(true)
    try {
      const updated = await window.electronAPI.sendSessionCommand(sessionId, {
        kind: 'set_project_id',
        projectId: nextProjectId || undefined,
      })
      setAgentSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)))
    } catch (error) {
      console.error('[DraftProjectPicker] 绑定项目失败:', error)
      toast.error('绑定项目失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-2 px-1 pb-1.5', className)}>
      <FolderKanban size={12} className="shrink-0 text-foreground/40" />
      <select
        aria-label="选择项目"
        disabled={busy}
        value={projectId ?? ''}
        onChange={(event) => {
          void bindProject(event.target.value)
        }}
        className="h-7 max-w-[220px] rounded-md border border-border/50 bg-background/80 px-2 text-[12px] text-foreground/80 outline-none focus:border-border"
      >
        <option value="">未归类（可选项目）</option>
        {activeProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  )
}
