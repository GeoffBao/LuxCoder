import * as React from 'react'
import { Archive, ArchiveRestore, FolderKanban, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { KanbanProject } from '../app-shell/kanban/types'
import { filterProjects } from './project-view-model'

export interface ProjectsListPanelProps {
  workspaceRoot: string
  projects: KanbanProject[]
  selectedProjectId: string | null
  onSelect: (projectId: string) => void
  onProjectChanged: (project: KanbanProject) => void
  className?: string
}

export function ProjectsListPanel({
  workspaceRoot,
  projects,
  selectedProjectId,
  onSelect,
  onProjectChanged,
  className,
}: ProjectsListPanelProps): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [showArchived, setShowArchived] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const visibleProjects = filterProjects(projects, { query, showArchived })

  const createProject = async (): Promise<void> => {
    if (!name.trim()) { toast.error('请输入项目名称'); return }
    try {
      const project = await window.electronAPI.projects.create(workspaceRoot, {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      onProjectChanged(project)
      onSelect(project.id)
      setName('')
      setDescription('')
      setCreating(false)
      toast.success('项目已创建')
    } catch (cause) {
      toast.error('创建项目失败', { description: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const toggleArchive = async (project: KanbanProject): Promise<void> => {
    if (!project.slug) return
    try {
      const updated = await window.electronAPI.projects.update(workspaceRoot, project.slug, {
        archivedAt: project.archivedAt ? undefined : Date.now(),
      })
      onProjectChanged(updated)
      toast.success(project.archivedAt ? '项目已取消归档' : '项目已归档')
    } catch (cause) {
      toast.error('更新归档状态失败', { description: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return (
    <aside className={cn('relative z-20 flex min-h-0 w-72 shrink-0 flex-col rounded-2xl bg-card shadow-sm', className)}>
      <header className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="text-[11px] text-muted-foreground">{projects.length} 个项目</p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            className="relative z-30"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setCreating((value) => !value)
            }}
            aria-label="新建项目"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <label className="relative block"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" className="h-8 pl-8 text-xs" /></label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />显示已归档</label>
      </header>
      {creating && (
        <div className="mx-3 mb-3 space-y-2 rounded-xl bg-muted/40 p-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="简短描述（可选）" />
          <div className="flex gap-2"><Button size="sm" className="flex-1" onClick={() => void createProject()}>创建</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>取消</Button></div>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {visibleProjects.map((project) => (
          <div key={project.id} className={cn('group flex items-center rounded-xl px-2 py-2 transition-colors', selectedProjectId === project.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60')}>
            <button type="button" onClick={() => onSelect(project.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background shadow-sm"><FolderKanban className="h-4 w-4" style={{ color: project.color }} /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{project.name}</span><span className="block truncate text-[11px] text-muted-foreground">{project.description || (project.archivedAt ? '已归档' : '暂无描述')}</span></span>
            </button>
            <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => void toggleArchive(project)} aria-label={project.archivedAt ? '取消归档' : '归档'}>
              {project.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ))}
        {visibleProjects.length === 0 && <div className="px-3 py-10 text-center text-xs text-muted-foreground">没有匹配的项目</div>}
      </div>
    </aside>
  )
}
