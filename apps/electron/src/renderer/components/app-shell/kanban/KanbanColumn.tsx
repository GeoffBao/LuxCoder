import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { resolveKanbanColumnColor } from './kanban-colors'
import { TaskTile } from './TaskTile'
import type { KanbanBoardColumn } from './board-model'
import type { KanbanItem } from './types'

interface KanbanColumnProps {
  column: KanbanBoardColumn
  onOpenItem?: (item: KanbanItem) => void
  children?: React.ReactNode
}

export function KanbanColumn({ column, onOpenItem, children }: KanbanColumnProps): React.ReactElement {
  const drop = useDroppable({ id: `column:${column.id}`, data: { columnId: column.id } })
  const color = resolveKanbanColumnColor(column.id, column.color)
  return (
    <section
      ref={drop.setNodeRef}
      className={cn('flex w-[min(82vw,300px)] shrink-0 flex-col rounded-2xl bg-muted/45 p-3 transition-colors', drop.isOver && 'bg-primary/10')}
    >
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-medium">{column.name}</h2>
        <span className="ml-auto rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">{column.items.length}</span>
      </header>
      {children}
      <div className="space-y-3">
        {column.items.map((item) => <TaskTile key={item.id} item={item} accent={color} onOpen={onOpenItem} />)}
        {column.items.length === 0 && <div className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">拖动卡片到这里</div>}
      </div>
    </section>
  )
}
