/**
 * ProjectSettingsDialog — 项目设置弹窗
 *
 * 从看板顶部 ⚙️ 按钮触发，编辑项目元信息、默认专家、Kanban 列和 MEMORY.md。
 */

import * as React from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { WorkingDirectoryField } from '@/components/app-shell/kanban/WorkingDirectoryField'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useExpertOptions } from '@/components/agent-experts/useExpertOptions'
import type { KanbanProject } from '@/components/app-shell/kanban/types'

// ── types ──────────────────────────────────────

interface ProjectColumnDraft {
  id: string
  name: string
  color?: string
  dropStatusId?: string
}

interface ProjectSettingsDraft {
  name: string
  description: string
  details: string
  color: string
  workingDirectory: string
  defaultExpertId: string
}

// ── helpers ────────────────────────────────────

function buildProjectUpdate(draft: ProjectSettingsDraft & { kanbanColumns?: ProjectColumnDraft[] }): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    name: draft.name,
    description: draft.description || undefined,
    details: draft.details || undefined,
    color: draft.color || undefined,
    workingDirectory: draft.workingDirectory || undefined,
    defaultExpertId: draft.defaultExpertId || undefined,
    kanbanColumns: draft.kanbanColumns?.length ? draft.kanbanColumns : undefined,
  }
  return patch
}

// ── component ──────────────────────────────────

export interface ProjectSettingsDialogProps {
  open: boolean
  workspaceRoot: string
  project: KanbanProject
  onOpenChange: (open: boolean) => void
  onProjectChanged: (project: KanbanProject) => void
}

export function ProjectSettingsDialog({
  open,
  workspaceRoot,
  project,
  onOpenChange,
  onProjectChanged,
}: ProjectSettingsDialogProps): React.ReactElement {
  const { options: expertOptions } = useExpertOptions()
  const slug = project.slug

  const [settingsDraft, setSettingsDraft] = React.useState<ProjectSettingsDraft>({
    name: project.name,
    description: project.description ?? '',
    details: project.details ?? '',
    color: project.color ?? '',
    workingDirectory: project.workingDirectory ?? '',
    defaultExpertId: project.defaultExpertId ?? '',
  })
  const [columns, setColumns] = React.useState<ProjectColumnDraft[]>(project.kanbanColumns ?? [])
  const [memory, setMemory] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // 重置 draft 当 project 变化
  React.useEffect(() => {
    setSettingsDraft({
      name: project.name,
      description: project.description ?? '',
      details: project.details ?? '',
      color: project.color ?? '',
      workingDirectory: project.workingDirectory ?? '',
      defaultExpertId: project.defaultExpertId ?? '',
    })
    setColumns(project.kanbanColumns ?? [])
  }, [project])

  // 加载 MEMORY.md
  React.useEffect(() => {
    if (!open || !slug) return
    window.electronAPI.projects.readMemory(workspaceRoot, slug)
      .then(setMemory)
      .catch(() => setMemory(''))
  }, [open, slug, workspaceRoot])

  const saveSettings = async (): Promise<void> => {
    if (!slug || !settingsDraft.name.trim()) {
      toast.error('项目名称不能为空')
      return
    }
    setBusy(true)
    try {
      const updated = await window.electronAPI.projects.update(
        workspaceRoot,
        slug,
        buildProjectUpdate({ ...settingsDraft, kanbanColumns: columns }),
      )
      // 如果有 MEMORY.md 变更，也保存
      if (memory !== '') {
        await window.electronAPI.projects.writeMemory(workspaceRoot, slug, memory)
      }
      onProjectChanged(updated)
      toast.success('项目设置已保存')
      onOpenChange(false)
    } catch (cause) {
      toast.error('保存失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>⚙️ 项目设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 基本 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium">
              项目名称
              <Input
                value={settingsDraft.name}
                onChange={(e) => setSettingsDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              强调色
              <Input
                type="color"
                value={settingsDraft.color || '#6366f1'}
                onChange={(e) => setSettingsDraft((d) => ({ ...d, color: e.target.value }))}
              />
            </label>
          </div>

          {/* 工作目录 */}
          <div className="space-y-1.5 text-xs font-medium">
            <span>工作目录</span>
            <WorkingDirectoryField
              value={settingsDraft.workingDirectory}
              onChange={(path) => setSettingsDraft((d) => ({ ...d, workingDirectory: path }))}
            />
            <p className="text-[11px] font-normal text-muted-foreground">
              可选；留空则使用托管 workdir
            </p>
          </div>

          {/* 默认专家 */}
          <label className="block space-y-1.5 text-xs font-medium">
            默认专家
            <select
              value={settingsDraft.defaultExpertId}
              onChange={(e) => setSettingsDraft((d) => ({ ...d, defaultExpertId: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-border/60 bg-background/40 px-3 py-1 text-sm"
            >
              <option value="">未设置</option>
              {expertOptions.map((expert) => (
                <option key={expert.id} value={expert.id}>{expert.label}</option>
              ))}
            </select>
          </label>

          {/* 描述 */}
          <label className="block space-y-1.5 text-xs font-medium">
            描述
            <Input
              value={settingsDraft.description}
              onChange={(e) => setSettingsDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            项目说明
            <Textarea
              value={settingsDraft.details}
              onChange={(e) => setSettingsDraft((d) => ({ ...d, details: e.target.value }))}
              rows={4}
            />
          </label>

          {/* Kanban 列 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">自定义 Kanban 列</h3>
                <p className="text-xs text-muted-foreground">留空时使用默认列。</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumns((c) => [...c, { id: `column-${Date.now()}`, name: '新列' }])}
              >
                <Plus className="h-4 w-4" />添加列
              </Button>
            </div>
            {columns.map((column, index) => (
              <div key={column.id} className="grid gap-2 rounded-xl bg-muted/35 p-3 sm:grid-cols-[1fr_120px_1fr_auto]">
                <Input
                  value={column.name}
                  onChange={(e) => setColumns((c) =>
                    c.map((item, i) => i === index ? { ...item, name: e.target.value } : item),
                  )}
                  placeholder="列名"
                />
                <Input
                  type="color"
                  value={column.color ?? '#64748b'}
                  onChange={(e) => setColumns((c) =>
                    c.map((item, i) => i === index ? { ...item, color: e.target.value } : item),
                  )}
                />
                <Input
                  value={column.dropStatusId ?? ''}
                  onChange={(e) => setColumns((c) =>
                    c.map((item, i) =>
                      i === index ? { ...item, dropStatusId: e.target.value || undefined } : item,
                    ),
                  )}
                  placeholder="拖入时状态"
                />
                <Button variant="ghost" size="icon" onClick={() => setColumns((c) => c.filter((_, i) => i !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* MEMORY.md */}
          <div className="space-y-3 border-t border-border/40 pt-4">
            <div>
              <h3 className="text-sm font-semibold">MEMORY.md</h3>
              <p className="text-xs text-muted-foreground">供项目内 Agent 共享的长期上下文。</p>
            </div>
            <Textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={busy || !slug} onClick={() => { void saveSettings() }}>
            <Save className="h-4 w-4" />保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
