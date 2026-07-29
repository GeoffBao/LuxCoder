import * as React from 'react'
import { useAtom } from 'jotai'
import { ArrowLeft, BookOpen, FolderOpen, Layers, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { workViewAtom } from '@/atoms/project-atoms'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { KanbanProject } from '@/components/app-shell/kanban/types'
import { ProjectKnowledgeTab } from './ProjectKnowledgeTab'
import { ProjectAssetsTab } from './ProjectAssetsTab'
import { ProjectSessionsTab } from './ProjectSessionsTab'

export type ProjectTab = 'knowledge' | 'assets' | 'sessions'

interface ProjectPageProps {
  workspaceRoot: string
  project: KanbanProject
}

const TABS: Array<{ id: ProjectTab; label: string; icon: React.ElementType }> = [
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'assets', label: 'Assets', icon: FolderOpen },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare },
]

function ErrorBanner({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mx-3 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  )
}

export function ProjectPage({ workspaceRoot, project }: ProjectPageProps): React.ReactElement {
  const [tab, setTab] = React.useState<ProjectTab>('knowledge')
  const [, setWorkView] = useAtom(workViewAtom)
  const [error, setError] = React.useState<string | null>(null)

  const color = project.color ?? 'hsl(var(--muted-foreground))'

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="titlebar-drag-region flex min-h-9 shrink-0 items-center gap-2 border-b border-border/40 px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWorkView('board')}
          className="titlebar-no-drag h-7 gap-1 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回看板
        </Button>
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h1 className="truncate text-sm font-semibold">{project.name}</h1>
        {project.archivedAt && (
          <span className="ml-1 rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
            已归档
          </span>
        )}
      </div>

      {/* Tabs */}
      <nav className="flex shrink-0 border-b border-border/40 px-3" role="tablist">
        {TABS.map((tabOption) => (
          <button
            key={tabOption.id}
            type="button"
            role="tab"
            aria-selected={tab === tabOption.id}
            onClick={() => setTab(tabOption.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              tab === tabOption.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tabOption.icon className="h-3.5 w-3.5" />
            {tabOption.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'knowledge' && (
          <ProjectKnowledgeTab
            workspaceRoot={workspaceRoot}
            project={project}
            onError={setError}
          />
        )}
        {tab === 'assets' && (
          <ProjectAssetsTab
            workspaceRoot={workspaceRoot}
            project={project}
            onError={setError}
          />
        )}
        {tab === 'sessions' && (
          <ProjectSessionsTab
            workspaceRoot={workspaceRoot}
            project={project}
            onError={setError}
          />
        )}
      </div>
    </div>
  )
}
