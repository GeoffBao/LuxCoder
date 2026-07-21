import { CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelChip } from './ModelChip'
import type { KanbanSubtask } from './types'

interface SubtaskRowProps {
  subtask: KanbanSubtask
  onClick?: () => void
  className?: string
}

function StateIcon({ state }: { state: KanbanSubtask['runState'] }): React.ReactElement {
  if (state === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (state === 'running') return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-500" />
  if (state === 'failed') return <XCircle className="h-3.5 w-3.5 text-destructive" />
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
}

export function SubtaskRow({ subtask, onClick, className }: SubtaskRowProps): React.ReactElement {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={(event) => { event.stopPropagation(); onClick?.() }}
      className={cn('flex w-full items-center gap-2 rounded-md py-1 text-left disabled:opacity-100', onClick && 'px-1 hover:bg-muted', className)}
    >
      <StateIcon state={subtask.runState} />
      <span className={cn('min-w-0 flex-1 truncate text-xs', subtask.runState === 'done' && 'text-muted-foreground line-through')}>{subtask.title}</span>
      <ModelChip model={subtask.model} />
    </button>
  )
}
