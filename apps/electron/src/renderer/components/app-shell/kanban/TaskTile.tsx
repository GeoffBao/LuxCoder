import { useDraggable } from '@dnd-kit/core'
import { ExternalLink, GitBranch, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelChip } from './ModelChip'
import { StatusBadge } from './StatusBadge'
import { SubtaskProgress } from './SubtaskProgress'
import type { KanbanItem, KanbanSubtask } from './types'
import { resolveTeambitionSyncBadge } from '@/components/work/teambition-view'

interface TaskTileProps {
  item: KanbanItem
  accent?: string
  draggable?: boolean
  onOpen?: (item: KanbanItem) => void
  onRetryTeambition?: (item: KanbanItem) => void
  className?: string
}

function progressSubtasks(item: KanbanItem): KanbanSubtask[] {
  const run = item.taskRun
  if (!run) return []
  return Array.from({ length: run.totalNodes }, (_, index) => ({
    id: `${item.id}-${index}`,
    title: `节点 ${index + 1}`,
    runState: index < run.completedNodes ? 'done' : 'pending',
    model: '',
  }))
}

export function TaskTile({ item, accent, draggable = true, onOpen, onRetryTeambition, className }: TaskTileProps): React.ReactElement {
  const drag = useDraggable({ id: item.id, disabled: !draggable, data: { kind: 'kanban-item' } })
  const teambitionBadge = item.teambition?.syncState
    ? resolveTeambitionSyncBadge(item.teambition.syncState)
    : null
  const transform = drag.transform
    ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
    : undefined
  return (
    <article
      ref={drag.setNodeRef}
      style={{ transform, opacity: drag.isDragging ? 0.55 : 1 }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={() => onOpen?.(item)}
      className={cn(
        'group cursor-pointer rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/30 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        draggable && 'touch-none',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-5">{item.title}</h3>
          {item.project && <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.project.name}</p>}
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.session.sessionStatus} live={item.session.sessionStatus === 'running'} />
        <ModelChip model={item.session.modelId} className="max-w-32" />
        {item.session.taskSlug && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><GitBranch className="h-3 w-3" />{item.session.taskSlug}</span>}
      </div>
      {item.taskRun && <SubtaskProgress subtasks={progressSubtasks(item)} total={item.taskRun.totalNodes} accent={accent} className="mt-3" />}
      {item.teambition && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" title={item.teambition.error}>
          <Link2 className="h-3 w-3" />
          <span className="truncate">{item.teambition.title ?? item.teambition.taskId}</span>
          {item.teambition.status && <span>· {item.teambition.status}</span>}
          {teambitionBadge && (
            <span className={`rounded-full px-1.5 py-0.5 ${teambitionBadge.className}`}>
              {teambitionBadge.label}
            </span>
          )}
          {item.teambition.bindingId && (item.teambition.syncState === 'pending' || item.teambition.syncState === 'conflict') && (
            <button
              type="button"
              className="rounded-full px-1.5 py-0.5 text-primary hover:bg-primary/10"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onRetryTeambition?.(item)
              }}
            >
              重试
            </button>
          )}
        </div>
      )}
    </article>
  )
}
