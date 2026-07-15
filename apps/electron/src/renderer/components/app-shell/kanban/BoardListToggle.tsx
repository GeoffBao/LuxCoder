import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KanbanBoardMode } from './types'

interface BoardListToggleProps {
  value: KanbanBoardMode
  onChange: (value: KanbanBoardMode) => void
  className?: string
}

export function BoardListToggle({ value, onChange, className }: BoardListToggleProps): React.ReactElement {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted/70 p-1 shadow-inner', className)} aria-label="看板视图">
      <button
        type="button"
        aria-pressed={value === 'board'}
        onClick={() => onChange('board')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
          value === 'board' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />看板
      </button>
      <button
        type="button"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
          value === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List className="h-3.5 w-3.5" />列表
      </button>
    </div>
  )
}
