import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { buildKanbanBoardModel, type KanbanColumnDefinition } from './board-model'
import { KanbanColumn } from './KanbanColumn'
import { TaskTile } from './TaskTile'
import { INBOX_COLUMN_ID, type KanbanBoardMode, type KanbanItem } from './types'

interface KanbanBoardProps {
  items: KanbanItem[]
  mode: KanbanBoardMode
  columns?: KanbanColumnDefinition[]
  onMove: (sessionId: string, columnId: string) => void
  onOpenItem?: (item: KanbanItem) => void
  onOpenSubtask?: (sessionId: string) => void
  onRetryTeambition?: (item: KanbanItem) => void
  composer?: React.ReactNode
}

function dropColumnId(event: DragEndEvent): string | null {
  const value: unknown = event.over?.data.current?.columnId
  return typeof value === 'string' ? value : null
}

export function KanbanBoard({ items, mode, columns, onMove, onOpenItem, onOpenSubtask, onRetryTeambition, composer }: KanbanBoardProps): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const model = buildKanbanBoardModel(items, columns)
  const composerColumnId = model.columns.find((column) => column.id !== INBOX_COLUMN_ID)?.id
    ?? model.columns[0]?.id
  const handleDragEnd = (event: DragEndEvent): void => {
    const columnId = dropColumnId(event)
    if (!columnId) return
    const item = items.find((candidate) => candidate.id === String(event.active.id))
    if (!item || item.columnId === columnId) return
    onMove(item.id, columnId)
  }

  if (mode === 'list') {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-3 overflow-y-auto p-1">
        {composer}
        {model.listItems.map((item) => (
          <TaskTile
            key={item.id}
            item={item}
            draggable={false}
            onOpen={onOpenItem}
            onOpenSubtask={onOpenSubtask}
            onRetryTeambition={onRetryTeambition}
          />
        ))}
        {model.listItems.length === 0 && <div className="rounded-2xl bg-muted/40 p-10 text-center text-sm text-muted-foreground">暂无任务，先创建一个任务吧</div>}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-3">
        {model.columns.map((column) => (
          <KanbanColumn key={column.id} column={column} onOpenItem={onOpenItem} onOpenSubtask={onOpenSubtask} onRetryTeambition={onRetryTeambition}>
            {column.id === composerColumnId ? composer : undefined}
          </KanbanColumn>
        ))}
      </div>
    </DndContext>
  )
}
