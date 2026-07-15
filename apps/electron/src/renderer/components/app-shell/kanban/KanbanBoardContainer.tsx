import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import {
  boardModeAtom,
  kanbanItemsAtom,
  kanbanNotificationsAtom,
  moveCardAtom,
} from '@/atoms/kanban-atoms'
import {
  selectedKanbanProjectAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import { BoardListToggle } from './BoardListToggle'
import { consumeFirstNotification } from './board-model'
import { KanbanBoard } from './KanbanBoard'
import { KanbanProjectFilter } from './KanbanProjectFilter'
import { NewTaskComposer } from './NewTaskComposer'
import type { KanbanItem } from './types'

interface KanbanBoardContainerProps {
  onOpenItem?: (item: KanbanItem) => void
  onTaskCreated?: () => void | Promise<void>
}

export function KanbanBoardContainer({ onOpenItem, onTaskCreated }: KanbanBoardContainerProps): React.ReactElement {
  const items = useAtomValue(kanbanItemsAtom)
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const selectedProject = useAtomValue(selectedKanbanProjectAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom)
  const [mode, setMode] = useAtom(boardModeAtom)
  const [notifications, setNotifications] = useAtom(kanbanNotificationsAtom)
  const moveCard = useSetAtom(moveCardAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? null
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!workspace) { setWorkspaceRoot(null); return }
    let cancelled = false
    void window.electronAPI.getWorkspaceRootPath(workspace.slug).then((root) => {
      if (!cancelled) setWorkspaceRoot(root)
    }).catch(() => {
      if (!cancelled) setWorkspaceRoot(null)
    })
    return () => { cancelled = true }
  }, [workspace])

  React.useEffect(() => {
    if (notifications.length === 0) return
    const consumed = consumeFirstNotification(notifications)
    setNotifications(consumed.remaining)
    if (consumed.notification) toast.error(consumed.notification.message)
  }, [notifications, setNotifications])

  const composer = workspaceRoot && workspace
    ? <NewTaskComposer workspaceRoot={workspaceRoot} workspaceId={workspace.id} onCreated={onTaskCreated} />
    : undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-background p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-semibold">Projects & Kanban</h1><p className="text-xs text-muted-foreground">{items.length} 个会话任务</p></div>
        <div className="flex items-center gap-2">
          <KanbanProjectFilter projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} />
          <BoardListToggle value={mode} onChange={setMode} />
        </div>
      </header>
      <KanbanBoard
        items={items}
        mode={mode}
        columns={selectedProject?.kanbanColumns}
        onMove={(sessionId, columnId) => { void moveCard({ sessionId, columnId }) }}
        onOpenItem={onOpenItem}
        composer={composer}
      />
    </div>
  )
}
