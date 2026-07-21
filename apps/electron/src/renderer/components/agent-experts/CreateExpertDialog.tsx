/**
 * 新建自定义 Agent 专家对话框
 */

import * as React from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export interface CreateExpertDraft {
  id: string
  label: string
  identitySummary: string
}

export interface CreateExpertDialogProps {
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: CreateExpertDraft) => void
}

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom-expert'
}

export function CreateExpertDialog({
  open,
  busy = false,
  onOpenChange,
  onSubmit,
}: CreateExpertDialogProps): React.ReactElement {
  const [label, setLabel] = React.useState('')
  const [id, setId] = React.useState('')
  const [idTouched, setIdTouched] = React.useState(false)
  const [identitySummary, setIdentitySummary] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setLabel('')
      setId('')
      setIdTouched(false)
      setIdentitySummary('')
    }
  }, [open])

  const handleLabelChange = (value: string): void => {
    setLabel(value)
    if (!idTouched) setId(slugifyLabel(value))
  }

  const canSubmit = label.trim().length > 0 && /^[a-z][a-z0-9-]*$/.test(id.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建 Agent 专家</DialogTitle>
          <DialogDescription>
            创建自定义专家包（IDENTITY / SOUL / RULES）。内置专家仍可在列表中编辑。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1.5 text-xs font-medium">
            名称
            <Input
              value={label}
              onChange={(event) => handleLabelChange(event.target.value)}
              placeholder="例如：多媒体专家"
              disabled={busy}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            slug（id）
            <Input
              value={id}
              onChange={(event) => {
                setIdTouched(true)
                setId(event.target.value.trim().toLowerCase())
              }}
              placeholder="media-expert"
              disabled={busy}
            />
            <span className="block text-[11px] font-normal text-muted-foreground">
              小写字母开头，仅 a-z / 0-9 / -
            </span>
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            一句话定位（可选）
            <Textarea
              value={identitySummary}
              onChange={(event) => setIdentitySummary(event.target.value)}
              placeholder="该专家擅长的领域与协作风格"
              rows={3}
              disabled={busy}
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => onSubmit({
              id: id.trim(),
              label: label.trim(),
              identitySummary: identitySummary.trim(),
            })}
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
