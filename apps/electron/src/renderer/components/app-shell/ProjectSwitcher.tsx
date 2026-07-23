/**
 * ProjectSwitcher — Code 侧栏项目入口
 * 镜像 WorkspaceSwitcher 结构：左侧 FolderKanban 图标，右侧 Lucide ChevronDown。
 * 轻量下拉导航 + 项目管理操作，不是全屏卡片墙（对应删除的旧「项目中心」）。
 */

import * as React from 'react'
import { ChevronDown, FolderKanban } from 'lucide-react'
import type { KanbanProject } from './kanban/types'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ProjectSwitcherProps {
  /** 当前 Workspace 下的项目列表（调用方已按 showArchivedProjects 过滤） */
  projects: KanbanProject[]
  showArchivedProjects: boolean
  onToggleShowArchived: () => void
  onSelectProject: (projectId: string) => void
  onAddScanRoot: () => void
  onBrowseFolder: () => void
  className?: string
}

export function ProjectSwitcher({
  projects,
  showArchivedProjects,
  onToggleShowArchived,
  onSelectProject,
  onAddScanRoot,
  onBrowseFolder,
  className,
}: ProjectSwitcherProps): React.ReactElement {
  const sortedProjects = React.useMemo(
    () => projects.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [projects],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 h-9 px-2.5 rounded-[10px] text-[13px] font-medium',
            'text-foreground/80 sidebar-control-surface hover:text-foreground transition-colors titlebar-no-drag',
            className,
          )}
          aria-label="打开项目列表"
        >
          <FolderKanban size={14} className="shrink-0 text-foreground/45" />
          <span className="flex-1 min-w-0 truncate text-left">项目</span>
          <ChevronDown size={14} className="shrink-0 text-foreground/35" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[9999] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]">
        {sortedProjects.length > 0 ? (
          sortedProjects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => onSelectProject(project.id)}
            >
              <span
                className="mr-2 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-3 text-[12px] leading-relaxed text-foreground/45">
            用「新会话」或「新任务」开始，并在流程中选择或创建项目。
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleShowArchived}>
          {showArchivedProjects ? '隐藏已归档' : '显示已归档'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddScanRoot}>
          添加扫描目录…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onBrowseFolder}>
          浏览文件夹…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
