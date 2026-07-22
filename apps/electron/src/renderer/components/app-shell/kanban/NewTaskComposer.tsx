import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Plus, X } from 'lucide-react'
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

export function NewTaskComposer({ workspaceRoot, workspaceId, onCreated }: NewTaskComposerProps): React.ReactElement {
  const selectedProjectId = useAtomValue(selectedProjectIdAtom)
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const setNewTaskProjectFlowOpen = useSetAtom(newTaskProjectFlowOpenAtom)
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<QuickTaskDraft>(EMPTY_DRAFT)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setDraft((current) => ({
      ...current,
      projectId: current.projectId || selectedProjectId || '',
    }))
  }, [open, selectedProjectId])

  const submit = async (): Promise<void> => {
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
    setOpen(false)
    await onCreated?.()
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="mb-3 w-full border-dashed"
        onClick={() => {
          if (!selectedProjectId) {
            setNewTaskProjectFlowOpen(true)
            return
          }
          setOpen(true)
        }}
      >
        <Plus className="h-4 w-4" />
        新任务
      </Button>
    )
  }

  return (
    <div className="mb-3 space-y-2 rounded-xl bg-card p-3 shadow-sm ring-1 ring-border/30">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>快速创建任务</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="关闭">
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
      <Button size="sm" className="w-full" disabled={submitting} onClick={() => { void submit() }}>
        {submitting ? '创建中…' : '创建任务'}
      </Button>
    </div>
  )
}
