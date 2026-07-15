import { cn } from '@/lib/utils'
import type { KanbanSubtask } from './types'

interface SubtaskProgressProps {
  subtasks: KanbanSubtask[]
  total?: number
  accent?: string
  className?: string
}

export function SubtaskProgress({
  subtasks,
  total: totalProp,
  accent = 'var(--primary)',
  className,
}: SubtaskProgressProps): React.ReactElement | null {
  const total = Math.max(totalProp ?? subtasks.length, subtasks.length)
  if (total === 0) return null
  const done = subtasks.filter((subtask) => subtask.runState === 'done').length
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${(done / total) * 100}%`, backgroundColor: accent }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">{done}/{total}</span>
    </div>
  )
}
