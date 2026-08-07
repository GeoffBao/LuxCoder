import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Play, Tag, Trash2 } from 'lucide-react'
import { workspaceLabelsAtom } from '@/atoms/workspace-labels-atoms'
import { LabelChips } from '@/components/labels/LabelChips'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatRelativeUpdatedAt } from '../AgentSessionItem'
import { buildTaskCardViewModel } from './task-card-view-model'
import type { TaskWorkflow } from '@myyoda/shared/tasks'
import type { KanbanItem } from './types'

interface TaskListRowProps {
  item: KanbanItem
  onOpen?: (item: KanbanItem) => void
  onEdit?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, title: string) => void
  onArchive?: (item: KanbanItem) => void
  onRequestDelete?: (item: KanbanItem) => void
  onRunTask?: (item: KanbanItem) => void
  onSetLabels?: (item: KanbanItem, labelIds: string[]) => void
  onChangeWorkflow?: (item: KanbanItem, workflow: TaskWorkflow) => void
}

const WORKFLOW_LABELS = {
  todo: '待办',
  'in-progress': '进行中',
  'needs-review': '待验收',
  done: '已完成',
  cancelled: '已取消',
} as const

/** 真正的高密度 List row，不再复用完整 Kanban card。 */
export function TaskListRow({
  item,
  onOpen,
  onEdit,
  onRename,
  onArchive,
  onRequestDelete,
  onRunTask,
  onSetLabels,
  onChangeWorkflow,
}: TaskListRowProps): React.ReactElement {
  const labels = useAtomValue(workspaceLabelsAtom)
  const vm = buildTaskCardViewModel(item)
  const [renaming, setRenaming] = React.useState(false)
  const [title, setTitle] = React.useState(item.title)
  const completed = item.taskRun?.completedNodes
    ?? item.subtasks.filter((subtask) => subtask.runState === 'done').length
  const total = item.subtaskTotal ?? item.taskRun?.totalNodes ?? item.subtasks.length
  const canRun = Boolean(onRunTask)
    && Boolean(item.task?.taskSlug ?? item.session.taskSlug)
    && !item.isProcessing
    && item.subtasks.some((subtask) => subtask.runState === 'pending')
  const archived = Boolean(item.task?.archivedAt ?? item.session.archived)

  const saveRename = (): void => {
    const next = title.trim()
    if (next && next !== item.title) onRename?.(item, next)
    setRenaming(false)
  }

  return (
    <div className="grid min-w-[820px] grid-cols-[minmax(220px,2fr)_minmax(110px,1fr)_100px_minmax(140px,1fr)_80px_90px_36px] items-center gap-3 border-b border-border/35 px-3 py-2 text-xs hover:bg-muted/35">
      <div className="min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveRename()
              if (event.key === 'Escape') { setTitle(item.title); setRenaming(false) }
            }}
            className="h-7 w-full rounded border border-border bg-background px-2 outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button type="button" onClick={() => onOpen?.(item)} className="w-full truncate text-left text-sm font-medium hover:text-primary">
            {item.title}
          </button>
        )}
      </div>
      <span className="truncate text-muted-foreground">{vm.projectName ?? '—'}</span>
      <span className="w-fit rounded-full bg-foreground/[0.06] px-2 py-0.5 font-medium text-foreground/70">
        {item.task ? WORKFLOW_LABELS[item.task.workflow] : '兼容项'}
      </span>
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <LabelChips labels={labels} activeIds={vm.labelIds} max={2} />
        {vm.labelIds.length === 0 ? <span className="text-muted-foreground">—</span> : null}
      </div>
      <span className="tabular-nums text-muted-foreground">{total > 0 ? `${completed}/${total}` : '—'}</span>
      <span className="text-muted-foreground">{formatRelativeUpdatedAt(item.task?.updatedAt ?? item.session.updatedAt, Date.now())}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="任务操作" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[9999] w-40">
          {canRun ? (
            <DropdownMenuItem onSelect={() => onRunTask?.(item)}><Play className="mr-2 h-3.5 w-3.5" />运行任务</DropdownMenuItem>
          ) : null}
          {onEdit ? (
            <DropdownMenuItem onSelect={() => onEdit(item)}><Pencil className="mr-2 h-3.5 w-3.5" />编辑任务</DropdownMenuItem>
          ) : null}
          {onRename ? (
            <DropdownMenuItem onSelect={() => { setTitle(item.title); setRenaming(true) }}><Pencil className="mr-2 h-3.5 w-3.5" />重命名</DropdownMenuItem>
          ) : null}
          {onChangeWorkflow && item.task && !item.task.legacyIdentity ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>更改状态</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="z-[10000] w-36">
                  {(Object.entries(WORKFLOW_LABELS) as Array<[TaskWorkflow, string]>).map(([workflow, label]) => (
                    <DropdownMenuCheckboxItem key={workflow} checked={item.task?.workflow === workflow} onCheckedChange={() => onChangeWorkflow(item, workflow)}>{label}</DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ) : null}
          {onSetLabels && item.task && !item.task.legacyIdentity && labels.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Tag className="mr-2 h-3.5 w-3.5" />Labels</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="z-[10000] w-44">
                  {labels.map((label) => {
                    const checked = vm.labelIds.includes(label.id)
                    return (
                      <DropdownMenuCheckboxItem key={label.id} checked={checked} onCheckedChange={() => onSetLabels(item, checked ? vm.labelIds.filter((id) => id !== label.id) : [...vm.labelIds, label.id])}>
                        <span className="mr-2 size-2 rounded-full" style={{ backgroundColor: label.color }} />{label.name}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ) : null}
          {onArchive ? (
            <DropdownMenuItem onSelect={() => onArchive(item)}>
              {archived ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
              {archived ? '取消归档' : '归档'}
            </DropdownMenuItem>
          ) : null}
          {onRequestDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => onRequestDelete(item)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />删除任务
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
