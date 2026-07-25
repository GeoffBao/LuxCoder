/**
 * SidebarProjectsTab — Projects Tab 内容（Hermes 风格：项目 → 会话分组）
 *
 * 用于 LeftSidebar 的「项目」Tab：
 * - 项目按最近会话活跃度排序，点击项目行展开/折叠其下会话（updatedAt 倒序）
 * - hover 项目行浮现「+」（新建该项目会话）、「归档」快捷按钮与「⋯」（看板/新建任务/项目设置/归档/删除）
 * - 右键 / 双指点击项目行 = 与「⋯」相同的操作菜单（ContextMenu 与 DropdownMenu 共用同一份菜单项）
 * - 项目行右侧聚合注意力点：取组内会话最高优先级状态（blocked > running > completed）
 * - 纯粹的「按项目浏览」视图：无项目的会话不在此展示，统一去「会话」Tab 查看/迁移
 * - 对齐品类收敛方向：项目分组 + 组内时间倒序（Conductor/Superset/Synara/Orca/craft 均如此）
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { cn } from '@/lib/utils'
import {
  agentSessionsAtom,
  agentSessionIndicatorMapAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { activeSessionIdAtom } from '@/atoms/tab-atoms'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import {
  codeMainViewAtom,
  pendingTaskEditorTargetAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { showArchivedProjectsAtom } from '@/atoms/project-context-picker'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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
import { CreateProjectDialog } from '@/components/work/CreateProjectDialog'
import { ProjectSettingsDialog } from '@/components/work/ProjectSettingsDialog'
import { AgentSessionItem, getSessionLeftAccent } from './AgentSessionItem'
import type { KanbanProject } from './kanban/types'
import {
  filterGroupableSessions,
  groupSessionsByProject,
  resolveProjectAttention,
  sortProjectsByActivity,
} from './sidebar-projects-model'

/** 会话行操作回调包：由 LeftSidebar 传入，与会话 Tab 共享同一批 handler，行为完全一致 */
export interface ProjectSessionHandlers {
  onSelectSession: (id: string, title: string) => void
  onRequestDelete: (id: string) => void
  onRequestMove: (id: string) => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string, cascade: boolean) => Promise<void>
  onToggleStar: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
  onMoveToProject: (sessionId: string, projectId?: string) => void | Promise<void>
  /** 在项目下新建会话（draft，预绑定 projectId） */
  onNewSessionInProject: (projectId: string) => void | Promise<void>
}

interface SidebarProjectsTabProps {
  workspaceRoot: string | null
  sessionHandlers: ProjectSessionHandlers
}

/** 项目行聚合注意力点的优先级：blocked > running > completed（学 Synara/Superset 聚合指示） */
const ATTENTION_DOT_CLASS: Record<string, string> = {
  blocked: 'bg-red-500',
  running: 'bg-amber-500 animate-pulse',
  completed: 'bg-emerald-500',
}

