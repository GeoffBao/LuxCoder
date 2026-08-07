import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Filter, Tag, X } from 'lucide-react'
import type { TaskWorkflow } from '@myyoda/shared/tasks'
import { workspaceLabelsAtom } from '@/atoms/workspace-labels-atoms'
import {
  taskBoardWorkflowFilterAtom,
  taskBoardLabelFilterAtom,
  taskBoardIncludeUnlabeledAtom,
  taskBoardFilterCountAtom,
  clearTaskBoardFiltersAtom,
} from '@/atoms/task-board-filter-atoms'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const WORKFLOW_OPTIONS: Array<{ value: 'all' | TaskWorkflow; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待办' },
  { value: 'in-progress', label: '进行中' },
  { value: 'needs-review', label: '待验收' },
  { value: 'done', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

export function TaskBoardFilters(): React.ReactElement {
  const [workflowFilter, setWorkflowFilter] = useAtom(taskBoardWorkflowFilterAtom)
  const [labelFilter, setLabelFilter] = useAtom(taskBoardLabelFilterAtom)
  const [includeUnlabeled, setIncludeUnlabeled] = useAtom(taskBoardIncludeUnlabeledAtom)
  const filterCount = useAtomValue(taskBoardFilterCountAtom)
  const clearFilters = useSetAtom(clearTaskBoardFiltersAtom)
  const labels = useAtomValue(workspaceLabelsAtom)

  const workflowLabel = WORKFLOW_OPTIONS.find((option) => option.value === workflowFilter)?.label

  return (
    <div className="flex flex-wrap items-center gap-1">
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={filterCount > 0
            ? 'inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary'
            : 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground/80'}
        >
          <Filter className="h-3.5 w-3.5" />
          <span>{filterCount > 0 ? `筛选 ${filterCount}` : '筛选'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="start" className="w-44 z-[9999] min-w-0 p-0.5">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs py-1">状态</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-28 z-[9999] min-w-0 p-0.5">
                {WORKFLOW_OPTIONS.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={workflowFilter === option.value}
                    onCheckedChange={() => setWorkflowFilter(option.value)}
                    className="text-xs py-1"
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          {labels.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs py-1">
                <Tag className="mr-1.5 h-3 w-3" />
                标签
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-44 z-[9999] min-w-0 p-0.5 max-h-64 overflow-y-auto">
                  {labels.map((label) => (
                    <DropdownMenuCheckboxItem
                      key={label.id}
                      checked={labelFilter.includes(label.id)}
                      onCheckedChange={() => {
                        setLabelFilter(
                          labelFilter.includes(label.id)
                            ? labelFilter.filter((id) => id !== label.id)
                            : [...labelFilter, label.id],
                        )
                      }}
                      className="text-xs py-1"
                    >
                      <span className="mr-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color ?? '#888' }} />
                      {label.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <div className="my-0.5 border-t border-border/40" />
                  <DropdownMenuCheckboxItem
                    checked={includeUnlabeled}
                    onCheckedChange={setIncludeUnlabeled}
                    className="text-xs py-1"
                  >
                    无标签
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {filterCount > 0 && (
            <>
              <div className="my-0.5 border-t border-border/40" />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={() => clearFilters()}
                className="text-xs py-1 text-muted-foreground"
              >
                <X className="mr-1.5 h-3 w-3" />
                清除
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
      </DropdownMenu>
      {workflowFilter !== 'all' && (
        <button type="button" onClick={() => setWorkflowFilter('all')} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
          状态：{workflowLabel}<X className="h-3 w-3" />
        </button>
      )}
      {labelFilter.map((labelId) => {
        const label = labels.find((candidate) => candidate.id === labelId)
        if (!label) return null
        return (
          <button key={labelId} type="button" onClick={() => setLabelFilter(labelFilter.filter((id) => id !== labelId))} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-1 text-[11px] text-foreground/70">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />{label.name}<X className="h-3 w-3" />
          </button>
        )
      })}
      {includeUnlabeled && (
        <button type="button" onClick={() => setIncludeUnlabeled(false)} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-1 text-[11px] text-foreground/70">
          无标签<X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
