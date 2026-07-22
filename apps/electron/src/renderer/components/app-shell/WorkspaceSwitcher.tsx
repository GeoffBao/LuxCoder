/**
 * WorkspaceSwitcher — Code 侧栏顶层 Workspace 选择器
 * 左侧 Workspace 图标，右侧 Lucide ChevronDown（禁止 Unicode ▾）
 */

import * as React from 'react'
import { ChevronDown, Layers, Plus } from 'lucide-react'
import type { AgentWorkspace } from '@luxcoder/shared'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface WorkspaceSwitcherProps {
  workspaces: AgentWorkspace[]
  currentWorkspaceId: string | null
  onSelect: (workspaceId: string) => void
  onCreate?: () => void
  className?: string
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onSelect,
  onCreate,
  className,
}: WorkspaceSwitcherProps): React.ReactElement {
  const current = workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0]

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
          aria-label="切换 Workspace"
        >
          <Layers size={14} className="shrink-0 text-foreground/45" />
          <span className="flex-1 min-w-0 truncate text-left">
            {current?.name ?? 'Workspace'}
          </span>
          <ChevronDown size={14} className="shrink-0 text-foreground/35" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[9999] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px]">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => onSelect(workspace.id)}
            className={cn(workspace.id === current?.id && 'bg-accent')}
          >
            <Layers size={14} className="mr-2 text-foreground/45" />
            <span className="truncate">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
        {onCreate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate}>
              <Plus size={14} className="mr-2" />
              新建 Workspace
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
