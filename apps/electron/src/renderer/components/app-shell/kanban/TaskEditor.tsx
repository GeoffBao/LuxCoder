import * as React from 'react'
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  buildTaskEditorSubmission,
  createTaskEditorDraft,
  resolveGeneratedTaskEvent,
  taskSpecToEditorDraft,
  type TaskEditorDraft,
} from './task-editor-model'
import { canDependOn, uid, type EditorSubtask } from './task-spec-form'
import type { KanbanProject, TaskEditorTarget } from './types'

const GENERATE_TIMEOUT_MS = 200_000

type EditorTab = 'definition' | 'results'

type TaskResults = Awaited<ReturnType<typeof window.electronAPI.tasks.getResults>>

export interface TaskEditorProps {
  workspaceRoot: string
  workspaceId: string
  projects: KanbanProject[]
  target?: TaskEditorTarget
  defaultModel?: string
  modelToConnection?: Map<string, string>
  onClose: () => void
  onCreated?: (created: { sessionId: string; slug: string; projectId?: string }) => void | Promise<void>
  onOpenSession?: (sessionId: string) => void
  onOpenChildSession?: (sessionId: string) => void
}

interface SubtaskCardProps {
  index: number
  subtask: EditorSubtask
  allSubtasks: EditorSubtask[]
  onChange: (patch: Partial<EditorSubtask>) => void
  onRemove: () => void
}

