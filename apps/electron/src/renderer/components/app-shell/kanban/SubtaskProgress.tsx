import { cn } from '@/lib/utils'
import type { KanbanSubtask, SubtaskRunState } from './types'

interface SubtaskProgressProps {
  subtasks: KanbanSubtask[]
  total?: number
  /** @deprecated 列强调色不再用于进度段填充（无效 CSS var / 浅色列会导致 done 段透明） */
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

/** 有失败/待处理时露出标记，避免「1/5」掩盖已结算的异常节点。 */
export function formatProgressLabel(segments: SubtaskRunState[]): string {
  const total = segments.length
  if (total === 0) return '0/0'
  const done = segments.filter((state) => state === 'done').length
  const failed = segments.filter((state) => state === 'failed').length
  const review = segments.filter((state) => state === 'needs-review').length
  if (failed === 0 && review === 0) return `${done}/${total}`
  const parts: string[] = [`${done}✓`]
  if (failed > 0) parts.push(`${failed}✗`)
  if (review > 0) parts.push(`${review}审`)
  return `${parts.join('')}/${total}`
}

function segmentClass(state: SubtaskRunState): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-500'
    case 'running':
      return 'animate-pulse bg-amber-500'
    case 'failed':
      return 'bg-destructive'
    case 'needs-review':
      return 'bg-violet-500'
    case 'pending':
      return 'bg-muted-foreground/25'
    default: {
      const _exhaustive: never = state
      void _exhaustive
      return 'bg-muted-foreground/25'
    }
  }
}

/** 分段进度条：每节点一段；着色用语义色，不依赖列 accent。 */
export function SubtaskProgress({
  subtasks,
  total: totalProp,
  className,
}: SubtaskProgressProps): React.ReactElement | null {
  const segments = buildProgressSegments(subtasks, totalProp)
  if (segments.length === 0) return null
  const done = segments.filter((state) => state === 'done').length
  const failed = segments.filter((state) => state === 'failed').length
  const review = segments.filter((state) => state === 'needs-review').length
  const total = segments.length
  const label = formatProgressLabel(segments)
  const settled = done + failed + review

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
            className={cn('h-full min-w-0 flex-1 rounded-sm transition-colors', segmentClass(state))}
            title={state}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{label}</span>
    </div>
  )
}
