import { cn } from '@/lib/utils'
import type { KanbanSubtask, SubtaskRunState } from './types'

interface SubtaskProgressProps {
  subtasks: KanbanSubtask[]
  total?: number
  accent?: string
  className?: string
}

/** 为未 spawn 的占位节点补齐 pending 段，分母对齐 Conductor taskNodeCount。 */
export function buildProgressSegments(
  subtasks: KanbanSubtask[],
  totalProp?: number,
): SubtaskRunState[] {
  const total = Math.max(totalProp ?? subtasks.length, subtasks.length)
  if (total === 0) return []
  const states = subtasks.map((subtask) => subtask.runState)
  while (states.length < total) states.push('pending')
  return states.slice(0, total)
}

/** 分段进度条：每节点一段，一眼看出 running/failed；对齐 craft SubtaskProgress。 */
export function SubtaskProgress({
  subtasks,
  total: totalProp,
  accent,
  className,
}: SubtaskProgressProps): React.ReactElement | null {
  const segments = buildProgressSegments(subtasks, totalProp)
  if (segments.length === 0) return null
  const done = segments.filter((state) => state === 'done').length
  const total = segments.length

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="flex h-1.5 min-w-0 flex-1 gap-0.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`子任务进度 ${done}/${total}`}
      >
        {segments.map((state, index) => (
          <div
            key={`seg-${index}`}
            className={cn(
              'h-full min-w-0 flex-1 rounded-sm transition-colors',
              state === 'running' && 'animate-pulse',
              state === 'failed' && 'bg-destructive',
              state === 'pending' && 'bg-muted-foreground/20',
              state === 'done' && !accent && 'bg-primary',
              state === 'running' && !accent && 'bg-amber-500',
            )}
            style={
              (state === 'done' || state === 'running') && accent
                ? { backgroundColor: accent }
                : undefined
            }
            title={state}
          />
        ))}
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">{done}/{total}</span>
    </div>
  )
}
