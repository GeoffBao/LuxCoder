import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelChipProps {
  model?: string
  className?: string
}

export function ModelChip({ model, className }: ModelChipProps): React.ReactElement | null {
  if (!model) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground', className)}>
      <Bot className="h-3 w-3 shrink-0" />
      <span className="truncate">{model}</span>
    </span>
  )
}