export function SidebarProjectsTab({ workspaceRoot, sessionHandlers }: SidebarProjectsTabProps): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? workspaces[0] ?? null
  const workspaceSlug = workspace?.slug ?? null

  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const indicatorMap = useAtomValue(agentSessionIndicatorMapAtom)
  const activeSessionId = useAtomValue(activeSessionIdAtom)
  const draftSessionIds = useAtomValue(draftSessionIdsAtom)
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setPendingTaskEditorTarget = useSetAtom(pendingTaskEditorTargetAtom)
  const [showArchived, setShowArchived] = useAtom(showArchivedProjectsAtom)

  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<KanbanProject | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [settingsTarget, setSettingsTarget] = React.useState<KanbanProject | null>(null)
  const [relativeTimeNow, setRelativeTimeNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    const timer = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // 按当前工作区过滤项目
  const scopedProjects = React.useMemo(() => {
    if (!workspaceSlug) return []
    return projects.filter((project) => !project.workspaceId || project.workspaceId === workspaceSlug)
  }, [projects, workspaceSlug])

  // 归档过滤
  const visibleProjects = React.useMemo(() => {
    let result = scopedProjects
    if (!showArchived) result = result.filter((project) => !project.archivedAt)
    return result
  }, [scopedProjects, showArchived])

  /**
   * 当前工作区可入项目分组的会话：排除 draft / 归档 / 委派子会话 / 自动任务会话。
   * 置顶会话保留在各项目组内（带置顶标）：本 Tab 是「项目 → 会话」的完整地图，
   * 全局置顶区只在会话 Tab 展示，这里若再排除会导致部分会话无处可见。
   */
  const groupableSessions = React.useMemo(
    () => filterGroupableSessions(agentSessions, draftSessionIds, workspace?.id ?? null),
    [agentSessions, draftSessionIds, workspace?.id],
  )

  const sessionsByProject = React.useMemo(
    () => groupSessionsByProject(groupableSessions),
    [groupableSessions],
  )

  /** 项目排序：有会话的按最新会话活跃度排，无会话的按项目自身 updatedAt 排在后面 */
  const sortedProjects = React.useMemo(
    () => sortProjectsByActivity(visibleProjects, sessionsByProject),
    [visibleProjects, sessionsByProject],
  )

  const toggleCollapsed = React.useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const enterWork = React.useCallback(() => {
    setCodeMainView('work')
    setActiveView('conversations')
  }, [setActiveView, setCodeMainView])

  const openBoard = React.useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    enterWork()
  }, [enterWork, setSelectedProjectId])

  const openCreateTask = React.useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setPendingTaskEditorTarget({ mode: 'create', initialProjectId: projectId })
    enterWork()
  }, [enterWork, setPendingTaskEditorTarget, setSelectedProjectId])

  const handleCreateProject = React.useCallback(async (
    input: Parameters<typeof window.electronAPI.projects.create>[1],
  ): Promise<void> => {
    if (!workspaceRoot) return
    setCreating(true)
    try {
      const project = await window.electronAPI.projects.create(workspaceRoot, input)
      setProjects((prev) => [project, ...prev.filter((existing) => existing.id !== project.id)])
      setCreateOpen(false)
      toast.success('项目已创建')
      openBoard(project.id)
    } catch (cause) {
      toast.error('创建项目失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setCreating(false)
    }
  }, [openBoard, setProjects, workspaceRoot])

  const handleToggleArchive = React.useCallback(async (project: KanbanProject): Promise<void> => {
    if (!workspaceRoot || !project.slug) return
    try {
      const updated = await window.electronAPI.projects.update(workspaceRoot, project.slug, {
        archivedAt: project.archivedAt ? undefined : Date.now(),
      })
      setProjects((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)))
      toast.success(project.archivedAt ? '已取消归档' : '已归档')
    } catch (cause) {
      toast.error('操作失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }, [setProjects, workspaceRoot])

  const handleDeleteProject = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !deleteTarget?.slug) return
    setDeleting(true)
    try {
      await window.electronAPI.projects.delete(workspaceRoot, deleteTarget.slug)
      setProjects((prev) => prev.filter((existing) => existing.id !== deleteTarget.id))
      toast.success(`项目「${deleteTarget.name}」已删除`)
    } catch (cause) {
      toast.error('删除失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, setProjects, workspaceRoot])

  const handleProjectChanged = React.useCallback((updated: KanbanProject): void => {
    setProjects((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)))
  }, [setProjects])

  if (!workspaceSlug || !workspaceRoot) {
    return (
      <div className="flex-1 px-4 py-10 text-center text-[13px] text-foreground/40">
        请先选择工作区
      </div>
    )
  }

  const hasProjects = scopedProjects.length > 0
  const hasVisible = sortedProjects.length > 0

  const renderSessionRow = (session: AgentSessionMeta, projectColor?: string): React.ReactElement => {
    const status = indicatorMap.get(session.id) ?? 'idle'
    return (
      <AgentSessionItem
        key={session.id}
        session={session}
        active={session.id === activeSessionId}
        indicatorStatus={status}
        showPinIcon={false}
        leftAccent={getSessionLeftAccent(status)}
        projectColor={projectColor}
        projects={scopedProjects}
        onMoveToProject={sessionHandlers.onMoveToProject}
        relativeTimeNow={relativeTimeNow}
        onSelect={sessionHandlers.onSelectSession}
        onRequestDelete={sessionHandlers.onRequestDelete}
        onRequestMove={sessionHandlers.onRequestMove}
        onRename={sessionHandlers.onRename}
        onTogglePin={sessionHandlers.onTogglePin}
        onToggleStar={sessionHandlers.onToggleStar}
        onToggleArchive={sessionHandlers.onToggleArchive}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col titlebar-no-drag">
      {/* 归档过滤 + 新建项目：合并成一行，避免侧边栏堆叠太多整行区块 */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-foreground/50">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            className="scale-75"
          />
          显示已归档
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateOpen(true)}
              className="grid size-6 place-items-center rounded-md text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80"
            >
              <Plus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建项目</TooltipContent>
        </Tooltip>
      </div>

      {/* 项目 → 会话分组 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {!hasVisible ? (
          <div className="px-2 py-8 text-center text-[13px] text-foreground/35">
            {hasProjects ? '没有匹配的项目' : '暂无项目'}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortedProjects.map((project) => {
              const projectSessions = sessionsByProject.get(project.id) ?? []
              const expanded = !collapsedIds.has(project.id)
              const archived = !!project.archivedAt
              const attention = resolveProjectAttention(projectSessions, indicatorMap)

              // 项目操作菜单：⋯ 下拉菜单与右键菜单共用同一份内容，避免两处维护同一份 JSX；
              // 尺寸对齐会话行的右键菜单（text-xs + py-1 + 小图标），而不是默认的大号菜单项
              const renderProjectMenuItems = (
                MenuItem: typeof DropdownMenuItem | typeof ContextMenuItem,
                MenuSeparator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator,
              ): React.ReactNode => (
                <>
                  <MenuItem className="text-xs py-1 [&>svg]:size-3.5" onSelect={() => openBoard(project.id)}>
                    <LayoutDashboard size={13} />
                    看板
                  </MenuItem>
                  <MenuItem className="text-xs py-1 [&>svg]:size-3.5" onSelect={() => openCreateTask(project.id)}>
                    <Plus size={13} />
                    新建任务
                  </MenuItem>
                  <MenuItem className="text-xs py-1 [&>svg]:size-3.5" onSelect={() => setSettingsTarget(project)}>
                    <Pencil size={13} />
                    项目设置
                  </MenuItem>
                  <MenuSeparator className="my-0.5" />
                  <MenuItem className="text-xs py-1 [&>svg]:size-3.5" onSelect={() => { void handleToggleArchive(project) }}>
                    {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    {archived ? '取消归档' : '归档'}
                  </MenuItem>
                  <MenuItem
                    className="text-xs py-1 [&>svg]:size-3.5 text-destructive focus:text-destructive"
                    onSelect={() => setDeleteTarget(project)}
                  >
                    <Trash2 size={13} />
                    删除
                  </MenuItem>
                </>
              )

              return (
                <div key={project.id} className={cn('rounded-lg', archived && 'opacity-60')}>
                  {/* 项目行：点击 = 展开/折叠会话列表；右键/双指点击 = 项目操作菜单 */}
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleCollapsed(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleCollapsed(project.id)
                          }
                        }}
                        className="group relative flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.04]"
                      >
                        <ChevronRight
                          size={12}
                          className={cn(
                            'shrink-0 text-foreground/30 transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{project.name}</span>

                        {/* 聚合注意力点 + 会话计数（非 hover 时显示） */}
                        {attention && (
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full group-hover:hidden',
                              ATTENTION_DOT_CLASS[attention],
                            )}
                            title={attention === 'blocked' ? '有会话需要处理' : attention === 'running' ? '有会话正在运行' : '有会话已完成'}
                            aria-hidden="true"
                          />
                        )}
                        {projectSessions.length > 0 && (
                          <span className="shrink-0 text-[10px] tabular-nums text-foreground/30 group-hover:hidden">
                            {projectSessions.length}
                          </span>
                        )}

                        {/* hover 操作：新建该项目会话 + 归档 + 更多菜单。
                            用 absolute + opacity 而非 hidden/flex 切换显隐：
                            display:none 会让触发元素在打开瞬间的 rect 为 0，
                            Radix Popper 首次定位时会把浮层错误地放到视口左上角（(0,0) 起跳）。
                            改为 opacity + pointer-events 切换，触发元素始终有真实布局尺寸，定位不再跑偏。 */}
                        <span className="absolute right-1.5 top-1/2 flex shrink-0 -translate-y-1/2 items-center gap-0.5 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto">
                          <button
                            type="button"
                            title={`在「${project.name}」下新建会话`}
                            aria-label={`在「${project.name}」下新建会话`}
                            onClick={(event) => {
                              event.stopPropagation()
                              void sessionHandlers.onNewSessionInProject(project.id)
                            }}
                            className="grid size-5 place-items-center rounded text-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground/80"
                          >
                            <Plus size={12} />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                title="项目操作"
                                aria-label={`「${project.name}」项目操作`}
                                onClick={(event) => event.stopPropagation()}
                                className="grid size-5 place-items-center rounded text-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground/80 data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground/80"
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 z-[9999] min-w-0 p-0.5">
                              {renderProjectMenuItems(DropdownMenuItem, DropdownMenuSeparator)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </span>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44 z-[9999] min-w-0 p-0.5">
                      {renderProjectMenuItems(ContextMenuItem, ContextMenuSeparator)}
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* 项目下会话列表（时间倒序） */}
                  {expanded && projectSessions.length > 0 && (
                    <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-foreground/[0.06] pl-2 pb-1">
                      {projectSessions.map((session) => renderSessionRow(session, project.color))}
                    </div>
                  )}
                  {expanded && projectSessions.length === 0 && (
                    <div className="ml-9 pb-1.5 pt-0.5 text-[11px] text-foreground/30">
                      暂无会话，点「+」新建
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 新建对话框 */}
      <CreateProjectDialog
        open={createOpen}
        busy={creating}
        onOpenChange={setCreateOpen}
        onSubmit={(input) => { void handleCreateProject(input) }}
      />

      {/* 项目设置弹窗（⋯ 菜单入口；修复原「设置」项跳看板的问题） */}
      {settingsTarget?.slug && (
        <ProjectSettingsDialog
          open={settingsTarget !== null}
          workspaceRoot={workspaceRoot}
          project={settingsTarget}
          onOpenChange={(open) => { if (!open) setSettingsTarget(null) }}
          onProjectChanged={handleProjectChanged}
        />
      )}

      {/* 删除确认 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name ?? ''}」及其所有资产吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => { event.preventDefault(); void handleDeleteProject() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
