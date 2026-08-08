import { useDroppable } from '@dnd-kit/core'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { resolveKanbanColumnColor } from './kanban-colors'
import { TaskTile } from './TaskTile'
import { TASK_TYPE_LABELS, type TaskType } from '@yoda/shared/tasks'
import type { KanbanBoardColumn } from './board-model'
import type { TaskWorkflow } from '@yoda/shared/tasks'
import type { KanbanItem } from './types'

interface KanbanColumnProps {
  column: KanbanBoardColumn
  onOpenItem?: (item: KanbanItem) => void
  onEditItem?: (item: KanbanItem) => void
  onRenameItem?: (item: KanbanItem, newTitle: string) => void
  onArchiveItem?: (item: KanbanItem) => void
  onDeleteItem?: (item: KanbanItem) => void
  onOpenSubtask?: (sessionId: string) => void
  onRunTask?: (item: KanbanItem) => void
  onRetryTeambition?: (item: KanbanItem) => void
  onSetLabels?: (item: KanbanItem, labelIds: string[]) => void
  onChangeWorkflow?: (item: KanbanItem, workflow: TaskWorkflow) => void
  onAccept?: (item: KanbanItem) => void
}

const TYPE_ICONS: Record<TaskType, string> = {
  activity: '🎯',
  requirement: '📋',
  bug: '🐛',
  task: '✅',
  checklist: '📝',
  hardware: '🔧',
}

/** 任务业务类型 badge 配色 */
const TYPE_BADGE_CLASS: Record<TaskType, string> = {
  activity: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  requirement: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  bug: 'bg-red-500/10 text-red-700 dark:text-red-300',
  task: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  checklist: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  hardware: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
}

function resolveItemType(item: KanbanItem): TaskType {
  return item.task?.type ?? 'task'
}

export function KanbanColumn({ column, onOpenItem, onEditItem, onRenameItem, onArchiveItem, onDeleteItem, onOpenSubtask, onRunTask, onRetryTeambition, onSetLabels, onChangeWorkflow, onAccept }: KanbanColumnProps): React.ReactElement {
  const drop = useDroppable({ id: `column:${column.id}`, data: { columnId: column.id } })
  const color = resolveKanbanColumnColor(column.id, column.color)

  // 列内按业务类型分组（无 task.type 的旧任务归「未分组」）
  const grouped = React.useMemo(() => {
    const map = new Map<string, KanbanItem[]>()
    for (const item of column.items) {
      const type = resolveItemType(item)
      const key = item.task?.type ?? '__ungrouped__'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === '__ungrouped__') return 1
        if (b === '__ungrouped__') return -1
        return TASK_TYPE_LABELS[a as TaskType].localeCompare(TASK_TYPE_LABELS[b as TaskType], 'zh-CN')
      })
  }, [column.items])

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const toggleGroup = React.useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const renderTile = (item: KanbanItem): React.ReactElement => (
    <TaskTile
      key={item.id}
      item={item}
      accent={color}
      onOpen={onOpenItem}
      onEdit={onEditItem}
      onRename={onRenameItem}
      onArchive={onArchiveItem}
      onRequestDelete={onDeleteItem}
      onOpenSubtask={onOpenSubtask}
      onRunTask={onRunTask}
      onRetryTeambition={onRetryTeambition}
      onSetLabels={onSetLabels}
      onChangeWorkflow={onChangeWorkflow}
      onAccept={onAccept}
    />
  )

  return (
    <section
      ref={drop.setNodeRef}
      className={cn('flex w-[min(82vw,290px)] min-w-[260px] shrink-0 flex-col rounded-2xl bg-muted/45 p-3 transition-colors xl:w-auto xl:flex-1', drop.isOver && 'bg-primary/10')}
    >
      <header className="sticky top-0 z-[1] mb-3 flex items-center gap-2 rounded-lg bg-muted/90 px-1 py-1 backdrop-blur">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-medium">{column.name}</h2>
        <span className="ml-auto rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">{column.items.length}</span>
      </header>
      <div className="space-y-3">
        {column.items.length === 0 && <div className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">暂无任务</div>}

        {grouped.map(([key, items]) => {
          const isUngrouped = key === '__ungrouped__'
          const type = isUngrouped ? null : (key as TaskType)
          const collapsed = collapsedGroups.has(key)
          const groupLabel = isUngrouped ? '未分组' : (type ? TASK_TYPE_LABELS[type] : '未分组')

          return (
            <div key={key} className="space-y-2">
              {/* 分组折叠头（单类型时不显示，避免单组冗余） */}
              {grouped.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                >
                  <ChevronRight size={13} className={cn('text-foreground/40 transition-transform', !collapsed && 'rotate-90')} />
                  {type && <span className="text-[12px]">{TYPE_ICONS[type]}</span>}
                  <span className="flex-1 truncate">{groupLabel}</span>
                  <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums">{items.length}</span>
                </button>
              )}
              {!collapsed && <div className="space-y-2">{items.map(renderTile)}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
