import * as React from 'react'
import { useAtomValue } from 'jotai'
import { ChevronDown, GitBranch, LoaderCircle, Play, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import {
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
  type ToolActivity,
} from '@/atoms/agent-atoms'
import { kanbanSpecNodesAtom } from '@/atoms/kanban-atoms'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getToolDisplayName } from './tool-utils'
import { mergeSubtaskRows, type SpecNodeSummary } from '../app-shell/kanban/subtask-merge'
import { SubtaskProgress } from '../app-shell/kanban/SubtaskProgress'
import { SubtaskRow } from '../app-shell/kanban/SubtaskRow'
import { deriveSubtaskRunState } from '../app-shell/kanban/kanban-view-model'
import type { KanbanSubtask } from '../app-shell/kanban/types'
import { useOpenSession } from '@/hooks/useOpenSession'

interface AgentTaskPanelProps {
  sessionId: string
}

function summarizeLiveActivity(activities: ToolActivity[], content: string): string | null {
  const active = [...activities].reverse().find((item) => !item.done)
  if (active) {
    const label = active.displayName || active.intent || getToolDisplayName(active.toolName)
    return label
  }
  const done = activities.filter((item) => item.done)
  if (done.length > 0) {
    const last = done[done.length - 1]!
    return `${getToolDisplayName(last.toolName)} · ${done.length} 次工具`
  }
  const snippet = content.trim().replace(/\s+/g, ' ')
  if (!snippet) return null
  return snippet.length > 72 ? `${snippet.slice(0, 72)}…` : snippet
}

function resolveFocusSubtask(subtasks: KanbanSubtask[]): KanbanSubtask | null {
  return subtasks.find((subtask) => subtask.runState === 'running')
    ?? subtasks.find((subtask) => subtask.runState === 'pending' && subtask.sessionId)
    ?? null
}

