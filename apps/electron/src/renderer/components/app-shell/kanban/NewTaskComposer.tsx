import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectedProjectIdAtom, serverKanbanProjectsAtom } from '@/atoms/project-atoms'
import { newTaskProjectFlowOpenAtom } from '@/atoms/project-context-picker'
import { submitQuickTask, type QuickTaskDraft } from './quick-task-model'

interface NewTaskComposerProps {
  workspaceRoot: string
  workspaceId: string
  onCreated?: () => void | Promise<void>
}

const EMPTY_DRAFT: QuickTaskDraft = { title: '', goal: '', projectId: '' }

/**
 * 看板"新建任务"入口，对齐 craft 的两层模型：
 * - 默认是列顶部常驻的单行标题输入框（对齐 craft 截图）——回车直接建一个普通会话
 *   落到待办列，不生成 task spec；后续要不要变成正式任务，靠卡片的「编辑任务」升级。
 * - 右侧「详细设置」图标按钮展开成原有的完整表单（标题+目标+项目），走
 *   tasks:create 生成真正的 task spec（子任务 DAG 场景仍然需要这条重路径）。
 */
export function NewTaskComposer({ workspaceRoot, workspaceId, onCreated }: NewTaskComposerProps): React.ReactElement {
  const selectedProjectId = useAtomValue(selectedProjectIdAtom)
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const setNewTaskProjectFlowOpen = useSetAtom(newTaskProjectFlowOpenAtom)
  const [detailed, setDetailed] = React.useState(false)
  const [quickTitle, setQuickTitle] = React.useState('')
  const [quickCreating, setQuickCreating] = React.useState(false)
  const [draft, setDraft] = React.useState<QuickTaskDraft>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!detailed) return
    setDraft((current) => ({
      ...current,
      projectId: current.projectId || selectedProjectId || '',
    }))
  }, [detailed, selectedProjectId])

  const requireProject = (): boolean => {
    if (selectedProjectId) return true
    setNewTaskProjectFlowOpen(true)
    return false
  }

  /** 轻量创建：只要标题，直接建普通会话落到待办列——对齐 craft 看板内联输入框；
   * 是否升级成正式任务留给卡片右上角的「编辑任务」（不要求已绑定 task spec）。 */
  const submitQuick = async (): Promise<void> => {
    const title = quickTitle.trim()
    if (!title || quickCreating) return
    if (!selectedProjectId) { requireProject(); return }
    setQuickCreating(true)
    try {
      const created = await window.electronAPI.createAgentSession(title, undefined, workspaceId)
      await window.electronAPI.sendSessionCommand(created.id, { kind: 'set_project_id', projectId: selectedProjectId })
      setQuickTitle('')
      await onCreated?.()
    } catch (cause) {
      toast.error('创建任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setQuickCreating(false)
    }
  }

  const submitDetailed = async (): Promise<void> => {
    if (submitting) return
    if (!draft.projectId.trim()) {
      toast.error('请选择项目')
      return
    }
    setSubmitting(true)
    const result = await submitQuickTask({
      draft,
      fallbackId: `quick-${Date.now()}`,
      create: (request) => window.electronAPI.tasks.create(workspaceRoot, workspaceId, request),
    })
    setSubmitting(false)
    setDraft(result.ok
      ? { ...result.draft, projectId: selectedProjectId || draft.projectId }
      : result.draft)
    if (!result.ok) {
      toast.error('创建任务失败', { description: result.error })
      return
    }
    toast.success('任务已创建')
    setDetailed(false)
    await onCreated?.()
  }

  if (detailed) {
    return (
      <div className="mb-3 space-y-2 rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/30">
        <div className="flex items-center justify-between text-xs font-medium">
          <span>详细设置</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setDetailed(false)} aria-label="关闭">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <select
          value={draft.projectId}
          onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
        >
          <option value="" disabled>请选择项目</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <Input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="任务标题"
        />
        <Textarea
          value={draft.goal}
          onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))}
          placeholder="任务目标"
          rows={3}
        />
        <Button size="sm" className="w-full" disabled={submitting} onClick={() => { void submitDetailed() }}>
          {submitting ? '创建中…' : '创建任务'}
        </Button>
      </div>
    )
  }

  return (
    <div className="mb-3 flex items-center gap-1.5">
      <Input
        value={quickTitle}
        onChange={(event) => setQuickTitle(event.target.value)}
        placeholder="任务标题…"
        disabled={quickCreating}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void submitQuick()
          }
        }}
        className="h-9"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        title="详细设置（目标、项目、子任务…）"
        aria-label="详细设置"
        onClick={() => { if (requireProject()) setDetailed(true) }}
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
