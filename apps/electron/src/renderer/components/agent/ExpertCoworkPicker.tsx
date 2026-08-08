/**
 * ExpertCoworkPicker — 会话级拉专家/专家团（cowork）选择弹窗
 *
 * 对齐 Synara 的 subagent 体验：在当前 Code 会话下创建注入专家人设的子会话
 * （专家 = 1 个子会话；专家团 = 团长编排 → 成员 → 汇总）。
 */

import * as React from 'react'
import { Bot, LoaderCircle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ExpertOption } from '@/components/agent-experts/useExpertOptions'

export interface CoworkTargetOption extends ExpertOption {
  description?: string
}

export interface ExpertCoworkPickerProps {
  open: boolean
  /** 父会话（当前 Code 会话）id */
  parentSessionId: string
  /** 候选：专家（kind expert）+ 专家团（kind team） */
  options: CoworkTargetOption[]
  busy?: boolean
  onOpenChange: (open: boolean) => void
  /** 拉取成功回调（拿到子会话 ids） */
  onSpawned?: (result: { kind: 'expert' | 'team'; label: string; childSessionIds: string[] }) => void
}

export function ExpertCoworkPicker({
  open,
  parentSessionId,
  options,
  busy = false,
  onOpenChange,
  onSpawned,
}: ExpertCoworkPickerProps): React.ReactElement {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [prompt, setPrompt] = React.useState('')
  const [spawning, setSpawning] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setPrompt('')
    setSpawning(false)
  }, [open])

  const selected = options.find((option) => option.id === selectedId) ?? null

  const handleSpawn = async (): Promise<void> => {
    if (!selected || spawning) return
    setSpawning(true)
    try {
      const input =
        selected.kind === 'team'
          ? { parentSessionId, teamId: selected.id, prompt: prompt.trim() || undefined }
          : { parentSessionId, expertId: selected.id, prompt: prompt.trim() || undefined }
      const result = await window.electronAPI.spawnExpertCowork(input)
      toast.success(`${selected.kind === 'team' ? '专家团' : '专家'}「${result.label}」已拉入会话`, {
        description: result.kind === 'team'
          ? `已创建 ${result.childSessionIds.length} 个子会话（团长 → 成员 → 汇总）`
          : '子会话已创建，可在队友条查看进度',
      })
      onOpenChange(false)
      onSpawned?.(result)
    } catch (cause) {
      toast.error('拉取失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setSpawning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>拉专家 / 专家团一起协作</DialogTitle>
          <DialogDescription>
            创建注入专家人设的子会话（对齐 Synara subagent）。专家团会按「团长编排 → 成员执行 → 团长汇总」展开。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {options.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-center text-[13px] text-muted-foreground">
              暂无可用专家，请先在「Agent 专家」中创建
            </div>
          )}
          {options.map((option) => {
            const active = selectedId === option.id
            const isTeam = option.kind === 'team'
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/60 bg-content-area hover:border-border',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg',
                    isTeam ? 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400' : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {isTeam ? <Users className="size-3.5" /> : <Bot className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {option.label}
                    {isTeam && <span className="ml-1.5 text-[10px] font-normal text-indigo-500">专家团</span>}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">任务提示（可选）</label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={selected
              ? `给「${selected.label}」的协作任务…`
              : '先选择专家或专家团，再填任务提示'}
            rows={2}
            disabled={!selected}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={spawning || busy}>
            取消
          </Button>
          <Button onClick={() => void handleSpawn()} disabled={!selected || spawning || busy}>
            {spawning ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : null}
            拉入会话
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
