import { cn } from '@/lib/utils'

const STATUS_PRESENTATION: Record<string, { label: string; color: string }> = {
  todo: { label: '待处理', color: '#6366f1' },
  running: { label: '运行中', color: '#f59e0b' },
  'in-progress': { label: '进行中', color: '#f59e0b' },
  'needs-review': { label: '待评审', color: '#8b5cf6' },
  done: { label: '已完成', color: '#10b981' },
  completed: { label: '已完成', color: '#10b981' },
  failed: { label: '失败', color: '#ef4444' },
  cancelled: { label: '已取消', color: '#64748b' },
}

interface StatusBadgeProps {
  status?: string
  live?: boolean
  className?: string
}

export function StatusBadge({ status = 'todo', live = false, className }: StatusBadgeProps): React.ReactElement {
  const presentation = STATUS_PRESENTATION[status] ?? { label: status, color: '#64748b' }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}
      style={{ backgroundColor: `color-mix(in srgb, ${presentation.color} 12%, transparent)`, color: presentation.color }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {presentation.label}
    </span>
  )
}
