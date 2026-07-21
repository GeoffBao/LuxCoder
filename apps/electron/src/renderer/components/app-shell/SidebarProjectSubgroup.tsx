import * as React from 'react'
import { ChevronRight, Info, Plus } from 'lucide-react'
import type { SessionIndicatorStatus } from '@/atoms/agent-atoms'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentSessionItem, getSessionLeftAccent } from './AgentSessionItem'
import type { SidebarProjectGroup } from './sidebar-project-groups'
import type { KanbanProject } from './kanban/types'

export interface SidebarProjectSubgroupProps {
  group: SidebarProjectGroup
  activeSessionId: string | null
  relativeTimeNow: number
  /** 会话行状态徽标映射（与 AgentProjectGroupItem 同源） */
  agentIndicatorMap: Map<string, SessionIndicatorStatus>
  /** 当前工作区项目列表；透传给会话行的「移动到项目」子菜单 */
  projects: KanbanProject[]
  onNewSessionInProject: (projectId: string) => Promise<void>
  onOpenProjectDetail: (projectId: string) => void
  onMoveToProject: (sessionId: string, projectId?: string) => void | Promise<void>
  /** 以下透传给 AgentSessionItem，与工作区组内会话行为完全一致 */
  onSelectSession: (id: string, title: string) => void
  onRequestDelete: (id: string) => void
  onRequestMove: (id: string) => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
}

/**
 * 侧边栏项目子分组：分组头（色点 + 名称 + 会话数 + hover「+」/详情）+ 组内会话列表。
 * 独立成文件：LeftSidebar.tsx 是 Proma 移植冲突热点，只留挂载点。
 */
export function SidebarProjectSubgroup({
  group,
  activeSessionId,
  relativeTimeNow,
  agentIndicatorMap,
  projects,
  onNewSessionInProject,
  onOpenProjectDetail,
  onMoveToProject,
  onSelectSession,
  onRequestDelete,
  onRequestMove,
  onRename,
  onTogglePin,
  onToggleArchive,
}: SidebarProjectSubgroupProps): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const selected = group.selected
  // CSS 变量存的是 HSL 三元组，需要 hsl() 包裹才能作为颜色值
  const color = group.project.color ?? 'hsl(var(--muted-foreground))'

  // 选中反馈（Code 模式单击项目的可见反馈）：自动展开并滚动到可见位置；
  // 取消选中 / 改选其他项目时由 selected 变 false 自然清除高亮
  React.useEffect(() => {
    if (!selected) return
    setCollapsed(false)
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  return (
    <div ref={rootRef} className="flex flex-col">
      <div className="group/subproject relative flex items-center">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={`subproject-sessions-${group.project.id}`}
          onClick={() => setCollapsed((value) => !value)}
          className={cn(
            'flex-1 min-w-0 flex items-center gap-1.5 px-1 py-0.5 rounded-md text-left transition-[padding,color,background-color] titlebar-no-drag group-hover/subproject:pr-11',
            // 选中反馈：左侧 2px 实心色条 + 底色 + 主色文字。
            // 默认深色主题 --primary 与前景色接近（38 27% 94%），仅靠 bg-primary/10
            // 在 18px 高的窄行上几乎不可感知，必须加全不透明色条才足够明确。
            selected
              ? 'bg-primary/10 text-primary shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
              : 'text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.025]',
          )}
        >
          <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span
            className={cn(
              'flex-1 min-w-0 truncate text-xs leading-[18px]',
              selected ? 'font-semibold' : 'font-medium',
            )}
          >
            {group.project.name}
          </span>
          <span className={cn('flex-shrink-0 text-[10px]', selected ? 'text-primary/70' : 'text-foreground/30')}>
            {group.sessions.length}
          </span>
          <ChevronRight
            size={11}
            className={cn(
              'flex-shrink-0 transition-transform',
              selected ? 'text-primary/70' : 'text-foreground/30',
              collapsed ? '-rotate-90' : 'rotate-90',
            )}
          />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`在「${group.project.name}」中新建会话`}
              onClick={() => void onNewSessionInProject(group.project.id)}
              className="absolute right-5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-foreground/30 opacity-0 transition-colors hover:bg-foreground/[0.055] hover:text-foreground/65 group-hover/subproject:opacity-100 focus-visible:opacity-100 titlebar-no-drag"
            >
              <Plus size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">在此项目中新建会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`「${group.project.name}」项目详情`}
              onClick={() => onOpenProjectDetail(group.project.id)}
              className="absolute right-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-foreground/30 opacity-0 transition-colors hover:bg-foreground/[0.055] hover:text-foreground/65 group-hover/subproject:opacity-100 focus-visible:opacity-100 titlebar-no-drag"
            >
              <Info size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">项目详情</TooltipContent>
        </Tooltip>
      </div>
      {!collapsed && group.sessions.length > 0 && (
        <div id={`subproject-sessions-${group.project.id}`} className="ml-3 flex flex-col gap-0.5">
          {group.sessions.map((session) => {
            const rowStatus = agentIndicatorMap.get(session.id) ?? 'idle'
            return (
              <AgentSessionItem
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                indicatorStatus={rowStatus}
                showPinIcon={!!session.pinned}
                leftAccent={getSessionLeftAccent(rowStatus)}
                projectColor={group.project.color}
                relativeTimeNow={relativeTimeNow}
                projects={projects}
                onMoveToProject={onMoveToProject}
                onSelect={onSelectSession}
                onRequestDelete={onRequestDelete}
                onRequestMove={onRequestMove}
                onRename={onRename}
                onTogglePin={onTogglePin}
                onToggleArchive={onToggleArchive}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
