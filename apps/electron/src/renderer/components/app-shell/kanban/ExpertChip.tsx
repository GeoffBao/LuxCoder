import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExpertChipProps {
  label: string
  expertId: string
  className?: string
}

/** 只读徽标：标明任务/编排条已绑定并会注入该专家。 */
export function ExpertChip({ label, expertId, className }: ExpertChipProps): React.ReactElement {
  return (
    <span
      title={`专家已应用：${label}（${expertId}）`}
      className={cn(
        'inline-flex max-w-[10rem] items-center gap-1 truncate rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400',
        className,
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}
