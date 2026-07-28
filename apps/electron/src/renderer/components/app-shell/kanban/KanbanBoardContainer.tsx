import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcoder/shared'
import {
  agentModelIdAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { tabsAtom, updateTabTitle } from '@/atoms/tab-atoms'
import { channelsAtom, channelsLoadedAtom } from '@/atoms/chat-atoms'
import {
  boardModeAtom,
  kanbanItemsAtom,
  kanbanNotificationsAtom,
  moveCardAtom,
  serverTaskSummariesAtom,
} from '@/atoms/kanban-atoms'
import {
  pendingTaskEditorTargetAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCloseTab } from '@/hooks/useCloseTab'
import { BoardListToggle } from './BoardListToggle'
import { consumeFirstNotification } from './board-model'
import { buildKanbanModelCatalog } from './kanban-model-catalog'
import { KanbanBoard } from './KanbanBoard'
import { KanbanProjectFilter } from './KanbanProjectFilter'
import { NewTaskComposer } from './NewTaskComposer'
import { TaskEditor } from './TaskEditor'
import { resolveTaskEditorTarget } from './task-editor-model'
import type { KanbanItem, TaskEditorTarget } from './types'

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
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom)
  const [mode, setMode] = useAtom(boardModeAtom)
  const [notifications, setNotifications] = useAtom(kanbanNotificationsAtom)
  const moveCard = useSetAtom(moveCardAtom)
  const setTaskSummaries = useSetAtom(serverTaskSummariesAtom)
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
  const pendingEditorTarget = useAtomValue(pendingTaskEditorTargetAtom)
  const setPendingEditorTarget = useSetAtom(pendingTaskEditorTargetAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setTabs = useSetAtom(tabsAtom)
  const { executeClose } = useCloseTab()
  const [pendingDeleteItem, setPendingDeleteItem] = React.useState<KanbanItem | null>(null)

  const { groups: modelGroups, modelToConnection } = React.useMemo(
    () => buildKanbanModelCatalog(channels),
    [channels],
  )

  // 消费跨视图打开 TaskEditor 的请求（项目中心「新建任务」/ 会话 header「编辑任务」）
  React.useEffect(() => {
    if (!pendingEditorTarget) return
    setEditorTarget(pendingEditorTarget)
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

  // 点击卡片本体：始终打开对应会话（对齐 craft——卡片点击=查看对话，编辑是另一个
  // 独立入口，两者不再按是否绑定 task spec 二选一）。
  const openItem = (item: KanbanItem): void => {
    onOpenItem?.(item)
  }

  // 恢复诊断卡片没有真实 Session，不能把 synthetic id 当成 Session 写回。
  const editItem = (item: KanbanItem): void => {
    if (item.hasSession === false) {
      toast.info('该 Task 暂无可编辑的编排会话', { description: '请先处理 Task 恢复诊断。' })
      return
    }
    setEditorTarget(resolveTaskEditorTarget(item))
  }

  // 正式看板的标题/归档属于 Task；legacy Session 看板才继续操作 Session。
  const renameItem = (item: KanbanItem, newTitle: string): void => {
    if (item.task && !item.task.legacyIdentity && workspaceRoot && workspace) {
      void window.electronAPI.tasks.updateMetadata(workspaceRoot, workspace.id, item.task.taskId, {
        title: newTitle,
        expectedRevision: item.task.revision,
      }).then((updated) => {
        setTaskSummaries((tasks) => tasks?.map((task) => task.taskId === updated.taskId ? updated : task))
      }).catch((cause: unknown) => {
        toast.error('重命名 Task 失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
      return
    }
    void window.electronAPI.updateAgentSessionTitle(item.session.id, newTitle)
      .then((updated) => {
        setAgentSessions((prev) => prev.map((session) => session.id === updated.id ? updated : session))
        setTabs((prev) => updateTabTitle(prev, item.session.id, newTitle))
      })
      .catch((cause: unknown) => {
        toast.error('重命名失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
  }

  const archiveItem = (item: KanbanItem): void => {
    if (item.task && !item.task.legacyIdentity && workspaceRoot && workspace) {
      void window.electronAPI.tasks.updateMetadata(workspaceRoot, workspace.id, item.task.taskId, {
        archived: !item.task.archivedAt,
        expectedRevision: item.task.revision,
      }).then((updated) => {
        setTaskSummaries((tasks) => tasks?.map((task) => task.taskId === updated.taskId ? updated : task))
        toast.success(updated.archivedAt ? 'Task 已归档' : 'Task 已取消归档')
      }).catch((cause: unknown) => {
        toast.error('归档 Task 失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
      return
    }
    void window.electronAPI.toggleArchiveAgentSession(item.session.id)
      .then((updated) => {
        setAgentSessions((prev) => prev.map((session) => session.id === updated.id ? updated : session))
        if (updated.archived) executeClose(item.session.id)
        toast.success(updated.archived ? '已归档' : '已取消归档')
      })
      .catch((cause: unknown) => {
        toast.error('归档失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
  }

  // 右键菜单「删除」：先弹确认框（见下方 AlertDialog），确认后才真正删除。
  const confirmDeleteItem = (): void => {
    if (!pendingDeleteItem) return
    const sessionId = pendingDeleteItem.session.id
    void window.electronAPI.deleteAgentSession(sessionId)
      .then(() => {
        setAgentSessions((prev) => prev.filter((s) => s.id !== sessionId))
        executeClose(sessionId)
        toast.success('已删除')
      })
      .catch((cause: unknown) => {
        toast.error('删除失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
      .finally(() => setPendingDeleteItem(null))
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
          <h1 className="text-lg font-semibold">Task 看板</h1>
          <p className="text-xs text-muted-foreground">{items.length} 个正式 Task</p>
        </div>
        <div className="flex items-center gap-2">
          <KanbanProjectFilter projects={projects} value={selectedProjectId} onChange={setSelectedProjectId} />
          <BoardListToggle value={mode} onChange={setMode} />
        </div>
      </header>
      <KanbanBoard
        items={items}
        mode={mode}
        onMove={(itemId, columnId) => {
          void moveCard({
            itemId,
            columnId,
            ...(workspaceRoot ? { workspaceRoot } : {}),
            ...(workspace ? { workspaceId: workspace.id } : {}),
          })
        }}
        onOpenItem={openItem}
        onEditItem={editItem}
        onRenameItem={renameItem}
        onArchiveItem={archiveItem}
        onDeleteItem={(item) => {
          if (item.task && !item.task.legacyIdentity) {
            toast.info('永久删除 Task 暂未开放', { description: '请先归档；安全删除将在影响预览中提供。' })
            return
          }
          setPendingDeleteItem(item)
        }}
        onOpenSubtask={onOpenSubtask}
        onRunTask={(item) => {
          const taskSlug = item.task?.taskSlug ?? item.session.taskSlug
          if (!workspaceRoot || !workspace || !taskSlug) return
          const orchestratorSessionId = item.hasSession === false ? undefined : item.session.id
          void window.electronAPI.tasks.run(workspaceRoot, workspace.id, taskSlug, {
            ...(orchestratorSessionId ? { orchestratorSessionId } : {}),
          })
            .then(async () => {
              toast.success('任务已开始运行')
              await onTaskCreated?.({
                sessionId: orchestratorSessionId ?? '',
                slug: taskSlug,
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
      <AlertDialog
        open={pendingDeleteItem !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteItem(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除任务</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，确定要删除「{pendingDeleteItem?.title}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
