/**
 * SectionTabs — 主页面顶部区段切换控件（segmented）
 *
 * 用于「常用插件 / 工具导航 / 知识库」等主视图顶部以类似 tab 的方式
 * 切换子页面（此前这些子页在左侧栏以二级菜单展开）。样式对齐
 * CodeMainViewSwitchControl 的 view-switcher 外观，但独立实现避免
 * 绑定 Code 模式的 CSS 类。
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SectionTabOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

export interface SectionTabsProps<T extends string> {
  options: Array<SectionTabOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
  /** tab 文案/图标容器追加 className */
  tabClassName?: string
}

export function SectionTabs<T extends string>({
  options,
  value,
  onChange,
  className,
  tabClassName,
}: SectionTabsProps<T>): React.ReactElement {
  return (
    <div
      role="tablist"
      className={cn(
        'titlebar-no-drag inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-fast',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/50 hover:text-foreground/80',
              tabClassName,
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
