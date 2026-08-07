import * as React from 'react'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PRESET_COLORS } from '@/components/work/AccentColorPicker'
import type { KanbanColumnDefinition } from './board-model'
import type { TaskWorkflow } from '@myyoda/shared/tasks'

/**
 * 看板列编辑弹层（仅项目自定义列可用）
 *
 * 对齐 craft 的 ColumnHeader 三段式布局，但用 MyYoda 现有 Popover/Input/Button 组件：
 * - 改名：受控输入，onBlur / Enter 提交
 * - 改色：复用 AccentColorPicker 的 PRESET_COLORS 色板
 * - drop-status：固定四选一（todo / in-progress / needs-review / done）+「不自动改变状态」
 *   （MyYoda workflow 是固定 5 态，cancelled 不作为可选自动目标）
 * - 删除列：危险态按钮，仅当父级传入 onRemove 时渲染
 */
export interface KanbanColumnEditorPopoverProps {
  column: KanbanColumnDefinition
  onRename?: (name: string) => void
  onSetColor?: (color: string) => void
  onSelectDropStatus?: (status: TaskWorkflow | undefined) => void
  onRemove?: () => void
}

const DROP_STATUS_OPTIONS: Array<{ value: TaskWorkflow; label: string }> = [
  { value: 'todo', label: '待办' },
  { value: 'in-progress', label: '进行中' },
  { value: 'needs-review', label: '待验收' },
  { value: 'done', label: '已完成' },
]

export function KanbanColumnEditorPopover({
  column,
  onRename,
  onSetColor,
  onSelectDropStatus,
  onRemove,
}: KanbanColumnEditorPopoverProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const color = column.color ?? '#6366f1'
  const editable = Boolean(onRename || onSetColor || onSelectDropStatus || onRemove)

  if (!editable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium">
        {column.name}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-no-dnd="true"
          onPointerDown={(e) => e.stopPropagation()}
          title="编辑列"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium transition-shadow hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted"
        >
          {column.name}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 space-y-3 border-border/50 bg-popover p-3 shadow-lg"
        data-no-dnd="true"
      >
        {onRename ? (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">列名称</label>
            <input
              type="text"
              defaultValue={column.name}
              autoFocus
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next && next !== column.name) onRename(next)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                  setOpen(false)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-border"
            />
          </div>
        ) : null}

        {onSetColor ? (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">列颜色</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onSetColor(hex)}
                  title={hex}
                  aria-label={`设置列颜色 ${hex}`}
                  className="grid h-5 w-5 place-items-center rounded-full ring-1 ring-border/40 transition-transform hover:scale-110"
                  style={{ backgroundColor: hex }}
                >
                  {color.toLowerCase() === hex.toLowerCase() && (
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {onSelectDropStatus ? (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">拖入时自动改变状态</label>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onSelectDropStatus(undefined)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  !column.dropStatusId
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                不改变
              </button>
              {DROP_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelectDropStatus(option.value)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    column.dropStatusId === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onRemove()
              setOpen(false)
            }}
            className="flex w-full items-center justify-start gap-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除列
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