function SubtaskCard({
  index,
  subtask,
  allSubtasks,
  onChange,
  onRemove,
}: SubtaskCardProps): React.ReactElement {
  const candidates = allSubtasks.filter((candidate) =>
    !subtask.dependsOn.includes(candidate.uid)
    && canDependOn(allSubtasks, subtask.uid, candidate.uid),
  )
  return (
    <article className="rounded-xl bg-muted/45 p-3 shadow-sm ring-1 ring-border/30">
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={subtask.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="子任务标题"
            className="bg-background"
          />
          <Textarea
            value={subtask.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            placeholder="告诉 Agent 这个节点需要完成什么"
            rows={3}
            className="bg-background"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={subtask.model ?? ''}
              onChange={(event) => onChange({ model: event.target.value || undefined, llmConnection: undefined })}
              placeholder="模型（留空则继承）"
              className="h-8 bg-background text-xs"
            />
            <select
              aria-label="添加依赖"
              value=""
              onChange={(event) => {
                if (event.target.value) onChange({ dependsOn: [...subtask.dependsOn, event.target.value] })
              }}
              className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
            >
              <option value="">添加依赖…</option>
              {candidates.map((candidate) => <option key={candidate.uid} value={candidate.uid}>{candidate.title || '未命名子任务'}</option>)}
            </select>
          </div>
          {subtask.dependsOn.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {subtask.dependsOn.map((dependencyId) => {
                const dependency = allSubtasks.find((candidate) => candidate.uid === dependencyId)
                return (
                  <button
                    key={dependencyId}
                    type="button"
                    onClick={() => onChange({ dependsOn: subtask.dependsOn.filter((id) => id !== dependencyId) })}
                    className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm hover:text-destructive"
                    title="点击移除依赖"
                  >
                    依赖：{dependency?.title || '未命名'} ×
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="删除子任务"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </article>
  )
}

function ResultsPanel({
  results,
  loading,
  onRefresh,
  onOpenChildSession,
}: {
  results: TaskResults
  loading: boolean
  onRefresh: () => void
  onOpenChildSession?: (sessionId: string) => void
}): React.ReactElement {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="font-semibold">运行结果</h2><p className="text-xs text-muted-foreground">{results?.runId ?? '暂无运行记录'}</p></div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />刷新
        </Button>
      </div>
      {!results || results.log.length === 0 ? (
        <div className="rounded-xl bg-muted/40 p-10 text-center text-sm text-muted-foreground">任务尚未运行，暂无结果。</div>
      ) : (
        <div className="space-y-2">
          {results.log.map((entry, index) => {
            const sessionId = 'sessionId' in entry ? entry.sessionId : undefined
            return (
              <div key={`${entry.t}-${index}`} className="flex items-center gap-3 rounded-xl bg-muted/35 px-3 py-2.5 text-sm">
                <span className="min-w-28 text-xs font-medium">{entry.kind}</span>
                {'nodeId' in entry && <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.nodeId}</span>}
                {'reason' in entry && entry.reason && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.reason}</span>}
                {sessionId && onOpenChildSession && (
                  <Button variant="ghost" size="sm" onClick={() => onOpenChildSession(sessionId)}><ExternalLink className="h-3.5 w-3.5" />打开会话</Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function TaskEditor({
  workspaceRoot,
  workspaceId,
  projects,
  target = { mode: 'create' },
  defaultModel = '',
  modelToConnection = new Map(),
  onClose,
  onCreated,
  onOpenSession,
  onOpenChildSession,
}: TaskEditorProps): React.ReactElement {
  const [draft, setDraft] = React.useState<TaskEditorDraft>(() => createTaskEditorDraft(target, defaultModel))
  const [tab, setTab] = React.useState<EditorTab>('definition')
  const [loading, setLoading] = React.useState(target.mode === 'edit')
  const [busy, setBusy] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [results, setResults] = React.useState<TaskResults>(null)
  const generatedDraftRef = React.useRef<string | null>(null)
  const pendingGenerationRef = React.useRef<string | null>(null)
  const generationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const patchDraft = (patch: Partial<TaskEditorDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const applySpec = React.useCallback(async (slug: string): Promise<void> => {
    const validation = await window.electronAPI.tasks.get(workspaceRoot, slug)
    if (!validation?.valid || !validation.spec) throw new Error('任务定义不存在或未通过校验')
    const nextDraft = taskSpecToEditorDraft(validation.spec, target, defaultModel)
    setDraft(target.mode === 'create' ? { ...nextDraft, fixedId: slug } : nextDraft)
  }, [defaultModel, target, workspaceRoot])

  React.useEffect(() => {
    if (target.mode !== 'edit') return
    let cancelled = false
    setLoading(true)
    void window.electronAPI.tasks.get(workspaceRoot, target.taskSlug).then((validation) => {
      if (cancelled) return
      if (!validation?.valid || !validation.spec) throw new Error('无法读取任务定义')
      setDraft(taskSpecToEditorDraft(validation.spec, target, defaultModel))
    }).catch((cause: unknown) => {
      if (!cancelled) toast.error('加载任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [defaultModel, target, workspaceRoot])

  const finishGeneration = React.useCallback((): void => {
    pendingGenerationRef.current = null
    if (generationTimerRef.current) clearTimeout(generationTimerRef.current)
    generationTimerRef.current = null
    setGenerating(false)
  }, [])

  React.useEffect(() => window.electronAPI.tasks.onGenerated((event) => {
    const action = resolveGeneratedTaskEvent(event, workspaceId, pendingGenerationRef.current)
    if (action.kind === 'ignore') return
    finishGeneration()
    if (action.kind === 'error') {
      void window.electronAPI.deleteAgentSession(event.orchestratorSessionId).catch(() => undefined)
      toast.error('生成任务失败', { description: action.message })
      return
    }
    generatedDraftRef.current = event.orchestratorSessionId
    void applySpec(action.slug).catch((cause: unknown) => {
      toast.error('读取生成结果失败', { description: cause instanceof Error ? cause.message : String(cause) })
    })
  }), [applySpec, finishGeneration, workspaceId])

  React.useEffect(() => () => {
    if (generationTimerRef.current) clearTimeout(generationTimerRef.current)
    const drafts = new Set([generatedDraftRef.current, pendingGenerationRef.current].filter((id): id is string => Boolean(id)))
    for (const draftId of drafts) void window.electronAPI.deleteAgentSession(draftId).catch(() => undefined)
  }, [])

  const addSubtask = (): void => {
    setDraft((current) => {
      const last = current.subtasks.at(-1)
      return {
        ...current,
        subtasks: [
          ...current.subtasks,
          { uid: uid(), title: '', prompt: '', dependsOn: last ? [last.uid] : [] },
        ],
      }
    })
  }

  const updateSubtask = (rowId: string, patch: Partial<EditorSubtask>): void => {
    setDraft((current) => ({
      ...current,
      subtasks: current.subtasks.map((subtask) => subtask.uid === rowId ? { ...subtask, ...patch } : subtask),
    }))
  }

  const removeSubtask = (rowId: string): void => {
    setDraft((current) => ({
      ...current,
      subtasks: current.subtasks
        .filter((subtask) => subtask.uid !== rowId)
        .map((subtask) => ({ ...subtask, dependsOn: subtask.dependsOn.filter((id) => id !== rowId) })),
    }))
  }

  const generate = async (): Promise<void> => {
    const goal = draft.goal.trim() || draft.title.trim()
    if (!goal) { toast.error('请先输入任务目标'); return }
    if (generatedDraftRef.current) {
      void window.electronAPI.deleteAgentSession(generatedDraftRef.current).catch(() => undefined)
      generatedDraftRef.current = null
    }
    setGenerating(true)
    try {
      const ack = await window.electronAPI.tasks.generate(workspaceRoot, workspaceId, {
        goal,
        ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
      })
      pendingGenerationRef.current = ack.orchestratorSessionId
      generationTimerRef.current = setTimeout(() => {
        if (pendingGenerationRef.current !== ack.orchestratorSessionId) return
        finishGeneration()
        void window.electronAPI.deleteAgentSession(ack.orchestratorSessionId).catch(() => undefined)
        toast.error('生成任务超时，请稍后重试')
      }, GENERATE_TIMEOUT_MS)
    } catch (cause) {
      finishGeneration()
      toast.error('生成任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const submit = async (runAfterCreate: boolean): Promise<void> => {
    if (!draft.title.trim()) { toast.error('请输入任务标题'); return }
    if (draft.subtasks.length === 0) { toast.error('至少需要一个子任务'); return }
    if (draft.subtasks.some((subtask) => !subtask.prompt.trim())) { toast.error('每个子任务都需要执行提示'); return }
    setBusy(true)
    try {
      const submission = buildTaskEditorSubmission(draft, target, generatedDraftRef.current, modelToConnection)
      const created = await window.electronAPI.tasks.create(workspaceRoot, workspaceId, submission.request)
      generatedDraftRef.current = null
      if (runAfterCreate) {
        try {
          await window.electronAPI.tasks.run(workspaceRoot, workspaceId, created.slug, {
            orchestratorSessionId: created.orchestratorSessionId,
          })
          toast.success('任务已创建并开始运行')
        } catch (cause) {
          toast.error('任务已保存，但启动失败', { description: cause instanceof Error ? cause.message : String(cause) })
        }
      } else {
        toast.success(target.mode === 'edit' ? '任务定义已保存' : '任务已创建')
      }
      const createdEvent = {
        sessionId: created.orchestratorSessionId,
        slug: created.slug,
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
      }
      onClose()
      void Promise.resolve(onCreated?.(createdEvent)).catch((cause: unknown) => {
        toast.error('任务已保存，但刷新看板失败', { description: cause instanceof Error ? cause.message : String(cause) })
      })
    } catch (cause) {
      toast.error('保存任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const loadResults = React.useCallback(async (): Promise<void> => {
    if (target.mode !== 'edit') return
    setLoading(true)
    try {
      setResults(await window.electronAPI.tasks.getResults(workspaceRoot, target.taskSlug))
    } catch (cause) {
      toast.error('读取运行结果失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setLoading(false)
    }
  }, [target, workspaceRoot])

  React.useEffect(() => {
    if (tab === 'results' && results === null) void loadResults()
  }, [loadResults, results, tab])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-background p-3">
      <header className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4" />返回看板</Button>
        <span className="text-sm font-semibold">{target.mode === 'edit' ? '编辑任务' : '新建完整任务'}</span>
        {target.mode === 'edit' && (
          <div className="ml-2 inline-flex rounded-lg bg-muted p-1">
            {(['definition', 'results'] as EditorTab[]).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={cn('rounded-md px-2.5 py-1 text-xs', tab === value && 'bg-card shadow-sm')}>
                {value === 'definition' ? '任务定义' : '运行结果'}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {target.mode === 'edit' && onOpenSession && <Button variant="outline" size="sm" onClick={() => onOpenSession(target.sessionId)}><ExternalLink className="h-4 w-4" />打开会话</Button>}
          {tab === 'definition' && (
            <>
              <Button variant="outline" size="sm" disabled={busy || generating} onClick={() => void submit(false)}>{target.mode === 'edit' ? '保存' : '创建'}</Button>
              <Button size="sm" disabled={busy || generating} onClick={() => void submit(true)}>
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {target.mode === 'edit' ? '保存并运行' : '创建并运行'}
              </Button>
            </>
          )}
        </div>
      </header>

      {tab === 'results' ? (
        <ResultsPanel results={results} loading={loading} onRefresh={() => void loadResults()} onOpenChildSession={onOpenChildSession} />
      ) : loading ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />加载任务定义…</div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.4fr)]">
          <section className="space-y-4 overflow-y-auto rounded-2xl bg-card p-4 shadow-sm">
            <div><h2 className="font-semibold">任务定义</h2><p className="text-xs text-muted-foreground">描述目标，并选择项目与执行策略。</p></div>
            <label className="block space-y-1.5 text-xs font-medium">标题<Input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} placeholder="例如：完成桌面端发布" /></label>
            <label className="block space-y-1.5 text-xs font-medium">目标<Textarea value={draft.goal} onChange={(event) => patchDraft({ goal: event.target.value })} placeholder="说明最终希望达成的结果" rows={4} /></label>
            <label className="block space-y-1.5 text-xs font-medium">验收标准<Textarea value={draft.acceptanceCriteria ?? ''} onChange={(event) => patchDraft({ acceptanceCriteria: event.target.value })} placeholder="可选：如何判断任务完成" rows={3} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium">项目<select value={draft.projectId} onChange={(event) => patchDraft({ projectId: event.target.value })} className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"><option value="">无项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label className="space-y-1.5 text-xs font-medium">权限<select value={draft.permissionMode ?? 'allow-all'} onChange={(event) => patchDraft({ permissionMode: event.target.value as 'safe' | 'ask' | 'allow-all' })} className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"><option value="allow-all">自动执行</option><option value="ask">需要确认</option><option value="safe">安全模式</option></select></label>
              <label className="space-y-1.5 text-xs font-medium">Orchestrator 模型<Input value={draft.orchModel} onChange={(event) => patchDraft({ orchModel: event.target.value, orchConnection: undefined })} placeholder="留空则使用工作区默认" /></label>
              <label className="space-y-1.5 text-xs font-medium">最大修复次数<Input type="number" min={0} max={10} value={draft.maxRepairs ?? ''} onChange={(event) => patchDraft({ maxRepairs: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="默认 3" /></label>
            </div>
            <label className="block space-y-1.5 text-xs font-medium">工作目录<Input value={draft.cwd ?? ''} onChange={(event) => patchDraft({ cwd: event.target.value })} placeholder="可选：绝对路径" /></label>
            <Button variant="outline" className="w-full" disabled={generating} onClick={() => void generate()}>
              {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Agent 正在生成 DAG…' : '让 Agent 生成任务计划'}
            </Button>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl bg-card shadow-sm">
            <header className="flex items-center gap-2 px-4 py-3"><div><h2 className="font-semibold">子任务 DAG</h2><p className="text-xs text-muted-foreground">依赖关系决定执行顺序。</p></div><span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{draft.subtasks.length}</span><Button variant="outline" size="sm" className="ml-auto" onClick={addSubtask}><Plus className="h-4 w-4" />添加节点</Button></header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
              {draft.subtasks.map((subtask, index) => (
                <SubtaskCard
                  key={subtask.uid}
                  index={index}
                  subtask={subtask}
                  allSubtasks={draft.subtasks}
                  onChange={(patch) => updateSubtask(subtask.uid, patch)}
                  onRemove={() => removeSubtask(subtask.uid)}
                />
              ))}
              {draft.subtasks.length === 0 && <button type="button" onClick={addSubtask} className="w-full rounded-xl border border-dashed border-border/70 py-12 text-sm text-muted-foreground hover:bg-muted/40"><Plus className="mx-auto mb-2 h-5 w-5" />添加第一个子任务</button>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
