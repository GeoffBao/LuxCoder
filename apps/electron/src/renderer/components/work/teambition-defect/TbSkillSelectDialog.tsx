import * as React from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface TbSkillOption {
  slug: string
  name: string
  description?: string
  /** 是否 AI 自动匹配（预勾选） */
  autoMatched?: boolean
}

/** 单条任务的技能确认（滚动预览：一次展示所有任务，每条独立勾选） */
export interface TbTaskSkillConfirm {
  taskId: string
  title: string
  /** 当前任务的技能候选（AI 匹配，可增删） */
  candidates: TbSkillOption[]
  /** 当前任务已勾选技能 */
  selected: Set<string>
}

interface TbSkillSelectDialogProps {
  open: boolean
  /** 待确认任务列表（滚动展示，每条各自技能） */
  tasks: TbTaskSkillConfirm[]
  /** 更新某条任务勾选 */
  onSelectedChange: (taskId: string, selected: Set<string>) => void
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
}

/**
 * 加入本地任务前的 Skill 勾选对话框（滚动预览）。
 * 所有任务一次展示，每条 AI 已预勾选适配技能；用户滚动查看，可展开单条增删，
 * 不细选则按默认（预勾选）确认。
 */
export function TbSkillSelectDialog({
  open,
  tasks,
  onSelectedChange,
  onCancel,
  onConfirm,
  busy = false,
}: TbSkillSelectDialogProps): React.ReactElement {
  const [expandedTaskId, setExpandedTaskId] = React.useState<string | null>(null)

  const toggle = (task: TbTaskSkillConfirm, slug: string): void => {
    const next = new Set(task.selected)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    onSelectedChange(task.taskId, next)
  }

  const totalSelected = tasks.reduce((sum, task) => sum + task.selected.size, 0)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle>加入本地任务 · 确认 Skill</DialogTitle>
          <DialogDescription>
            共 {tasks.length} 个问题单，AI 已为每条预勾选适配技能（可展开调整）。未调整的按默认确认。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto px-6 pb-4">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">无待确认任务</p>
          ) : (
            tasks.map((task) => {
              const expanded = expandedTaskId === task.taskId
              const selectedNames = task.candidates
                .filter((skill) => task.selected.has(skill.slug))
                .map((skill) => skill.name)
              return (
                <div key={task.taskId} className="rounded-xl border border-border/40 bg-background/50">
                  {/* 标题行（可展开） */}
                  <button
                    type="button"
                    onClick={() => setExpandedTaskId(expanded ? null : task.taskId)}
                    className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2 text-left"
                  >
                    <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/85">{task.title}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      已选 {task.selected.size}
                    </span>
                  </button>

                  {/* 已选技能 chips（折叠时展示） */}
                  {!expanded && selectedNames.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-2">
                      {selectedNames.map((name) => (
                        <span key={name} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{name}</span>
                      ))}
                    </div>
                  )}

                  {/* 展开：技能勾选列表 */}
                  {expanded && (
                    <div className="space-y-0.5 border-t border-border/30 px-3 pb-2 pt-1.5">
                      {task.candidates.length === 0 ? (
                        <p className="py-1 text-[10px] text-muted-foreground/70">AI 未识别到适配 Skill，确认后不带技能执行</p>
                      ) : (
                        task.candidates.map((skill) => {
                          const checked = task.selected.has(skill.slug)
                          return (
                            <button
                              key={skill.slug}
                              type="button"
                              onClick={() => toggle(task, skill.slug)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                                checked ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/60',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px] leading-none',
                                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                                )}
                              >
                                {checked ? '✓' : ''}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-xs text-foreground/85">
                                  <span className="truncate font-medium">{skill.name}</span>
                                  {skill.autoMatched && (
                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                                      <Sparkles className="size-2" /> AI 匹配
                                    </span>
                                  )}
                                </span>
                                {skill.description && (
                                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/70">{skill.description}</span>
                                )}
                              </span>
                              {checked && <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-3">
          <span className="text-[11px] text-muted-foreground">
            {tasks.length} 个任务 · 已选 {totalSelected} 个 Skill
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>取消</Button>
            <Button size="sm" onClick={onConfirm} disabled={busy || tasks.length === 0}>
              {busy ? '加入中…' : `确认全部加入（${tasks.length}）`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
