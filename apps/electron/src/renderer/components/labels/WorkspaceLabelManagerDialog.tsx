import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Check, Plus, Settings, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { WorkspaceLabel } from '@myyoda/shared/labels'
import { workspaceLabelsAtom } from '@/atoms/workspace-labels-atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface WorkspaceLabelManagerDialogProps {
  workspaceRoot: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B',
]

function LabelColorDot({ color, selected, onPick }: { color: string; selected: boolean; onPick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'size-6 rounded-full border-2 transition-[border-color,transform] duration-fast active:scale-[0.97]',
        selected ? 'border-foreground/80 scale-110' : 'border-transparent hover:scale-105',
      )}
      style={{ backgroundColor: color }}
    />
  )
}

export function WorkspaceLabelManagerDialog({ workspaceRoot, open, onOpenChange }: WorkspaceLabelManagerDialogProps): React.ReactElement {
  const [labels, setLabels] = useAtom(workspaceLabelsAtom)
  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState(PRESET_COLORS[0]!)
  const [busy, setBusy] = React.useState(false)

  const createLabel = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const created = await window.electronAPI.labels.create(workspaceRoot, { name: trimmed, color })
      setLabels((prev) => [...prev, created])
      setName('')
      setColor(PRESET_COLORS[0]!)
    } catch (cause) {
      toast.error('创建标签失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const archiveLabel = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      const archived = await window.electronAPI.labels.archive(workspaceRoot, id)
      setLabels((prev) => prev.map((item) => item.id === id ? archived : item))
    } catch (cause) {
      toast.error('归档标签失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const visibleLabels = labels.filter((label) => !label.archivedAt)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>管理标签</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新标签名称"
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') void createLabel() }}
            />
            <Button size="sm" disabled={!name.trim() || busy} onClick={() => void createLabel()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((preset) => (
              <LabelColorDot key={preset} color={preset} selected={color === preset} onPick={() => setColor(preset)} />
            ))}
          </div>
          {visibleLabels.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {visibleLabels.map((label) => (
                <div key={label.id} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color ?? '#888' }} />
                    {label.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void archiveLabel(label.id)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={`归档 ${label.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface LabelAssignPopoverProps {
  labels: WorkspaceLabel[]
  activeIds: string[]
  workspaceRoot?: string
  onCreateRequest?: () => void
  onChange: (next: string[]) => void | Promise<void>
}

/**
 * Inline label assignment: checkbox list inside a dropdown-style panel.
 * Used by both Session right-click menu and Task card context.
 */
export function LabelAssignPopover({ labels, activeIds, workspaceRoot, onCreateRequest, onChange }: LabelAssignPopoverProps): React.ReactElement {
  return (
    <div className="w-52 p-1" role="menu">
      {labels.filter((l) => !l.archivedAt).map((label) => (
        <button
          key={label.id}
          type="button"
          role="menuitemcheckbox"
          aria-checked={activeIds.includes(label.id)}
          onClick={() => {
            const next = activeIds.includes(label.id)
              ? activeIds.filter((id) => id !== label.id)
              : [...activeIds, label.id]
            void onChange(next)
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted/60"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {activeIds.includes(label.id) && <Check className="h-3 w-3" />}
          </span>
          <span className="mr-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color ?? '#888' }} />
          <span className="truncate">{label.name}</span>
        </button>
      ))}
      {labels.filter((l) => !l.archivedAt).length === 0 && (
        <p className="px-2 py-3 text-xs text-muted-foreground text-center">暂无标签</p>
      )}
      <div className="my-1 border-t border-border/40" />
      <button
        type="button"
        onClick={onCreateRequest}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60"
      >
        <Settings className="h-3 w-3" />
        管理标签…
      </button>
    </div>
  )
}
