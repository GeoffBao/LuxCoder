/**
 * SidebarModule - 左栏模块契约壳
 *
 * 统一左栏「自动任务 / Agent 技能 / 项目」等模块的头部规格：
 * - collapsible: false → 纯入口行（整行点击导航）
 * - collapsible: true  → 可折叠内容模块，children 作为展开体
 *
 * 视觉规格对齐既有 entry 行（px-3 py-2 rounded-md text-[13px]）。
 * 折叠态为受控（collapsed + onCollapsedChange），由调用方持有
 * （当前唯一消费者是项目模块，经 atom 持久化到 settings.json）。
 */

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSidebarModuleCount } from './sidebar-module-model'

/** 各部位追加 className（用于特殊主题的既有钩子类，如 automation-entry-*） */
export interface SidebarModuleClassNames {
  /** 头部行 */
  row?: string
  /** 图标容器 */
  icon?: string
  /** 计数徽标 */
  badge?: string
}

export interface SidebarModuleProps {
  /** 头部图标 */
  icon: LucideIcon
  /** 模块标题 */
  title: string
  /** 计数徽标（>99 显示 "99+"），不传则不显示 */
  count?: number
  /** 徽标色调：accent = 有更新（蓝徽标） */
  badgeTone?: 'neutral' | 'accent'
  /** false = 纯入口行（整行点击导航）；true = 可折叠内容模块 */
  collapsible?: boolean
  /** 折叠态（受控，仅 collapsible 时有意义；不传视为展开） */
  collapsed?: boolean
  /** 折叠态变化回调 */
  onCollapsedChange?: (collapsed: boolean) => void
  /** hover 浮现的头部操作（如「+ 新建」） */
  headerActions?: React.ReactNode
  /** collapsible 展开体 */
  children?: React.ReactNode
  /** 非 collapsible 时的整行点击 */
  onClick?: () => void
  /** 激活态样式 */
  active?: boolean
  /** 无障碍标签（默认根据 title / count 生成） */
  ariaLabel?: string
  /** 展开体容器 id（用于 aria-controls） */
  bodyId?: string
  /** 各部位追加 className */
  classNames?: SidebarModuleClassNames
}

export function SidebarModule({
  icon: Icon,
  title,
  count,
  badgeTone = 'neutral',
  collapsible = false,
  collapsed,
  onCollapsedChange,
  headerActions,
  children,
  onClick,
  active = false,
  ariaLabel,
  bodyId,
  classNames,
}: SidebarModuleProps): React.ReactElement {
  const isCollapsed = collapsed ?? false

  /** 切换折叠态：受控，回调由调用方写回 */
  const handleToggle = (): void => {
    onCollapsedChange?.(!isCollapsed)
  }

  const resolvedAriaLabel =
    ariaLabel ?? (count !== undefined ? `${title}，${count} 项` : title)

  const badge =
    count !== undefined ? (
      <span
        className={cn(
          'flex h-5 min-w-[22px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums',
          badgeTone === 'accent'
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : active
              ? 'bg-accent-foreground/[0.26] text-primary-foreground'
              : 'bg-foreground/[0.045] text-foreground/[0.42] group-hover/module:text-foreground/65',
          classNames?.badge,
        )}
      >
        {formatSidebarModuleCount(count)}
      </span>
    ) : null

  const headerContent = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'h-[18px] w-[18px] flex-shrink-0',
            active ? 'text-accent-foreground' : 'text-foreground/45',
            classNames?.icon,
          )}
        >
          <Icon size={16} className="block" />
        </span>
        <span className="truncate">{title}</span>
      </span>
      <span className="ml-2 flex flex-shrink-0 items-center gap-1">
        {badge}
        {collapsible && (
          <ChevronRight
            size={14}
            className={cn(
              'text-foreground/30 transition-transform duration-150',
              !isCollapsed && 'rotate-90',
            )}
          />
        )}
      </span>
    </>
  )

  const rowClass = cn(
    'flex w-full items-center justify-between rounded-md px-3 py-2 text-[13px] transition-colors duration-100 titlebar-no-drag',
    active
      ? 'bg-accent-foreground/[0.10] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
      : 'text-foreground/60 hover:bg-accent-foreground/[0.08] hover:text-foreground',
    // 有头部操作时，hover 预留右侧空间避免与 chevron / badge 重叠
    collapsible && headerActions ? 'group-hover/module:pr-7' : undefined,
    classNames?.row,
  )

  // 纯入口行：整行点击导航
  if (!collapsible) {
    return (
      <button
        type="button"
        aria-label={resolvedAriaLabel}
        onClick={onClick}
        className={cn(rowClass, 'group/module')}
      >
        {headerContent}
      </button>
    )
  }

  // 可折叠内容模块：头部切换 + hover 浮现操作 + 展开体
  return (
    <div className="group/module relative titlebar-no-drag">
      <button
        type="button"
        aria-label={resolvedAriaLabel}
        aria-expanded={!isCollapsed}
        aria-controls={bodyId}
        onClick={handleToggle}
        className={rowClass}
      >
        {headerContent}
      </button>
      {headerActions && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/module:opacity-100">
          {headerActions}
        </div>
      )}
      {!isCollapsed && children && <div id={bodyId}>{children}</div>}
    </div>
  )
}