/** Code/Agent 会话内的任务编排条：默认紧凑，展开看全 DAG；对齐 craft TaskChatPreview。 */
export function AgentTaskPanel({ sessionId }: AgentTaskPanelProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const streamStates = useAtomValue(agentStreamingStatesAtom)
  const specNodesBySlug = useAtomValue(kanbanSpecNodesAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const openSession = useOpenSession()
  // 默认紧凑，避免 5+ 节点占满对话区
  const [expanded, setExpanded] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [localNodes, setLocalNodes] = React.useState<SpecNodeSummary[] | null>(null)

  const session = sessions.find((candidate) => candidate.id === sessionId)
  const orchestratorSession = React.useMemo(() => {
    if (!session) return undefined
    if (!session.parentSessionId) return session
    return sessions.find((candidate) => candidate.id === session.parentSessionId) ?? session
  }, [session, sessions])

  const orchestratorSessionId = orchestratorSession?.id
  const taskSlug = orchestratorSession?.taskSlug ?? session?.taskSlug
  const workspace = workspaces.find((candidate) => candidate.id === (orchestratorSession?.workspaceId ?? session?.workspaceId ?? currentWorkspaceId))
  const [workspaceRoot, setWorkspaceRoot] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!workspace) { setWorkspaceRoot(null); return }
    let cancelled = false
    void window.electronAPI.getWorkspaceRootPath(workspace.slug).then((root) => {
      if (!cancelled) setWorkspaceRoot(root)
    }).catch(() => {
      if (!cancelled) setWorkspaceRoot(null)
    })
    return () => { cancelled = true }
  }, [workspace])

  React.useEffect(() => {
    if (!workspaceRoot || !taskSlug) { setLocalNodes(null); return }
    if (specNodesBySlug.has(taskSlug)) { setLocalNodes(null); return }
    let cancelled = false
    void window.electronAPI.tasks.get(workspaceRoot, taskSlug).then((validation) => {
      if (cancelled || !validation?.valid || !validation.spec?.nodes) return
      setLocalNodes(validation.spec.nodes.map((node) => ({
        id: node.id,
        title: node.title ?? node.id,
        ...(node.model ? { model: node.model } : {}),
      })))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [specNodesBySlug, taskSlug, workspaceRoot])

  const subtasks = React.useMemo((): KanbanSubtask[] => {
    if (!orchestratorSession || !orchestratorSessionId || !taskSlug) return []
    const children = sessions
      .filter((candidate) => candidate.parentSessionId === orchestratorSessionId && !candidate.archived && !candidate.taskDraft)
      .map((child) => ({
        id: child.id,
        title: child.title,
        runState: streamStates.get(child.id)?.running ? 'running' as const : deriveSubtaskRunState(child),
        model: child.modelId ?? orchestratorSession.modelId ?? '',
        ...(child.taskNodeId ? { taskNodeId: child.taskNodeId } : {}),
        createdAt: child.createdAt,
      }))
    const nodes = specNodesBySlug.get(taskSlug) ?? localNodes ?? undefined
    return mergeSubtaskRows(nodes, children, orchestratorSession.modelId ?? '').map((row) => {
      if (!row.sessionId || !streamStates.get(row.sessionId)?.running) return row
      return { ...row, runState: 'running' as const }
    })
  }, [localNodes, orchestratorSession, orchestratorSessionId, sessions, specNodesBySlug, streamStates, taskSlug])

  if (!session || !taskSlug || !orchestratorSession || !orchestratorSessionId) return null

  const viewingChild = Boolean(session.parentSessionId)
  // 「运行中」只认真实流式，避免 sessionStatus 陈旧导致编排条挂十几小时
  const live = Boolean(streamStates.get(orchestratorSessionId)?.running)
    || subtasks.some((subtask) => Boolean(subtask.sessionId && streamStates.get(subtask.sessionId)?.running))
    || Boolean(streamStates.get(sessionId)?.running)
  const done = subtasks.filter((subtask) => subtask.runState === 'done').length
  const total = Math.max(subtasks.length, orchestratorSession.taskNodeCount ?? 0)
  const focus = resolveFocusSubtask(subtasks)
  const focusStream = focus?.sessionId ? streamStates.get(focus.sessionId) : undefined
  const focusActivity = focusStream?.running
    ? summarizeLiveActivity(focusStream.toolActivities, focusStream.content)
    : null

  const runTask = async (): Promise<void> => {
    if (!workspaceRoot || !workspace || !taskSlug) return
    setRunning(true)
    try {
      await window.electronAPI.tasks.run(workspaceRoot, workspace.id, taskSlug, {
        orchestratorSessionId,
      })
      toast.success('任务已开始运行')
    } catch (cause) {
      toast.error('启动任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setRunning(false)
    }
  }

  const openOrchestrator = (): void => {
    openSession('agent', orchestratorSessionId, orchestratorSession.title)
  }

  const openFocusOrExpand = (): void => {
    if (focus?.sessionId) {
      const child = sessions.find((candidate) => candidate.id === focus.sessionId)
      if (child) {
        openSession('agent', child.id, child.title)
        return
      }
    }
    setExpanded(true)
  }

  return (
    <section className={cn(
      'mx-2.5 mb-2 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm md:mx-[18px]',
      live && 'border-amber-500/40 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]',
    )}
    >
      <div className="flex items-center gap-2">
        <Workflow className={cn('h-4 w-4 shrink-0 text-primary', live && 'animate-pulse')} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((value) => !value)}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span>任务编排</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <GitBranch className="h-3 w-3" />{taskSlug}
            </span>
            {total > 0 && (
              <span className="tabular-nums text-muted-foreground">{done}/{total}</span>
            )}
            {live && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <LoaderCircle className="h-3 w-3 animate-spin" />运行中
              </span>
            )}
          </div>
          {/* 紧凑态：当前节点一行，不展开全 DAG */}
          {!expanded && focus && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              <span className={cn(live && 'text-amber-600 dark:text-amber-400')}>{focus.title}</span>
              {focusActivity ? ` · ${focusActivity}` : null}
            </div>
          )}
        </button>
        {viewingChild && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={openOrchestrator}
          >
            回编排
          </Button>
        )}
        {!viewingChild && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2"
            disabled={running || live || subtasks.length === 0}
            onClick={() => void runTask()}
          >
            {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            运行
          </Button>
        )}
        <button
          type="button"
          aria-label={expanded ? '收起子任务' : '展开子任务'}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>
      {!expanded && focus?.sessionId && (
        <button
          type="button"
          className="mt-1 w-full rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted/60"
          onClick={openFocusOrExpand}
        >
          打开当前子任务 →
        </button>
      )}
      {expanded && subtasks.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded-lg bg-muted/40 p-1.5">
          <SubtaskProgress subtasks={subtasks} total={total} className="px-1" />
          <div className="space-y-0.5">
            {subtasks.map((subtask) => {
              const childStream = subtask.sessionId ? streamStates.get(subtask.sessionId) : undefined
              const activity = childStream?.running
                ? summarizeLiveActivity(childStream.toolActivities, childStream.content)
                : null
              const isCurrent = subtask.sessionId === sessionId
              return (
                <div key={subtask.id} className="space-y-0.5">
                  <SubtaskRow
                    subtask={subtask}
                    active={isCurrent}
                    onClick={subtask.sessionId
                      ? () => {
                          const child = sessions.find((candidate) => candidate.id === subtask.sessionId)
                          if (child) openSession('agent', child.id, child.title)
                        }
                      : undefined}
                  />
                  {activity && (
                    <div className={cn(
                      'ml-6 truncate pb-1 text-[11px] text-muted-foreground',
                      isCurrent && 'text-amber-600 dark:text-amber-400',
                    )}
                    >
                      <LoaderCircle className="mr-1 inline h-3 w-3 animate-spin" />
                      {activity}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {expanded && subtasks.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">尚未生成子任务节点；可在看板编辑任务定义。</p>
      )}
    </section>
  )
}
