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

/** 有失败时露出 ✓/✗，避免「1/5」掩盖已结算的失败节点。 */
export function formatProgressLabel(segments: SubtaskRunState[]): string {
  const total = segments.length
  if (total === 0) return '0/0'
  const done = segments.filter((state) => state === 'done').length
  const failed = segments.filter((state) => state === 'failed').length
  if (failed === 0) return `${done}/${total}`
  return `${done}✓${failed}✗/${total}`
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
  const failed = segments.filter((state) => state === 'failed').length
  const total = segments.length
  const label = formatProgressLabel(segments)
  const settled = done + failed

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="flex h-1.5 min-w-0 flex-1 gap-0.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={settled}
        aria-label={`子任务进度 ${label}`}
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
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{label}</span>
    </div>
  )
}
