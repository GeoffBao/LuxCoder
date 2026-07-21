import { AlertCircle, CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelChip } from './ModelChip'
import type { KanbanSubtask } from './types'

interface SubtaskRowProps {
  subtask: KanbanSubtask
  onClick?: () => void
  /** 当前正在查看的子任务会话 */
  active?: boolean
  /** 与父任务/编排模型相同时隐藏行内 ModelChip，减少重复噪声 */
  hideModelWhen?: string
  className?: string
}

function StateIcon({ state }: { state: KanbanSubtask['runState'] }): React.ReactElement {
  switch (state) {
    case 'done':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    case 'running':
      return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-500" />
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-destructive" />
    case 'needs-review':
      return <AlertCircle className="h-3.5 w-3.5 text-violet-500" />
    case 'pending':
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
    default: {
      const _exhaustive: never = state
      void _exhaustive
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }
}

function sameModel(left: string | undefined, right: string | undefined): boolean {
  const a = left?.trim()
  const b = right?.trim()
  return Boolean(a && b && a === b)
}

export function SubtaskRow({
  subtask,
  onClick,
  active = false,
  hideModelWhen,
  className,
}: SubtaskRowProps): React.ReactElement {
  const showModel = Boolean(subtask.model) && !sameModel(subtask.model, hideModelWhen)

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={(event) => { event.stopPropagation(); onClick?.() }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1 text-left disabled:opacity-100',
        onClick && 'px-1 hover:bg-muted',
        active && 'bg-amber-500/10 ring-1 ring-amber-500/30',
        className,
      )}
    >
      <StateIcon state={subtask.runState} />
      <span className={cn(
        'min-w-0 flex-1 truncate text-xs',
        subtask.runState === 'done' && 'text-muted-foreground line-through',
        subtask.runState === 'needs-review' && 'text-violet-700 dark:text-violet-300',
        active && 'font-medium text-foreground',
      )}
      >
        {subtask.title}
      </span>
      {showModel && <ModelChip model={subtask.model} />}
    </button>
  )
}
