import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'

/**
 * ProjectsInitializer
 *
 * 按当前工作区加载 craft Project 列表进全局 atom，并订阅 projects 变更广播。
 * Code 侧边栏与 Work 看板共享同一份项目状态（对齐 craft 的 projectsAtom 模式）。
 */
export function ProjectsInitializer(): null {
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setProjects = useSetAtom(serverKanbanProjectsAtom)

  const currentSlug = workspaces.find((candidate) => candidate.id === currentWorkspaceId)?.slug ?? null

  useEffect(() => {
    let cancelled = false
    if (!currentSlug) {
      setProjects([])
      return () => { cancelled = true }
    }
    window.electronAPI.getWorkspaceRootPath(currentSlug)
      .then((root) => window.electronAPI.projects.list(root))
      .then((projects) => { if (!cancelled) setProjects(projects) })
      .catch((error: unknown) => {
        console.error('[ProjectsInitializer] 加载项目列表失败:', error)
        if (!cancelled) setProjects([])
      })
    return () => { cancelled = true }
  }, [currentSlug, setProjects])

  useEffect(() => {
    if (!currentSlug) return
    // 广播里的 workspaceId 是 workspace slug（主进程 basename(workspaceRoot)）
    const off = window.electronAPI.projects.onChanged((event) => {
      if (event.workspaceId !== currentSlug) return
      setProjects(event.projects)
    })
    return off
  }, [currentSlug, setProjects])

  return null
}
