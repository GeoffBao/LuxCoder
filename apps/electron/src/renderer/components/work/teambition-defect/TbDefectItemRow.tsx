import * as React from 'react'
import { Check, ChevronDown, Loader2, MessageSquare, Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrowserTbDefectItem, BrowserTbWorkflow } from '@/../preload/index'
import { isOverdue, isReopened } from './tb-defect-model'

const PRIORITY_META: Record<number, { label: string; dot: string }> = {
  0: { label: '低', dot: 'bg-muted-foreground/40' },
  1: { label: '中', dot: 'bg-amber-500' },
  2: { label: '高', dot: 'bg-red-500' },
}

/** 任务类型徽章（缺陷/需求/任务/…）；无类型时默认「任务」 */
const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  bug: { label: '缺陷', className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  requirement: { label: '需求', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  activity: { label: '活动', className: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  hardware: { label: '硬件单', className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  checklist: { label: 'Checklist', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  task: { label: '任务', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
}

function typeBadge(item: BrowserTbDefectItem): { label: string; className: string } {
  return TYPE_BADGE[item.type ?? 'task'] ?? TYPE_BADGE.task!
}

function formatDue(dueDate: string | undefined): string {
  if (!dueDate) return ''
  const date = new Date(dueDate)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

interface TbDefectItemRowProps {
  item: BrowserTbDefectItem
  workflow?: BrowserTbWorkflow
  currentUserId?: string
  selected?: boolean
  /** 批量选择态 */
  checked?: boolean
  onCheckChange?: (checked: boolean) => void
  onClick?: (item: BrowserTbDefectItem) => void
  /** 加入本地任务（替代原流转） */
  onAddToLocal?: (item: BrowserTbDefectItem) => void
  addingToLocal?: boolean
  /** 已加入本地 Agent 看板（置灰 + 禁加入，直到从本地看板删除） */
  alreadyInLocal?: boolean
  onComment?: (item: BrowserTbDefectItem) => void
  onOpenSession?: (item: BrowserTbDefectItem) => void
  disabled?: boolean
}

/** TB 缺陷单行（卡片式，对齐现有 TaskTile 视觉） */
export function TbDefectItemRow({
  item,
  workflow,
  currentUserId,
  selected = false,
  checked = false,
  onCheckChange,
  onClick,
  onAddToLocal,
  addingToLocal = false,
  alreadyInLocal = false,
  onComment,
  onOpenSession,
  disabled = false,
}: TbDefectItemRowProps): React.ReactElement {
  const reopened = isReopened(item, workflow)
  const overdue = isOverdue(item, workflow)
  const priority = PRIORITY_META[item.priority ?? 0] ?? PRIORITY_META[0]!

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`打开缺陷：${item.content}`}
      onClick={() => onClick?.(item)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onClick?.(item)
      }}
      className={cn(
        'group cursor-pointer rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/30 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-primary/70 shadow-md',
        reopened && 'ring-destructive/40 bg-destructive/[0.03]',
        alreadyInLocal && 'opacity-55 saturate-50 hover:shadow-sm',
        overdue && !reopened && 'ring-amber-500/30',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {item.uniqueId !== undefined && (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">#{item.uniqueId}</span>
            )}
            <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none', typeBadge(item).className)}>
              {typeBadge(item).label}
            </span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none',
                reopened
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
              )}
            >
              {item.tfsName ?? '未知'}
            </span>
            {alreadyInLocal && (
              <span className="inline-flex shrink-0 items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-600 dark:text-emerald-400">
                已加入
              </span>
            )}
            <span className={cn('size-2 shrink-0 rounded-full', priority.dot)} title={`优先级：${priority.label}`} />
            {overdue && <span className="text-[10px] text-red-500">逾期</span>}
            <h3 className="line-clamp-2 text-sm font-medium leading-5">{item.content}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {item.executorId ? <span>执行者：{item.executorId === currentUserId ? '我' : item.executorId.slice(0, 8)}</span> : <span className="text-amber-600/80">未认领</span>}
            {typeof item.progress === 'number' && <span>进度 {item.progress}%</span>}
            {item.dueDate && <span className={cn(overdue && 'text-red-500')}>截止 {formatDue(item.dueDate)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          {onCheckChange && (
            <button
              type="button"
              title={alreadyInLocal ? '已加入本地看板，无法选择' : (checked ? '取消选择' : '选择（可批量加入本地任务）')}
              aria-label={checked ? '取消选择' : '选择'}
              disabled={alreadyInLocal || disabled}
              onClick={() => onCheckChange?.(!checked)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className={cn(
                'grid size-4 place-items-center rounded border text-[10px] leading-none',
                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}>
                {checked ? '✓' : ''}
              </span>
            </button>
          )}
          {onAddToLocal && (
            alreadyInLocal ? (
              <span
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/40"
                title="已加入本地看板，需从 Task 执行看板删除后才可再次加入"
                aria-label="已加入本地任务"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            ) : (
            <button
              type="button"
              title="加入本地任务"
              aria-label="加入本地任务"
              disabled={disabled || addingToLocal}
              onClick={() => onAddToLocal?.(item)}
              className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm disabled:opacity-50"
            >
              {addingToLocal
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />}
            </button>
            )
          )}
          {onComment && (
            <button
              type="button"
              title="评论/催办"
              aria-label="评论催办"
              disabled={disabled}
              onClick={() => onComment?.(item)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenSession && (
            <button
              type="button"
              title="打开关联会话"
              aria-label="打开关联会话"
              disabled={disabled}
              onClick={() => onOpenSession?.(item)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** 三区折叠标题行（count + 展开箭头） */
export function TbSectionHeader({
  title,
  count,
  defaultOpen = false,
  accent,
  onToggle,
  open,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  accent?: string
  onToggle: (open: boolean) => void
  open: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onToggle(!open)}
      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-foreground/80 hover:text-foreground"
    >
      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      <span className={cn('size-2 rounded-full', accent ?? 'bg-foreground/30')} />
      <span>{title}</span>
      <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{count}</span>
    </button>
  )
}
