import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { CloudDownload, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcoder/shared'
import {
  agentModelIdAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { channelsAtom, channelsLoadedAtom } from '@/atoms/chat-atoms'
import {
  boardModeAtom,
  kanbanItemsAtom,
  kanbanNotificationsAtom,
  moveCardAtom,
} from '@/atoms/kanban-atoms'
import {
  pendingTaskEditorTargetAtom,
  selectedKanbanProjectAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import { BoardListToggle } from './BoardListToggle'
import { consumeFirstNotification } from './board-model'
import { buildKanbanModelCatalog } from './kanban-model-catalog'
import { KanbanBoard } from './KanbanBoard'
import { KanbanProjectFilter } from './KanbanProjectFilter'
import { NewTaskComposer } from './NewTaskComposer'
import { TaskEditor } from './TaskEditor'
import { resolveKanbanItemOpen } from './task-editor-model'
import { Button } from '@/components/ui/button'
import type { KanbanItem, TaskEditorTarget } from './types'
import { TeambitionPicker } from '@/components/work/TeambitionPicker'

/** 任务创建/运行后回调；`ran` 为 true 时打开编排会话。 */
export interface TaskCreatedEvent {
  sessionId: string
  slug?: string
  projectId?: string
  /** 是否已触发 tasks.run（创建并运行 / 看板运行） */
  ran?: boolean
}

interface KanbanBoardContainerProps {
  onOpenItem?: (item: KanbanItem) => void
  onOpenSubtask?: (sessionId: string) => void
  onTaskCreated?: (created?: TaskCreatedEvent) => void | Promise<void>
  onSessionCreated?: (session: AgentSessionMeta) => void
}

export function KanbanBoardContainer({
  onOpenItem,
  onOpenSubtask,
  onTaskCreated,
  onSessionCreated,
}: KanbanBoardContainerProps): React.ReactElement {
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
  const channels = useAtomValue(channelsAtom)
  const channelsLoaded = useAtomValue(channelsLoadedAtom)
  const setChannels = useSetAtom(channelsAtom)
  const setChannelsLoaded = useSetAtom(channelsLoadedAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)
  const [editorTarget, setEditorTarget] = React.useState<TaskEditorTarget | null>(null)
  const [teambitionPickerOpen, setTeambitionPickerOpen] = React.useState(false)
  const pendingEditorTarget = useAtomValue(pendingTaskEditorTargetAtom)
  const setPendingEditorTarget = useSetAtom(pendingTaskEditorTargetAtom)

  const { groups: modelGroups, modelToConnection } = React.useMemo(
    () => buildKanbanModelCatalog(channels),
    [channels],
  )

  // 消费项目中心等跨视图「新建任务」请求
  React.useEffect(() => {
    if (!pendingEditorTarget) return
    setEditorTarget({
      mode: 'create',
      ...(pendingEditorTarget.initialProjectId
        ? { initialProjectId: pendingEditorTarget.initialProjectId }
        : {}),
    })
    setPendingEditorTarget(null)
  }, [pendingEditorTarget, setPendingEditorTarget])

  React.useEffect(() => {
    if (channelsLoaded && channels.length > 0) return
    let cancelled = false
    void window.electronAPI.listChannels().then((next) => {
      if (cancelled) return
      setChannels(next)
      setChannelsLoaded(true)
    }).catch(console.error)
    return () => { cancelled = true }
  }, [channels.length, channelsLoaded, setChannels, setChannelsLoaded])

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

  const openItem = (item: KanbanItem): void => {
    const action = resolveKanbanItemOpen(item)
    if (action.kind === 'editor') setEditorTarget(action.target)
    else onOpenItem?.(item)
  }

  if (editorTarget && workspaceRoot && workspace) {
    const editSession = editorTarget.mode === 'edit'
      ? items.find((item) => item.id === editorTarget.sessionId)?.session
      : undefined
    const defaultModel = editSession?.modelId
      ?? agentModelId
      ?? modelGroups[0]?.models[0]?.id
      ?? ''
    return (
      <TaskEditor
        workspaceRoot={workspaceRoot}
        workspaceId={workspace.id}
        projects={projects}
        target={editorTarget}
        defaultModel={defaultModel}
        modelGroups={modelGroups}
        modelToConnection={modelToConnection}
        onClose={() => setEditorTarget(null)}
        onCreated={onTaskCreated
          ? async (created) => {
              await onTaskCreated({
                sessionId: created.sessionId,
                slug: created.slug,
                ran: created.ran,
                ...(created.projectId ? { projectId: created.projectId } : {}),
              })
            }
          : undefined}
        onOpenSession={(sessionId) => {
          const item = items.find((candidate) => candidate.id === sessionId)
          if (item) onOpenItem?.(item)
        }}
        onOpenChildSession={onOpenSubtask}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Projects & Kanban</h1>
          <p className="text-xs text-muted-foreground">{items.length} 个会话任务</p>
        </div>
        <div className="flex items-center gap-2">
          <KanbanProjectFilter projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} />
          <BoardListToggle value={mode} onChange={setMode} />
          <Button
            size="sm"
            disabled={!workspaceRoot || !workspace}
            onClick={() => setEditorTarget({ mode: 'create', ...(selectedProjectId ? { initialProjectId: selectedProjectId } : {}) })}
          >
            <Plus className="h-4 w-4" />新增任务
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!workspaceRoot || !workspace}
            onClick={() => setTeambitionPickerOpen(true)}
          >
            <CloudDownload className="h-4 w-4" />从 Teambition 认领
          </Button>
        </div>
      </header>
      <KanbanBoard
        items={items}
        mode={mode}
        columns={selectedProject?.kanbanColumns}
        onMove={(sessionId, columnId) => { void moveCard({ sessionId, columnId }) }}
        onOpenItem={openItem}
        onOpenSubtask={onOpenSubtask}
        onRunTask={(item) => {
          if (!workspaceRoot || !workspace || !item.session.taskSlug) return
          void window.electronAPI.tasks.run(workspaceRoot, workspace.id, item.session.taskSlug, {
            orchestratorSessionId: item.id,
          })
            .then(async () => {
              toast.success('任务已开始运行')
              await onTaskCreated?.({
                sessionId: item.id,
                slug: item.session.taskSlug ?? undefined,
                ran: true,
              })
            })
            .catch((cause: unknown) => {
              toast.error('启动任务失败', {
                description: cause instanceof Error ? cause.message : String(cause),
              })
            })
        }}
        onRetryTeambition={(item) => {
          const bindingId = item.teambition?.bindingId
          if (!workspaceRoot || !bindingId) return
          void window.electronAPI.teambition.retrySync(workspaceRoot, bindingId)
            .then(() => onTaskCreated?.())
            .catch((cause: unknown) => {
              toast.error('重试 Teambition 同步失败', {
                description: cause instanceof Error ? cause.message : String(cause),
              })
            })
        }}
        composer={composer}
      />
      {workspaceRoot && workspace && (
        <TeambitionPicker
          open={teambitionPickerOpen}
          onOpenChange={setTeambitionPickerOpen}
          workspaceRoot={workspaceRoot}
          workspaceId={workspace.id}
          localProjectId={selectedProjectId ?? undefined}
          onClaimed={(session) => {
            onSessionCreated?.(session)
            void onTaskCreated?.()
          }}
        />
      )}
    </div>
  )
}
