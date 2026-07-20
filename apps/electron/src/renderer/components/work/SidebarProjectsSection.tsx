import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { ChevronRight, FolderKanban, Info, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { appModeAtom } from '@/atoms/app-mode'
import {
  selectedProjectIdAtom,
  serverKanbanProjectsAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CreateProjectDialog } from './CreateProjectDialog'
import { filterProjects } from './project-view-model'

export interface SidebarProjectsSectionProps {
  workspaceRoot: string | null
  workspaceSlug: string | null
}

export function SidebarProjectsSection({
  workspaceRoot,
  workspaceSlug,
}: SidebarProjectsSectionProps): React.ReactElement | null {
  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom)
  const setWorkView = useSetAtom(workViewAtom)
  const setMode = useSetAtom(appModeAtom)

  const [collapsed, setCollapsed] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [showArchived, setShowArchived] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  if (!workspaceRoot) return null

  const scopedProjects = projects.filter(
    (project) => !workspaceSlug || !project.workspaceId || project.workspaceId === workspaceSlug,
  )
  const visibleProjects = filterProjects(scopedProjects, { query, showArchived })

  const handleSelectProject = (projectId: string): void => {
    setSelectedProjectId(projectId)
    setWorkView('board')
  }

  const handleOpenProjectDetail = (projectId: string): void => {
    setSelectedProjectId(projectId)
    setWorkView('project')
    setMode('cowork')
  }

  const handleCreateProject = async (
    input: Parameters<typeof window.electronAPI.projects.create>[1],
  ): Promise<void> => {
    setCreating(true)
    try {
      const project = await window.electronAPI.projects.create(workspaceRoot, input)
      setProjects((current) => {
        const without = current.filter((item) => item.id !== project.id)
        return [project, ...without]
      })
      setSelectedProjectId(project.id)
      setWorkView('project')
      setMode('cowork')
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

  return (
    <section className="titlebar-no-drag">
      <div className="group/projects relative flex items-center">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="sidebar-projects-list"
          onClick={() => setCollapsed((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-foreground/65 transition-[padding,color,background-color] hover:bg-foreground/[0.025] hover:text-foreground/88 group-hover/projects:pr-7"
        >
          <FolderKanban size={13} className="flex-shrink-0 text-foreground/40" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-[18px]">项目</span>
          <span className="flex-shrink-0 text-[10px] tabular-nums text-foreground/30">
            {scopedProjects.length}
          </span>
          <ChevronRight
            size={12}
            className={cn(
              'flex-shrink-0 text-foreground/30 transition-transform duration-150',
              collapsed ? '-rotate-90' : 'rotate-90',
            )}
          />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateOpen(true)}
              className="absolute right-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-foreground/30 opacity-0 transition-colors hover:bg-foreground/[0.055] hover:text-foreground/65 group-hover/projects:opacity-100 focus-visible:opacity-100"
            >
              <Plus size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">新建项目</TooltipContent>
        </Tooltip>
      </div>

      {!collapsed && (
        <div className="mt-1 space-y-1.5 px-1">
          <label className="relative block">
            <Search className="absolute left-2 top-2 h-3 w-3 text-foreground/35" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目"
              className="h-7 border-0 bg-foreground/[0.04] pl-7 text-[11px] shadow-none focus-visible:ring-1"
            />
          </label>
          <label className="flex items-center gap-1.5 px-0.5 text-[11px] text-foreground/45">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="size-3 rounded border-foreground/20"
            />
            显示已归档
          </label>
          <div
            id="sidebar-projects-list"
            className="max-h-[220px] space-y-0.5 overflow-y-auto scrollbar-thin"
          >
            {visibleProjects.map((project) => {
              const color = project.color ?? 'hsl(var(--muted-foreground))'
              const selected = selectedProjectId === project.id
              return (
                <div
                  key={project.id}
                  className={cn(
                    'group/project-row relative flex items-center rounded-md transition-colors',
                    selected ? 'bg-primary/10 text-primary' : 'hover:bg-foreground/[0.04]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProject(project.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left group-hover/project-row:pr-7"
                  >
                    <span
                      className="size-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium leading-4">
                        {project.name}
                      </span>
                      <span className="block truncate text-[11px] text-foreground/40">
                        {project.description || (project.archivedAt ? '已归档' : '暂无描述')}
                      </span>
                    </span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`「${project.name}」项目详情`}
                        onClick={() => handleOpenProjectDetail(project.id)}
                        className="absolute right-0 top-1/2 size-5 -translate-y-1/2 text-foreground/30 opacity-0 transition-opacity hover:text-foreground/65 group-hover/project-row:opacity-100 focus-visible:opacity-100"
                      >
                        <Info size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">项目详情</TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
            {visibleProjects.length === 0 && (
              <div className="px-1.5 py-4 text-center text-[11px] text-foreground/40">
                没有匹配的项目
              </div>
            )}
          </div>
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        busy={creating}
        onOpenChange={setCreateOpen}
        onSubmit={(input) => void handleCreateProject(input)}
      />
    </section>
  )
}
