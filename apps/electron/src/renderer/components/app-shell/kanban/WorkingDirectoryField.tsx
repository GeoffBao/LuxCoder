import * as React from 'react'
import { Folder, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface WorkingDirectoryFieldProps {
  value: string
  onChange: (path: string) => void
  className?: string
}

/** 本地工作目录选择：系统文件夹对话框 + 可清除。 */
export function WorkingDirectoryField({
  value,
  onChange,
  className,
}: WorkingDirectoryFieldProps): React.ReactElement {
  const [picking, setPicking] = React.useState(false)
  const folderName = value ? (value.split(/[/\\]/).filter(Boolean).pop() ?? value) : null

  const pickFolder = async (): Promise<void> => {
    setPicking(true)
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (result?.path) onChange(result.path)
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={() => void pickFolder()}
        disabled={picking}
        title={value || '选择本地文件夹作为工作目录'}
        className={cn(
          'inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 text-left text-sm',
          'hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className={cn('min-w-0 flex-1 truncate', !folderName && 'text-muted-foreground')}>
          {folderName ?? (picking ? '选择中…' : '选择本地路径')}
        </span>
      </button>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="清除工作目录"
          onClick={() => onChange('')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
