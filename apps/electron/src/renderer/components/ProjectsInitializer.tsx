import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'
import { sessionGroupsAtom } from '@/atoms/session-groups-atoms'

/**
 * ProjectsInitializer
 *
 * 按当前工作区加载 craft Project 列表 + 会话自定义分组列表进全局 atom，并订阅 projects 变更广播
 * （分组没有广播通道，增删改由发起操作的组件直接更新 atom）。
 * Code 侧边栏与 Work 看板共享同一份项目状态（对齐 craft 的 projectsAtom 模式）。
 */
export function ProjectsInitializer(): null {
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setProjects = useSetAtom(serverKanbanProjectsAtom)
  const setSessionGroups = useSetAtom(sessionGroupsAtom)

  const currentSlug = workspaces.find((candidate) => candidate.id === currentWorkspaceId)?.slug ?? null

  useEffect(() => {
    let cancelled = false
    // 切换工作区先清空，避免其他消费方短暂渲染上一个工作区的项目
    setProjects([])
    setSessionGroups([])
    if (!currentSlug) return

    // 广播比初始加载新：若订阅期间已收到本工作区广播，丢弃较慢的初始快照
    let broadcastArrived = false
    const off = window.electronAPI.projects.onChanged((event) => {
      // 广播里的 workspaceId 是 workspace slug（主进程 basename(workspaceRoot)）
      if (event.workspaceId !== currentSlug) return
      broadcastArrived = true
      setProjects(event.projects)
    })

    window.electronAPI.getWorkspaceRootPath(currentSlug)
      .then((root) => window.electronAPI.projects.list(root))
      .then((projects) => {
        if (!cancelled && !broadcastArrived) setProjects(projects)
      })
      .catch((error: unknown) => {
        console.error('[ProjectsInitializer] 加载项目列表失败:', error)
        if (!cancelled && !broadcastArrived) setProjects([])
      })

    window.electronAPI.sessionGroups.list(currentSlug)
      .then((groups) => {
        if (!cancelled) setSessionGroups(groups)
      })
      .catch((error: unknown) => {
        console.error('[ProjectsInitializer] 加载会话分组失败:', error)
        if (!cancelled) setSessionGroups([])
      })

    return () => {
      cancelled = true
      off()
    }
  }, [currentSlug, setProjects, setSessionGroups])

  return null
}
