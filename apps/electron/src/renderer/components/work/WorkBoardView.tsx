import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { FolderKanban, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import {
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import {
  kanbanItemsAtom,
  kanbanSpecNodesAtom,
  kanbanTaskExpertIdsAtom,
  serverKanbanRunsAtom,
  serverKanbanSessionsAtom,
  serverTaskSummariesAtom,
  serverTeambitionBindingsAtom,
} from '@/atoms/kanban-atoms'
import {
  selectedKanbanProjectAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { ProjectPage } from '@/components/project/ProjectPage'
import { Button } from '@/components/ui/button'
import { KanbanBoardContainer } from '@/components/app-shell/kanban/KanbanBoardContainer'
import type { SpecNodeSummary } from '@/components/app-shell/kanban/subtask-merge'
import type { KanbanItem, KanbanProject, KanbanTaskRun } from '@/components/app-shell/kanban/types'
import { useOpenSession } from '@/hooks/useOpenSession'
import { ProjectSettingsDialog } from './ProjectSettingsDialog'
import { buildKanbanTaskRun } from './work-board-model'

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function upsertProject(projects: KanbanProject[], project: KanbanProject): KanbanProject[] {
  const existingIndex = projects.findIndex((candidate) => candidate.id === project.id)
  if (existingIndex === -1) return [...projects, project]
  return projects.map((candidate) => candidate.id === project.id ? project : candidate)
}

export function WorkBoardView(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? workspaces[0] ?? null
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom)
  const selectedProject = useAtomValue(selectedKanbanProjectAtom)
  const [workView, setWorkView] = useAtom(workViewAtom)
  const setSessions = useSetAtom(serverKanbanSessionsAtom)
  const [taskSummaries, setTaskSummaries] = useAtom(serverTaskSummariesAtom)
  const setRuns = useSetAtom(serverKanbanRunsAtom)
  const setBindings = useSetAtom(serverTeambitionBindingsAtom)
  const setSpecNodes = useSetAtom(kanbanSpecNodesAtom)
  const setTaskExpertIds = useSetAtom(kanbanTaskExpertIdsAtom)
  const kanbanItems = useAtomValue(kanbanItemsAtom)
  const streamStates = useAtomValue(agentStreamingStatesAtom)
  const openSession = useOpenSession()
  const store = useStore()
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  React.useEffect(() => {
    setSessions(agentSessions)
  }, [agentSessions, setSessions])

  React.useEffect(() => {
    let cancelled = false
    // 项目 atom 的生命周期由全局 ProjectsInitializer 管理（工作区切换时按 slug 重载），WorkBoardView 不再清空
    // 挂载/工作区切换时不再重置 view 与 selectedProjectId：跨模式跳转（Code 侧边栏「项目详情」）
    // 需要保留这两个 atom 状态；无效 selectedProjectId 由下方效果收敛（清空选择并回到看板）。
    setRuns([])
    setTaskSummaries([])
    setBindings([])
    setSpecNodes(new Map())
    setTaskExpertIds(new Map())
    setWorkspaceRoot(null)
    setError(null)
    if (!workspace) return () => { cancelled = true }

    setLoading(true)
    void window.electronAPI.getWorkspaceRootPath(workspace.slug)
      .then((root) => {
        if (!cancelled) setWorkspaceRoot(root)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(`加载工作区失败：${errorMessage(cause)}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [setBindings, setRuns, setSpecNodes, setTaskExpertIds, setTaskSummaries, workspace])

  const refreshSessions = React.useCallback(async (): Promise<void> => {
    const sessions = await window.electronAPI.listAgentSessions()
    setAgentSessions(sessions)
  }, [setAgentSessions])

  const refreshProjects = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const nextProjects = await window.electronAPI.projects.list(workspaceRoot)
    setProjects(nextProjects)
  }, [setProjects, workspaceRoot])

  const refreshTasks = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspace) return
    const summaries = await window.electronAPI.tasks.listSummaries(workspaceRoot, workspace.id)
    setTaskSummaries(summaries)
  }, [setTaskSummaries, workspace, workspaceRoot])

  React.useEffect(() => {
    if (!selectedProjectId || projects.some((project) => project.id === selectedProjectId)) return
    setSelectedProjectId(null)
  }, [projects, selectedProjectId, setSelectedProjectId])

  const refreshRuns = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const taskRefs = new Map<string, { slug: string; runId?: string }>()
    for (const task of taskSummaries ?? []) {
      const linkedSession = task.orchestratorSessionId
        ? agentSessions.find((session) => session.id === task.orchestratorSessionId)
        : agentSessions.find((session) => session.taskSlug === task.taskSlug && !session.parentSessionId)
      const runId = linkedSession?.taskRunId
      const key = `${task.taskSlug}:${runId ?? ''}`
      taskRefs.set(key, { slug: task.taskSlug, ...(runId ? { runId } : {}) })
    }

    const runs = await Promise.all(Array.from(taskRefs.values()).map(async ({ slug, runId }) => {
      const results = await window.electronAPI.tasks.getResults(workspaceRoot, slug, runId)
      return results ? buildKanbanTaskRun(slug, results) : null
    }))
    setRuns(runs.filter((run): run is KanbanTaskRun => run !== null))
  }, [agentSessions, setRuns, taskSummaries, workspaceRoot])

  const refreshSpecNodes = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const slugs = (taskSummaries ?? []).map((task) => task.taskSlug)
    const results = await Promise.all(slugs.map(async (slug) => {
      try {
        const validation = await window.electronAPI.tasks.get(workspaceRoot, slug)
        if (!validation?.valid || !validation.spec?.nodes) {
          return { slug, nodes: [] as SpecNodeSummary[], expertId: undefined as string | undefined }
        }
        const nodes: SpecNodeSummary[] = validation.spec.nodes.map((node) => ({
          id: node.id,
          title: node.title ?? node.id,
          ...(node.model ? { model: node.model } : {}),
        }))
        const expertId = validation.spec.defaults?.expertId?.trim() || undefined
        return { slug, nodes, expertId }
      } catch {
        return { slug, nodes: [] as SpecNodeSummary[], expertId: undefined as string | undefined }
      }
    }))
    setSpecNodes(new Map(results.map((entry) => [entry.slug, entry.nodes])))
    setTaskExpertIds(new Map(
      results
        .filter((entry): entry is typeof entry & { expertId: string } => Boolean(entry.expertId))
        .map((entry) => [entry.slug, entry.expertId]),
    ))
  }, [agentSessions, setSpecNodes, setTaskExpertIds, taskSummaries, workspaceRoot])

  const refreshBindings = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const bindings = await window.electronAPI.teambition.listBindings(workspaceRoot)
    setBindings(bindings.map((binding) => ({
      bindingId: binding.id,
      sessionId: binding.sessionId,
      taskId: binding.remoteTaskId,
      title: binding.remoteTitle,
      ...(binding.remoteStatus ? { status: binding.remoteStatus } : {}),
      syncState: binding.syncState,
      ...(binding.error ? { error: binding.error } : {}),
    })))
  }, [setBindings, workspaceRoot])

  const refreshAll = React.useCallback(async (): Promise<void> => {
    await Promise.all([refreshSessions(), refreshTasks()])
    await Promise.all([refreshProjects(), refreshRuns(), refreshBindings(), refreshSpecNodes()])
  }, [refreshBindings, refreshProjects, refreshRuns, refreshSessions, refreshSpecNodes, refreshTasks])

  // Conductor 派生子会话时主进程不会主动推列表；运行中短轮询保持卡片/进度实时
  const needsLivePoll = kanbanItems.some((item) => item.isProcessing)
    || [...streamStates.values()].some((state) => state.running)
  React.useEffect(() => {
    if (!workspaceRoot || !needsLivePoll) return
    const timer = window.setInterval(() => {
      void refreshSessions().then(() => Promise.all([refreshRuns(), refreshSpecNodes(), refreshTasks()]))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [needsLivePoll, refreshRuns, refreshSessions, refreshSpecNodes, refreshTasks, workspaceRoot])

  // 最后一个 stream 结束时补一次收口读取，确保 Run 将 workflow 推到 needs-review 后立即反映。
  const previousLivePollRef = React.useRef(false)
  React.useEffect(() => {
    const wasLive = previousLivePollRef.current
    previousLivePollRef.current = needsLivePoll
    if (!workspaceRoot || !wasLive || needsLivePoll) return
    void Promise.all([refreshSessions(), refreshTasks(), refreshRuns(), refreshSpecNodes()])
  }, [needsLivePoll, refreshRuns, refreshSessions, refreshSpecNodes, refreshTasks, workspaceRoot])

  React.useEffect(() => {
    if (!workspaceRoot) return
    void refreshTasks().catch((cause: unknown) => {
      setError(`加载 Task 列表失败：${errorMessage(cause)}`)
    })
  }, [refreshTasks, workspaceRoot])

  React.useEffect(() => {
    if (!workspaceRoot) return
    void refreshRuns().catch((cause: unknown) => {
      setError(`加载任务进度失败：${errorMessage(cause)}`)
    })
  }, [refreshRuns, workspaceRoot])

  React.useEffect(() => {
    if (!workspaceRoot) return
    void refreshSpecNodes().catch((cause: unknown) => {
      setError(`加载任务定义失败：${errorMessage(cause)}`)
    })
  }, [refreshSpecNodes, workspaceRoot])

  React.useEffect(() => {
    if (!workspaceRoot) return
    void refreshBindings().catch((cause: unknown) => {
      setError(`加载 Teambition 绑定失败：${errorMessage(cause)}`)
    })
  }, [refreshBindings, workspaceRoot])

  // projects.onChanged 广播由全局 ProjectsInitializer 统一写入项目 atom，这里只处理任务生成事件
  React.useEffect(() => {
    if (!workspace) return
    const offGenerated = window.electronAPI.tasks.onGenerated((event) => {
      if (event.workspaceId === workspace.id) {
        void Promise.all([refreshSessions(), refreshTasks()])
          .then(() => Promise.all([refreshRuns(), refreshSpecNodes()]))
      }
    })
    return offGenerated
  }, [refreshRuns, refreshSessions, refreshSpecNodes, refreshTasks, workspace])

  const handleOpenItem = React.useCallback((item: KanbanItem): void => {
    const linkedSession = agentSessions.find((session) => session.id === item.session.id)
    if (!linkedSession) {
      toast.info('该 Task 暂无可打开的编排会话', {
        description: item.task?.health === 'error'
          ? '请先处理 Task 恢复诊断。'
          : 'Task 定义仍可在看板中管理。',
      })
      return
    }
    openSession('agent', linkedSession.id, linkedSession.title)
  }, [agentSessions, openSession])

  const handleOpenSubtask = React.useCallback((sessionId: string): void => {
    const session = agentSessions.find((candidate) => candidate.id === sessionId)
    if (session) openSession('agent', session.id, session.title)
  }, [agentSessions, openSession])

  const handleProjectChanged = React.useCallback((project: KanbanProject): void => {
    setProjects((current) => upsertProject(current, project))
    // 归档后列表默认隐藏该项；若仍保持选中会导致看板过滤到「看不见的项目」
    if (project.archivedAt && selectedProjectId === project.id) {
      setSelectedProjectId(null)
    }
  }, [selectedProjectId, setProjects, setSelectedProjectId])

  const handleProjectDeleted = React.useCallback((projectId: string): void => {
    setProjects((current) => current.filter((project) => project.id !== projectId))
    if (selectedProjectId === projectId) setSelectedProjectId(null)
  }, [selectedProjectId, setProjects, setSelectedProjectId])

  const handleOpenSession = React.useCallback((sessionId: string): void => {
    const session = agentSessions.find((candidate) => candidate.id === sessionId)
    if (session) openSession('agent', session.id, session.title)
  }, [agentSessions, openSession])

  const handleRefresh = async (): Promise<void> => {
    setError(null)
    setLoading(true)
    try {
      await refreshAll()
    } catch (cause) {
      setError(`刷新 Task 数据失败：${errorMessage(cause)}`)
    } finally {
      setLoading(false)
    }
  }

  if (!workspace) {
    return (
      <div className="grid h-full place-items-center bg-background p-6">
        <div className="max-w-sm text-center">
          <FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="font-semibold">请先创建 Code 工作区</h1>
          <p className="mt-1 text-sm text-muted-foreground">Task 与 Project 数据按 Workspace 隔离。</p>
        </div>
      </div>
    )
  }

  if (!workspaceRoot) {
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-sm text-muted-foreground">
        {loading ? '正在加载 Task 工作区…' : (error ?? '无法加载 Task 工作区')}
      </div>
    )
  }

  if (workView === 'project' && selectedProject && workspaceRoot) {
    return (
      <ProjectPage
        workspaceRoot={workspaceRoot}
        project={selectedProject}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-background p-3">
      {/* Header: 项目名称 + 设置 + 刷新
          顶部 50px 是 AppShell 全局窗口拖动区（app-region 按矩形并集计算，与 z-index 无关），
          不声明 no-drag 的按钮点击会被当成窗口拖动吞掉——对齐 SessionHeader 的模式：
          整行声明 drag-region 保留空白处拖窗口能力，交互区声明 no-drag 保证可点击。 */}
      <div className="titlebar-drag-region flex min-h-9 items-center justify-between rounded-xl bg-card px-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          {selectedProject ? (
            <>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedProject.color ?? 'hsl(var(--muted-foreground))' }}
              />
              <button
                type="button"
                onClick={() => setWorkView('project')}
                className="titlebar-no-drag truncate rounded px-1 py-0.5 text-[13px] font-medium hover:bg-foreground/[0.06] hover:text-primary transition-colors"
                title="打开项目详情"
              >
                {selectedProject.name}
              </button>
            </>
          ) : (
            <span className="text-[13px] text-foreground/50">全部 Task</span>
          )}
        </div>
        <div className="titlebar-no-drag flex items-center gap-1">
          {selectedProject && workspaceRoot && (
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void handleRefresh()}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <KanbanBoardContainer
            onOpenItem={handleOpenItem}
            onOpenSubtask={handleOpenSubtask}
            onSessionCreated={(session) => {
              setAgentSessions((current) => [session, ...current.filter((candidate) => candidate.id !== session.id)])
            }}
            onTaskCreated={async (created) => {
              await refreshAll()
              if (!created?.ran || !created.sessionId) return
              const session = store.get(agentSessionsAtom).find((candidate) => candidate.id === created.sessionId)
              openSession(
                'agent',
                created.sessionId,
                session?.title ?? created.slug ?? '任务编排',
              )
            }}
          />
        </div>
      </div>

      {/* 设置弹窗 */}
      {selectedProject && workspaceRoot && (
        <ProjectSettingsDialog
          open={settingsOpen}
          workspaceRoot={workspaceRoot}
          project={selectedProject}
          onOpenChange={setSettingsOpen}
          onProjectChanged={handleProjectChanged}
        />
      )}
    </div>
  )
}
