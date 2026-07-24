/**
 * SidebarProjectsTab — Projects Tab 内容
 *
 * 用于 LeftSidebar 的「项目」Tab，展示当前工作区的项目列表：
 * - 搜索 + 归档过滤
 * - 可展开项目树（展开后显示快捷操作）
 * - 新建项目弹窗
 * - 项目删除（新增功能）
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  LayoutDashboard,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import {
  codeMainViewAtom,
  pendingTaskEditorTargetAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
} from '@/atoms/project-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { showArchivedProjectsAtom } from '@/atoms/project-context-picker'
import { Switch } from '@/components/ui/switch'
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
import type { KanbanProject } from './kanban/types'

interface SidebarProjectsTabProps {
  workspaceRoot: string | null
}

export function SidebarProjectsTab({ workspaceRoot }: SidebarProjectsTabProps): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? workspaces[0] ?? null
  const workspaceSlug = workspace?.slug ?? null

  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setPendingTaskEditorTarget = useSetAtom(pendingTaskEditorTargetAtom)
  const [showArchived, setShowArchived] = useAtom(showArchivedProjectsAtom)

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<KanbanProject | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // 按当前工作区过滤项目
  const scopedProjects = React.useMemo(() => {
    if (!workspaceSlug) return []
    return projects.filter((project) => !project.workspaceId || project.workspaceId === workspaceSlug)
  }, [projects, workspaceSlug])

  // 搜索 + 归档过滤
  const visibleProjects = React.useMemo(() => {
    let result = scopedProjects
    if (!showArchived) result = result.filter((project) => !project.archivedAt)
    return result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }, [scopedProjects, showArchived])

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
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

  if (!workspaceSlug || !workspaceRoot) {
    return (
      <div className="flex-1 px-4 py-10 text-center text-[13px] text-foreground/40">
        请先选择工作区
      </div>
    )
  }

  const hasProjects = scopedProjects.length > 0
  const hasVisible = visibleProjects.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col titlebar-no-drag">
      {/* 归档过滤 */}
      <div className="space-y-1.5 px-3 pt-2 pb-1">
        <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-foreground/50">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            className="scale-75"
          />
          显示已归档
        </label>
      </div>

      {/* 新建按钮 */}
      <div className="px-3 py-1.5">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-[13px] text-foreground/50 transition-colors hover:border-border hover:text-foreground/70"
        >
          <Plus size={14} />
          新建项目
        </button>
      </div>

      {/* 项目列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {!hasVisible ? (
          <div className="px-2 py-8 text-center text-[13px] text-foreground/35">
            {hasProjects ? '没有匹配的项目' : '暂无项目'}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visibleProjects.map((project) => {
              const expanded = expandedIds.has(project.id)
              const archived = !!project.archivedAt

              return (
                <div
                  key={project.id}
                  className={cn('rounded-lg', archived && 'opacity-60')}
                >
                  {/* 项目行 */}
                  <button
                    type="button"
                    onClick={() => openBoard(project.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-foreground/[0.04]',
                    )}
                  >
                    {/* 展开/折叠箭头 */}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => { event.stopPropagation(); toggleExpanded(project.id) }}
                      className="shrink-0"
                      aria-label={expanded ? '收起操作' : '展开操作'}
                    >
                      <ChevronRight
                        size={12}
                        className={cn(
                          'text-foreground/30 transition-transform',
                          expanded && 'rotate-90',
                        )}
                      />
                    </span>

                    {/* 色标 */}
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color ?? 'hsl(var(--muted-foreground))' }}
                      aria-hidden="true"
                    />

                    {/* 名称 */}
                    <span className="min-w-0 flex-1 truncate text-[13px]">{project.name}</span>
                  </button>

                  {/* 展开面板 */}
                  {expanded && (
                    <div className="ml-7 mt-0.5 space-y-0.5 pb-1">
                      <ActionButton
                        icon={LayoutDashboard}
                        label="看板"
                        onClick={() => openBoard(project.id)}
                      />
                      <ActionButton
                        icon={Plus}
                        label="新建任务"
                        onClick={() => openCreateTask(project.id)}
                      />
                      <ActionButton
                        icon={Pencil}
                        label="设置"
                        onClick={() => openBoard(project.id)}
                      />
                      <ActionButton
                        icon={archived ? ArchiveRestore : Archive}
                        label={archived ? '取消归档' : '归档'}
                        onClick={() => { void handleToggleArchive(project) }}
                      />
                      <ActionButton
                        icon={Trash2}
                        label="删除"
                        destructive
                        onClick={() => setDeleteTarget(project)}
                      />
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

// ── 内部组件 ──────────────────────────────────────

interface ActionButtonProps {
  icon: React.ElementType
  label: string
  destructive?: boolean
  onClick: () => void
}

/** 项目展开面板中的快捷操作按钮 */
function ActionButton({
  icon: Icon,
  label,
  destructive = false,
  onClick,
}: ActionButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-[12px] transition-colors',
        destructive
          ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
          : 'text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/80',
      )}
    >
      <Icon size={11} />
      <span>{label}</span>
    </button>
  )
}
