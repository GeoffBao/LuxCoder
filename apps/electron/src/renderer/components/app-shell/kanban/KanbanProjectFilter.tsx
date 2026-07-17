import { FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KanbanProject } from './types'

interface KanbanProjectFilterProps {
  projects: KanbanProject[]
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}

export function KanbanProjectFilter({
  projects,
  value,
  onChange,
  className,
}: KanbanProjectFilterProps): React.ReactElement {
  return (
    <label className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', className)}>
      <FolderKanban className="h-4 w-4 shrink-0" />
      <select
        aria-label="筛选项目"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-8 min-w-0 max-w-52 rounded-lg border border-border/60 bg-card px-2 text-xs text-foreground shadow-sm outline-none focus:border-ring"
      >
        <option value="">所有项目</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  )
}
