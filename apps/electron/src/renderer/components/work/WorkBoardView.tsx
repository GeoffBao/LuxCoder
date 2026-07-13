import React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { FolderKanban, Pause, Play, Plus, RefreshCw, Square } from 'lucide-react'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import {
  kanbanErrorAtom,
  kanbanLoadingAtom,
  kanbanProjectsAtom,
  kanbanTasksAtom,
  type KanbanColumnId,
  type KanbanTaskCard,
} from '@/atoms/kanban-atoms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const COLUMNS: Array<{ id: KanbanColumnId; label: string }> = [
  { id: 'todo', label: '待处理' },
  { id: 'in-progress', label: '进行中' },
  { id: 'done', label: '已完成' },
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function toTaskCard(slug: string, value: unknown): KanbanTaskCard | null {
  const root = asRecord(value)
  const spec = asRecord(root?.spec ?? value)
  if (!spec || typeof spec.title !== 'string' || typeof spec.goal !== 'string') return null
  return { slug, title: spec.title, goal: spec.goal, column: 'todo' }
}

function toSlug(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `task-${Date.now()}`
}

export function WorkBoardView(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const workspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0]
  const [tasks, setTasks] = useAtom(kanbanTasksAtom)
  const [projects, setProjects] = useAtom(kanbanProjectsAtom)
  const [loading, setLoading] = useAtom(kanbanLoadingAtom)
  const [error, setError] = useAtom(kanbanErrorAtom)
  const [newTitle, setNewTitle] = React.useState('')
  const [newGoal, setNewGoal] = React.useState('')
  const [showComposer, setShowComposer] = React.useState(false)
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!workspace) return
    setLoading(true)
    setError(null)
    try {
      const root = await window.electronAPI.getWorkspaceFilesPath(workspace.slug)
      setWorkspaceRoot(root)
      const [loadedProjects, slugs] = await Promise.all([
        window.electronAPI.getProjects(root),
        window.electronAPI.listTasks(root),
      ])
      setProjects(loadedProjects)
      const loadedTasks = await Promise.all(slugs.map(async (slug) => toTaskCard(slug, await window.electronAPI.getTask(root, slug))))
      setTasks(loadedTasks.filter((task): task is KanbanTaskCard => task !== null))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载 Kanban 数据失败')
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setProjects, setTasks, workspace])

  React.useEffect(() => { void refresh() }, [refresh])

  React.useEffect(() => {
    const offProjects = window.electronAPI.onProjectsChanged(() => { void refresh() })
    const offGenerated = window.electronAPI.onTaskGenerated(() => { void refresh() })
    return () => { offProjects(); offGenerated() }
  }, [refresh])

  const updateRun = React.useCallback(async (task: KanbanTaskCard, action: 'run' | 'pause' | 'stop'): Promise<void> => {
    if (!workspaceRoot || !workspaceId) return
    try {
      if (action === 'run') {
        const snapshot = await window.electronAPI.runTask(workspaceRoot, workspaceId, task.slug)
        const run = asRecord(snapshot)
        const runId = typeof run?.runId === 'string' ? run.runId : task.runId
        setTasks((current) => current.map((item) => item.slug === task.slug ? { ...item, column: 'in-progress', runId } : item))
      } else if (task.runId) {
        if (action === 'pause') await window.electronAPI.pauseTask(workspaceRoot, workspaceId, task.slug, task.runId)
        if (action === 'stop') await window.electronAPI.stopKanbanTask(workspaceRoot, workspaceId, task.slug, task.runId)
        setTasks((current) => current.map((item) => item.slug === task.slug ? { ...item, column: action === 'stop' ? 'todo' : item.column } : item))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务操作失败')
    }
  }, [setError, setTasks, workspaceId, workspaceRoot])

  const createTask = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspaceId || !newTitle.trim() || !newGoal.trim()) return
    const slug = toSlug(newTitle)
    const yaml = `id: ${slug}\ntitle: ${newTitle.trim()}\ngoal: ${newGoal.trim()}\nnodes:\n  - id: execute\n    title: ${newTitle.trim()}\n    prompt: ${newGoal.trim()}\n`
    try {
      await window.electronAPI.createTask(workspaceRoot, workspaceId, { yaml })
      setNewTitle(''); setNewGoal(''); setShowComposer(false); await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建任务失败')
    }
  }, [newGoal, newTitle, refresh, setError, workspaceId, workspaceRoot])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><FolderKanban className="h-5 w-5" /></div>
          <div><h1 className="text-lg font-semibold">Projects & Kanban</h1><p className="text-xs text-muted-foreground">{workspace?.name ?? '请选择工作区'} · {projects.length} 个项目</p></div>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4" />刷新</Button><Button size="sm" onClick={() => setShowComposer((value) => !value)}><Plus className="mr-1 h-4 w-4" />新任务</Button></div>
      </div>
      {showComposer && <div className="mb-4 grid gap-2 rounded-xl bg-card p-4 shadow-sm md:grid-cols-[1fr_2fr_auto]"><Input placeholder="任务标题" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /><Input placeholder="目标描述" value={newGoal} onChange={(event) => setNewGoal(event.target.value)} /><Button onClick={() => void createTask()}>创建</Button></div>}
      {error && <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid min-h-0 flex-1 gap-4 overflow-auto md:grid-cols-3">
        {COLUMNS.map((column) => <section key={column.id} className="min-h-[180px] rounded-2xl bg-muted/40 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">{column.label}</h2><span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{tasks.filter((task) => task.column === column.id).length}</span></div><div className="space-y-3">{tasks.filter((task) => task.column === column.id).map((task) => <article key={task.slug} className="rounded-xl bg-card p-3 shadow-sm"><div className="mb-1 text-sm font-medium">{task.title}</div><p className="line-clamp-3 text-xs text-muted-foreground">{task.goal}</p><div className="mt-3 flex gap-1">{column.id === 'todo' && <Button size="icon" variant="ghost" title="运行" onClick={() => void updateRun(task, 'run')}><Play className="h-4 w-4" /></Button>}{column.id === 'in-progress' && <><Button size="icon" variant="ghost" title="暂停" onClick={() => void updateRun(task, 'pause')}><Pause className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="停止" onClick={() => void updateRun(task, 'stop')}><Square className="h-4 w-4" /></Button></>}</div></article>)}</div></section>)}
      </div>
    </div>
  )
}
