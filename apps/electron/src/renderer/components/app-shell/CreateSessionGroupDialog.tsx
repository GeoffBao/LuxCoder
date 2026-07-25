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

export interface CreateSessionGroupDialogProps {
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}

/** 新建会话自定义分组：只需要一个名称，比 CreateProjectDialog 精简得多 */
export function CreateSessionGroupDialog({
  open,
  busy = false,
  onOpenChange,
  onSubmit,
}: CreateSessionGroupDialogProps): React.ReactElement {
  const [name, setName] = React.useState('')

  React.useEffect(() => {
    if (open) setName('')
  }, [open])

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !busy

  const submit = (): void => {
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>新建分组</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <label className="block space-y-1.5 text-xs font-medium">
            名称
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="必填"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
