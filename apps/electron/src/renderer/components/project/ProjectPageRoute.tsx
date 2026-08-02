import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import {
  activeProjectPageIdAtom,
  codeMainViewAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { serverTaskSummariesAtom } from '@/atoms/kanban-atoms'
import { Button } from '@/components/ui/button'
import { buildTaskBoardNavigation } from '@/components/app-shell/code-main-view-model'
import { ProjectPage } from './ProjectPage'

export function ProjectPageRoute(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const setProjects = useSetAtom(serverKanbanProjectsAtom)
  const projectId = useAtomValue(activeProjectPageIdAtom)
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setTaskSummaries = useSetAtom(serverTaskSummariesAtom)
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)
  const [taskSummariesLoaded, setTaskSummariesLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? workspaces[0] ?? null
  const project = projects.find((candidate) => candidate.id === projectId) ?? null

  const openTaskBoard = React.useCallback((facetProjectId: string | null): void => {
    const navigation = buildTaskBoardNavigation(facetProjectId)
    setSelectedProjectId(navigation.selectedProjectId)
    setCodeMainView(navigation.codeMainView)
    setActiveView(navigation.activeView)
  }, [setActiveView, setCodeMainView, setSelectedProjectId])

  React.useEffect(() => {
    let cancelled = false
    setWorkspaceRoot(null)
    setTaskSummariesLoaded(false)
    setTaskSummaries(undefined)
    setError(null)
    if (!workspace) return () => { cancelled = true }

    void window.electronAPI.getWorkspaceRootPath(workspace.slug)
      .then(async (root) => {
        const summaries = await window.electronAPI.tasks.listSummaries(root, workspace.id)
        if (!cancelled) {
          setTaskSummaries(summaries)
          setTaskSummariesLoaded(true)
          setWorkspaceRoot(root)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => { cancelled = true }
  }, [setTaskSummaries, workspace])

  if (!workspace || !project) {
    return (
      <div className="grid h-full place-items-center bg-background p-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">无法找到该 Project。</p>
          <Button className="mt-3" size="sm" onClick={() => openTaskBoard(null)}>返回 Project 看板</Button>
        </div>
      </div>
    )
  }

  if (!workspaceRoot || !taskSummariesLoaded) {
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-sm text-muted-foreground">
        {error ? `加载 Project 失败：${error}` : '正在加载 Project…'}
      </div>
    )
  }

  return (
    <ProjectPage
      workspaceRoot={workspaceRoot}
      project={project}
      onProjectChanged={(updated) => {
        setProjects((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))
      }}
    />
  )
}
