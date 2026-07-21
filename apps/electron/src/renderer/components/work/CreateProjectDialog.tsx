import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildCreateProjectInput, type CreateProjectDraft } from './project-view-model'

export interface CreateProjectDialogProps {
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ReturnType<typeof buildCreateProjectInput>) => void
}

const EMPTY: CreateProjectDraft = {
  name: '',
  description: '',
  workingDirectory: '',
  color: '',
}

export function CreateProjectDialog({
  open,
  busy = false,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps): React.ReactElement {
  const [draft, setDraft] = React.useState<CreateProjectDraft>(EMPTY)

  React.useEffect(() => {
    if (open) setDraft(EMPTY)
  }, [open])

  const canSubmit = draft.name.trim().length > 0 && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1.5 text-xs font-medium">
            名称
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="必填"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            描述
            <Input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="可选"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            工作目录
            <Input
              value={draft.workingDirectory}
              onChange={(e) => setDraft((d) => ({ ...d, workingDirectory: e.target.value }))}
              placeholder="可选，绝对路径"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            强调色
            <Input
              type="color"
              value={draft.color || '#6366f1'}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => onSubmit(buildCreateProjectInput(draft))}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
