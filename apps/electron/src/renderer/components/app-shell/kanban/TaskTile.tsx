import { useDraggable } from '@dnd-kit/core'
import { ChevronDown, ExternalLink, GitBranch, Link2, Play } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { ModelChip } from './ModelChip'
import { ExpertChip } from './ExpertChip'
import { StatusBadge } from './StatusBadge'
import { SubtaskProgress } from './SubtaskProgress'
import { SubtaskRow } from './SubtaskRow'
import { resolveDagAttention, shouldShowDoneColumnAttention } from './dag-attention'
import type { KanbanItem } from './types'
import { resolveTeambitionSyncBadge } from '@/components/work/teambition-view'
import { useExpertOptions } from '@/components/agent-experts/useExpertOptions'
import { getTaskExpertOption } from './task-editor-ui-model'

interface TaskTileProps {
  item: KanbanItem
  accent?: string
  draggable?: boolean
  onOpen?: (item: KanbanItem) => void
  onOpenSubtask?: (sessionId: string) => void
  onRunTask?: (item: KanbanItem) => void
  onRetryTeambition?: (item: KanbanItem) => void
  className?: string
}

function isLiveStatus(status: string | undefined): boolean {
  return status === 'running' || status === 'in-progress' || status === 'queued'
}

export function TaskTile({
  item,
  accent,
  draggable = true,
  onOpen,
  onOpenSubtask,
  onRunTask,
  onRetryTeambition,
  className,
}: TaskTileProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(
    () => item.subtasks.some((subtask) => subtask.runState === 'running') || item.subtasks.length > 0,
  )
  const { options: expertOptions } = useExpertOptions()
  const expertLabel = item.expertId
    ? getTaskExpertOption(item.expertId, expertOptions).label
    : null
  const drag = useDraggable({ id: item.id, disabled: !draggable, data: { kind: 'kanban-item' } })
  const teambitionBadge = item.teambition?.syncState
    ? resolveTeambitionSyncBadge(item.teambition.syncState)
    : null
  const transform = drag.transform
    ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
    : undefined
  const hasRunning = item.isProcessing || item.subtasks.some((subtask) => subtask.runState === 'running')
  const live = hasRunning || isLiveStatus(item.session.sessionStatus)
  const progressTotal = item.subtaskTotal ?? item.taskRun?.totalNodes ?? item.subtasks.length
  const dagAttention = resolveDagAttention(item.subtasks, progressTotal)
  const showDoneAttention = shouldShowDoneColumnAttention(item.columnId, dagAttention)
  const canRun = Boolean(onRunTask)
    && Boolean(item.session.taskSlug)
    && !hasRunning
    && item.subtasks.some((subtask) => subtask.runState === 'pending')

  return (
    <article
      ref={drag.setNodeRef}
      style={{
        transform,
        opacity: drag.isDragging ? 0.55 : 1,
        ...(live && accent
          ? { boxShadow: `0 0 0 1px ${accent}, 0 4px 16px -4px color-mix(in srgb, ${accent} 40%, transparent)` }
          : undefined),
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={() => onOpen?.(item)}
      className={cn(
        'group cursor-pointer rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/30 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        live && 'ring-amber-500/40',
        showDoneAttention && dagAttention?.kind === 'has-failed' && 'ring-destructive/35',
        showDoneAttention && dagAttention?.kind === 'incomplete' && 'ring-amber-500/35',
        draggable && 'touch-none',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-5">{item.title}</h3>
          {item.project && <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.project.name}</p>}
        </div>
        {canRun && (
          <button
            type="button"
            title="运行任务"
            aria-label="运行任务"
            data-no-dnd
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onRunTask?.(item)
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.session.sessionStatus} live={live} />
        {showDoneAttention && dagAttention && (
          <span
            title="列在「已完成」，但任务 DAG 尚未全部成功结束"
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              dagAttention.kind === 'has-failed'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
          >
            {dagAttention.label}
          </span>
        )}
        <ModelChip model={item.session.modelId} className="max-w-32" />
        {item.expertId && expertLabel && (
          <ExpertChip expertId={item.expertId} label={expertLabel} />
        )}
        {item.session.taskSlug && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitBranch className="h-3 w-3" />{item.session.taskSlug}
          </span>
        )}
      </div>

      {progressTotal > 0 && (
        <div className="mt-3 space-y-1.5" data-no-dnd>
          <div className="flex items-center gap-2">
            <SubtaskProgress
              subtasks={item.subtasks}
              total={progressTotal}
              accent={accent}
              className="min-w-0 flex-1"
            />
            {item.subtasks.length > 0 && (
              <button
                type="button"
                aria-label={expanded ? '收起子任务' : '展开子任务'}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setExpanded((value) => !value)
                }}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
              </button>
            )}
          </div>
          {expanded && item.subtasks.length > 0 && (
            <div className="space-y-0.5 rounded-lg bg-muted/35 p-1.5">
              {item.subtasks.map((subtask) => (
                <SubtaskRow
                  key={subtask.id}
                  subtask={subtask}
                  hideModelWhen={item.session.modelId}
                  onClick={subtask.sessionId && onOpenSubtask
                    ? () => onOpenSubtask(subtask.sessionId!)
                    : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
