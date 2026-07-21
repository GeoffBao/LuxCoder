import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Bot } from 'lucide-react'
import { channelsAtom } from '@/atoms/chat-atoms'
import { cn } from '@/lib/utils'
import { buildKanbanModelCatalog, formatModelChipLabel } from './kanban-model-catalog'

interface ModelChipProps {
  model?: string
  className?: string
}

/** 只读模型徽标（非下拉）；展示友好名，完整 id 放 title。 */
export function ModelChip({ model, className }: ModelChipProps): React.ReactElement | null {
  const channels = useAtomValue(channelsAtom)
  const groups = React.useMemo(() => buildKanbanModelCatalog(channels).groups, [channels])
  if (!model) return null
  const label = formatModelChipLabel(model, groups)
  return (
    <span
      title={model}
      aria-label={`模型 ${label}`}
      className={cn(
        'pointer-events-none inline-flex min-w-0 max-w-[7.5rem] cursor-default select-none items-center gap-1 rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <Bot className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}
