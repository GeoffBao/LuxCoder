import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai'
import { FolderKanban, Info, LayoutDashboard, RefreshCw } from 'lucide-react'
import {
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import {
  kanbanItemsAtom,
  kanbanSpecNodesAtom,
  serverKanbanRunsAtom,
  serverKanbanSessionsAtom,
  serverTeambitionBindingsAtom,
} from '@/atoms/kanban-atoms'
import {
  selectedKanbanProjectAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { Button } from '@/components/ui/button'
import { KanbanBoardContainer } from '@/components/app-shell/kanban/KanbanBoardContainer'
import type { SpecNodeSummary } from '@/components/app-shell/kanban/subtask-merge'
import type { KanbanItem, KanbanProject, KanbanTaskRun } from '@/components/app-shell/kanban/types'
import { useOpenSession } from '@/hooks/useOpenSession'
import { ProjectInfoPage } from './ProjectInfoPage'
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
  const setSessions = useSetAtom(serverKanbanSessionsAtom)
  const setRuns = useSetAtom(serverKanbanRunsAtom)
  const setBindings = useSetAtom(serverTeambitionBindingsAtom)
  const setSpecNodes = useSetAtom(kanbanSpecNodesAtom)
  const kanbanItems = useAtomValue(kanbanItemsAtom)
  const streamStates = useAtomValue(agentStreamingStatesAtom)
  const openSession = useOpenSession()
  const store = useStore()
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)
  const [view, setView] = useAtom(workViewAtom)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setSessions(agentSessions)
  }, [agentSessions, setSessions])

  React.useEffect(() => {
    let cancelled = false
    // 项目 atom 的生命周期由全局 ProjectsInitializer 管理（工作区切换时按 slug 重载），WorkBoardView 不再清空
    // 挂载/工作区切换时不再重置 view 与 selectedProjectId：跨模式跳转（Code 侧边栏「项目详情」）
    // 需要保留这两个 atom 状态；无效 selectedProjectId 由下方效果收敛（清空选择并回到看板）。
    setRuns([])
    setBindings([])
    setSpecNodes(new Map())
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
  }, [setBindings, setRuns, setSpecNodes, workspace])

  const refreshSessions = React.useCallback(async (): Promise<void> => {
    const sessions = await window.electronAPI.listAgentSessions()
    setAgentSessions(sessions)
  }, [setAgentSessions])

  const refreshProjects = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const nextProjects = await window.electronAPI.projects.list(workspaceRoot)
    setProjects(nextProjects)
  }, [setProjects, workspaceRoot])

  React.useEffect(() => {
    if (!selectedProjectId || projects.some((project) => project.id === selectedProjectId)) return
    setSelectedProjectId(null)
    setView('board')
  }, [projects, selectedProjectId, setSelectedProjectId, setView])

  const refreshRuns = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const taskRefs = new Map<string, { slug: string; runId?: string }>()
    for (const session of agentSessions) {
      if (!session.taskSlug) continue
      const key = `${session.taskSlug}:${session.taskRunId ?? ''}`
      taskRefs.set(key, {
        slug: session.taskSlug,
        ...(session.taskRunId ? { runId: session.taskRunId } : {}),
      })
    }

    const runs = await Promise.all(Array.from(taskRefs.values()).map(async ({ slug, runId }) => {
      const results = await window.electronAPI.tasks.getResults(workspaceRoot, slug, runId)
      return results ? buildKanbanTaskRun(slug, results) : null
    }))
    setRuns(runs.filter((run): run is KanbanTaskRun => run !== null))
  }, [agentSessions, setRuns, workspaceRoot])

  const refreshSpecNodes = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    const slugs = [...new Set(agentSessions.map((session) => session.taskSlug).filter((slug): slug is string => Boolean(slug)))]
    const entries: Array<[string, SpecNodeSummary[]]> = await Promise.all(slugs.map(async (slug) => {
      try {
        const validation = await window.electronAPI.tasks.get(workspaceRoot, slug)
        if (!validation?.valid || !validation.spec?.nodes) return [slug, []]
        const nodes: SpecNodeSummary[] = validation.spec.nodes.map((node) => ({
          id: node.id,
          title: node.title ?? node.id,
          ...(node.model ? { model: node.model } : {}),
        }))
        return [slug, nodes]
      } catch {
        return [slug, []]
      }
    }))
    setSpecNodes(new Map(entries))
  }, [agentSessions, setSpecNodes, workspaceRoot])

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
    await refreshSessions()
    await Promise.all([refreshProjects(), refreshRuns(), refreshBindings(), refreshSpecNodes()])
  }, [refreshBindings, refreshProjects, refreshRuns, refreshSessions, refreshSpecNodes])

  // Conductor 派生子会话时主进程不会主动推列表；运行中短轮询保持卡片/进度实时
  const needsLivePoll = kanbanItems.some((item) => item.isProcessing)
    || [...streamStates.values()].some((state) => state.running)
  React.useEffect(() => {
    if (!workspaceRoot || !needsLivePoll) return
    const timer = window.setInterval(() => {
      void refreshSessions().then(() => Promise.all([refreshRuns(), refreshSpecNodes()]))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [needsLivePoll, refreshRuns, refreshSessions, refreshSpecNodes, workspaceRoot])

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
        void refreshSessions().then(() => Promise.all([refreshRuns(), refreshSpecNodes()]))
      }
    })
    return offGenerated
  }, [refreshRuns, refreshSessions, refreshSpecNodes, workspace])

  const handleOpenItem = React.useCallback((item: KanbanItem): void => {
    openSession('agent', item.session.id, item.session.title)
  }, [openSession])

  const handleOpenSubtask = React.useCallback((sessionId: string): void => {
    const session = agentSessions.find((candidate) => candidate.id === sessionId)
    if (session) openSession('agent', session.id, session.title)
  }, [agentSessions, openSession])

  const handleProjectChanged = React.useCallback((project: KanbanProject): void => {
    setProjects((current) => upsertProject(current, project))
    // 归档后列表默认隐藏该项；若仍保持选中会导致看板过滤到「看不见的项目」
    if (project.archivedAt && selectedProjectId === project.id) {
      setSelectedProjectId(null)
      setView('board')
    }
  }, [selectedProjectId, setProjects, setSelectedProjectId, setView])

  const handleProjectDeleted = React.useCallback((projectId: string): void => {
    setProjects((current) => current.filter((project) => project.id !== projectId))
    if (selectedProjectId === projectId) setSelectedProjectId(null)
    setView('board')
  }, [selectedProjectId, setProjects, setSelectedProjectId, setView])

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
      setError(`刷新 Work 数据失败：${errorMessage(cause)}`)
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
          <p className="mt-1 text-sm text-muted-foreground">Projects 与 Kanban 数据按工作区隔离。</p>
        </div>
      </div>
    )
  }

  if (!workspaceRoot) {
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-sm text-muted-foreground">
        {loading ? '正在加载 Work 工作区…' : (error ?? '无法加载 Work 工作区')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-background p-3">
      <div className="flex min-h-9 items-center justify-between rounded-xl bg-card px-2 shadow-sm">
        <div className="flex items-center gap-1">
          <Button size="sm" variant={view === 'board' ? 'secondary' : 'ghost'} onClick={() => setView('board')}>
            <LayoutDashboard className="h-4 w-4" />看板
          </Button>
          <Button
            size="sm"
            variant={view === 'project' ? 'secondary' : 'ghost'}
            disabled={!selectedProject}
            onClick={() => setView('project')}
          >
            <Info className="h-4 w-4" />项目详情
          </Button>
        </div>
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => void handleRefresh()}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error && (
          <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          {view === 'project' && selectedProject ? (
            <ProjectInfoPage
              workspaceRoot={workspaceRoot}
              project={selectedProject}
              sessions={agentSessions}
              onProjectChanged={handleProjectChanged}
              onDeleted={handleProjectDeleted}
              onOpenSession={handleOpenSession}
            />
          ) : (
            <KanbanBoardContainer
              onOpenItem={handleOpenItem}
              onOpenSubtask={handleOpenSubtask}
              onSessionCreated={(session) => {
                setAgentSessions((current) => [session, ...current.filter((candidate) => candidate.id !== session.id)])
              }}
              onTaskCreated={async (created) => {
                await refreshAll()
                // 仅「创建并运行」/看板运行后进入编排会话；纯创建留在看板
                if (!created?.ran || !created.sessionId) return
                const session = store.get(agentSessionsAtom).find((candidate) => candidate.id === created.sessionId)
                openSession(
                  'agent',
                  created.sessionId,
                  session?.title ?? created.slug ?? '任务编排',
                )
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
