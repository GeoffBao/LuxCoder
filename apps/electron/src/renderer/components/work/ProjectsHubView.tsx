/**
 * ProjectsHubView — 「项目中心」全屏视图
 *
 * 由侧边栏「项目中心」入口触发，全屏占据中间内容区（隐藏 TabBar 与右侧文件面板）。
 *
 * 结构：
 * - 顶部：标题 + 搜索 + 归档开关 + 新建
 * - 内容：项目卡片网格；点卡片进看板，ⓘ 进详情
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { FolderKanban, Info, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import {
  codeMainViewAtom,
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { KanbanProject } from '@/components/app-shell/kanban/types'
import { CreateProjectDialog } from './CreateProjectDialog'
import { filterProjects } from './project-view-model'
import { BUILTIN_EXPERT_OPTIONS, resolveExpertLabel } from './projects-hub-model'

export function ProjectsHubView(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((candidate) => candidate.id === currentWorkspaceId) ?? workspaces[0] ?? null
  const workspaceSlug = workspace?.slug ?? null

  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)
  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setWorkView = useSetAtom(workViewAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)

  const [query, setQuery] = React.useState('')
  const [showArchived, setShowArchived] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  // 解析当前工作区根目录（与 LeftSidebar / WorkBoardView 同链路）
  React.useEffect(() => {
    let cancelled = false
    setWorkspaceRoot(null)
    if (!workspaceSlug) return () => { cancelled = true }

    void window.electronAPI.getWorkspaceRootPath(workspaceSlug)
      .then((root) => {
        if (!cancelled) setWorkspaceRoot(root)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          toast.error('加载工作区失败', {
            description: cause instanceof Error ? cause.message : String(cause),
          })
        }
      })

    return () => { cancelled = true }
  }, [workspaceSlug])

  const scopedProjects = React.useMemo(() => {
    if (!workspaceSlug) return []
    return projects.filter(
      (project) => !project.workspaceId || project.workspaceId === workspaceSlug,
    )
  }, [projects, workspaceSlug])

  const visibleProjects = React.useMemo(
    () => filterProjects(scopedProjects, { query, showArchived }),
    [query, scopedProjects, showArchived],
  )

  /** 进入 Work 主区（看板 / 详情）并退出 Hub 覆盖视图 */
  const enterWorkMainView = React.useCallback((): void => {
    setCodeMainView('work')
    setActiveView('conversations')
  }, [setActiveView, setCodeMainView])

  const openBoard = React.useCallback((projectId: string): void => {
    setSelectedProjectId(projectId)
    setWorkView('board')
    enterWorkMainView()
  }, [enterWorkMainView, setSelectedProjectId, setWorkView])

  const openDetail = React.useCallback((projectId: string): void => {
    setSelectedProjectId(projectId)
    setWorkView('project')
    enterWorkMainView()
  }, [enterWorkMainView, setSelectedProjectId, setWorkView])

  const handleCreateProject = async (
    input: Parameters<typeof window.electronAPI.projects.create>[1],
  ): Promise<void> => {
    if (!workspaceRoot) return
    setCreating(true)
    try {
      const project = await window.electronAPI.projects.create(workspaceRoot, input)
      setProjects((current) => {
        const without = current.filter((item) => item.id !== project.id)
        return [project, ...without]
      })
      openDetail(project.id)
      setCreateOpen(false)
      toast.success('项目已创建')
    } catch (cause) {
      toast.error('创建项目失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setCreating(false)
    }
  }

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
          <FolderKanban className="size-8 text-foreground/30" />
        </div>
        <div className="text-[15px] font-medium text-foreground/80">请先选择工作区</div>
        <div className="max-w-sm text-[13px] text-foreground/50">
          在 Code 模式下选择或创建一个工作区后，再来管理项目。
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 标题栏 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pt-14 pb-4">
        <div className="flex items-center gap-2.5">
          <FolderKanban className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">项目中心</h1>
          <span className="text-[13px] tabular-nums text-muted-foreground">{scopedProjects.length}</span>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus size={14} />
          <span>新建</span>
        </button>
      </div>

      {/* 工具条：搜索 + 归档开关 */}
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center gap-3 px-8 pb-4">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目..."
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </div>

        <label className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 text-[13px] text-foreground/70">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            aria-label="显示已归档"
          />
          <span>显示已归档</span>
        </label>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-8 pb-10">
          {visibleProjects.length === 0 ? (
            <EmptyState
              hasProjects={scopedProjects.length > 0}
              onCreate={() => setCreateOpen(true)}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project) => (
                <ProjectHubCard
                  key={project.id}
                  project={project}
                  onOpenBoard={() => openBoard(project.id)}
                  onOpenDetail={() => openDetail(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        busy={creating}
        onOpenChange={setCreateOpen}
        onSubmit={(input) => void handleCreateProject(input)}
      />
    </div>
  )
}

interface ProjectHubCardProps {
  project: KanbanProject
  onOpenBoard: () => void
  onOpenDetail: () => void
}

function ProjectHubCard({ project, onOpenBoard, onOpenDetail }: ProjectHubCardProps): React.ReactElement {
  const color = project.color ?? 'hsl(var(--muted-foreground))'
  const expertLabel = resolveExpertLabel(project.defaultExpertId, BUILTIN_EXPERT_OPTIONS)

  return (
    <div
      className={cn(
        'group/project-card relative flex flex-col rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-colors hover:border-border hover:bg-foreground/[0.02]',
        project.archivedAt && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onOpenBoard}
        className="flex min-h-0 flex-1 flex-col items-start gap-2 text-left"
      >
        <div className="flex w-full items-start gap-2">
          <span
            className="mt-1 size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-foreground">{project.name}</div>
            <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {project.description || (project.archivedAt ? '已归档' : '暂无描述')}
            </div>
          </div>
        </div>

        <Badge variant="secondary" className="mt-1 text-[11px] font-normal">
          {expertLabel}
        </Badge>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`「${project.name}」项目详情`}
            onClick={onOpenDetail}
            className="absolute right-2 top-2 text-foreground/30 opacity-0 transition-opacity hover:text-foreground/65 group-hover/project-card:opacity-100 focus-visible:opacity-100"
          >
            <Info size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">项目详情</TooltipContent>
      </Tooltip>
    </div>
  )
}

interface EmptyStateProps {
  hasProjects: boolean
  onCreate: () => void
}

function EmptyState({ hasProjects, onCreate }: EmptyStateProps): React.ReactElement {
  if (hasProjects) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
          <Search className="size-8 text-foreground/30" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[15px] font-medium text-foreground/85">没有匹配的项目</div>
          <div className="text-[13px] leading-relaxed text-foreground/50">试试更换搜索关键词或开启「显示已归档」。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">
        <FolderKanban className="size-8 text-foreground/30" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[15px] font-medium text-foreground/85">还没有项目</div>
        <div className="text-[13px] leading-relaxed text-foreground/50">创建第一个项目，组织会话与看板任务。</div>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Plus size={14} />
        <span>新建项目</span>
      </button>
    </div>
  )
}
