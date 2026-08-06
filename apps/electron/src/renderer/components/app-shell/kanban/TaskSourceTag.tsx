/**
 * TaskSourceTag — 任务来源标签
 *
 * 在看板卡片 / 列表行展示任务来源，区分：
 * - 个人创建（manual，含旧任务 source 缺省）
 * - TB 系统（teambition）
 * - 其他来源（未来扩展的未知来源）
 *
 * 与「来源」筛选（TaskBoardFilters）保持一致：`source ?? 'manual'` 视为个人创建。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TaskSourceTagProps {
  /** 任务来源标识（TaskRecord.source）；缺省/未知视为个人创建 */
  source?: string | null
}

const SOURCE_TAG_STYLES: Record<
  'teambition' | 'manual' | 'other',
  { label: string; className: string; title: string }
> = {
  teambition: {
    label: 'TB',
    className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    title: '来自 Teambition 同步',
  },
  manual: {
    label: '个人',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    title: '个人创建',
  },
  other: {
    label: '其他',
    className: 'bg-foreground/[0.06] text-foreground/60',
    title: '其他来源',
  },
}

export function TaskSourceTag({ source }: TaskSourceTagProps): React.ReactElement {
  const tag =
    source === 'teambition'
      ? SOURCE_TAG_STYLES.teambition
      : source == null || source === 'manual'
        ? SOURCE_TAG_STYLES.manual
        : SOURCE_TAG_STYLES.other

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none',
        tag.className,
      )}
      title={tag.title}
    >
      {tag.label}
    </span>
  )
}
