/**
 * DraftProjectPicker — Draft 会话首条发送前可选/改绑 Project
 * 复用共享 ProjectContextPicker（session 模式可跳过）
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { ProjectContextPicker } from '@/components/app-shell/ProjectContextPicker'
import { shouldDefaultOpenSessionPicker } from '@/components/app-shell/project-context-picker-model'
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
  const setAgentSessions = useSetAtom(agentSessionsAtom)

  if (!canBindProjectBeforeSend({ projectId, isDraft })) return null

  const bindProject = async (nextProjectId: string | null): Promise<void> => {
    try {
      const updated = await window.electronAPI.sendSessionCommand(sessionId, {
        kind: 'set_project_id',
        projectId: nextProjectId || undefined,
      })
      setAgentSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)))
    } catch (error) {
      console.error('[DraftProjectPicker] 绑定项目失败:', error)
      toast.error('绑定项目失败')
    }
  }

  return (
    <div className={cn('px-1 pb-1.5', className)}>
      <ProjectContextPicker
        mode="session"
        selectedProjectId={projectId}
        defaultOpen={shouldDefaultOpenSessionPicker({ mode: 'session', selectedProjectId: projectId })}
        onSelect={bindProject}
      />
    </div>
  )
}
