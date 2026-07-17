import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  resolveKanbanModelName,
  resolveKanbanModelSelection,
  type KanbanModelSelection,
} from './kanban-model-catalog'
import type { KanbanModelProviderGroup } from './types'

export interface TaskModelSelectProps {
  value: string
  /** 当前模型对应的渠道；有则精确高亮跨渠道同名模型 */
  channelId?: string
  onChange: (selection: KanbanModelSelection) => void
  groups: KanbanModelProviderGroup[]
  width?: number
  size?: 'sm' | 'md'
  className?: string
  placeholder?: string
}

const SelectButton = React.forwardRef<
  HTMLButtonElement,
  { size?: 'sm' | 'md' } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function SelectButton({ size = 'md', children, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background font-medium text-foreground',
        'transition-colors hover:bg-muted/60 data-[state=open]:bg-muted/60',
        size === 'sm' ? 'h-7 px-2 text-[11.5px]' : 'h-8 px-2.5 text-xs',
        className,
      )}
      {...rest}
    >
      {children}
      <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
    </button>
  )
})

/** 紧凑模型下拉：按渠道分组，选项为 channelId+modelId 成对选择。 */
export function TaskModelSelect({
  value,
  channelId,
  onChange,
  groups,
  width,
  size = 'md',
  className,
  placeholder = '选择模型',
}: TaskModelSelectProps): React.ReactElement {
  const selected = resolveKanbanModelSelection(groups, value, channelId)
  const label = value ? resolveKanbanModelName(groups, value) : placeholder
  const resolvedWidth = width ?? 168
  const fillWidth = width === undefined && className?.includes('w-full')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SelectButton
          size={size}
          style={fillWidth ? undefined : { width: resolvedWidth }}
          className={cn(fillWidth && 'w-full', className)}
          title={value || undefined}
        >
          <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground')}>
            {label}
          </span>
        </SelectButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[320px] min-w-[220px]">
        {groups.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可用模型，请先配置渠道</div>
        ) : (
          groups.map((group, index) => (
            <React.Fragment key={`${group.provider}-${group.label}-${index}`}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">{group.label}</DropdownMenuLabel>
              {group.models.map((model) => {
                const isSelected = selected?.modelId === model.id && selected.channelId === model.channelId
                return (
                  <DropdownMenuItem
                    key={`${model.channelId}:${model.id}`}
                    className="text-xs"
                    onSelect={() => onChange({ modelId: model.id, channelId: model.channelId })}
                  >
                    <span className="truncate">{model.name}</span>
                    {isSelected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                  </DropdownMenuItem>
                )
              })}
            </React.Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
