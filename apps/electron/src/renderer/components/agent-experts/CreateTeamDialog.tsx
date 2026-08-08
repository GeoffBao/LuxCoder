/**
 * CreateTeamDialog — 新建专家团（真实 Squad）
 *
 * 流程：基本信息（id/label/描述）→ 选团长 → 勾选成员 + role → 写协调策略 instructions
 * 复用 ReferenceMultiSelect 模式做成员勾选。
 */

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ExpertOption } from './useExpertOptions'

export interface CreateTeamDraft {
  id: string
  label: string
  description?: string
  avatar?: { icon?: string; accent?: string }
  leaderExpertId: string
  members: Array<{ expertId: string; role?: string }>
  instructions?: string
}

export interface CreateTeamDialogProps {
  open: boolean
  busy?: boolean
  /** 团长候选：只能是专家（kind==='expert'），不能是团队 */
  expertOptions: ExpertOption[]
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: CreateTeamDraft) => void
}

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom-team'
}

export function CreateTeamDialog({
  open,
  busy = false,
  expertOptions,
  onOpenChange,
  onSubmit,
}: CreateTeamDialogProps): React.ReactElement {
  const [label, setLabel] = React.useState('')
  const [id, setId] = React.useState('')
  const [idTouched, setIdTouched] = React.useState(false)
  const [description, setDescription] = React.useState('')
  const [leaderExpertId, setLeaderExpertId] = React.useState('')
  const [selectedMembers, setSelectedMembers] = React.useState<string[]>([])
  const [roles, setRoles] = React.useState<Record<string, string>>({})
  const [instructions, setInstructions] = React.useState('')
  const [icon, setIcon] = React.useState('')
  const [accent, setAccent] = React.useState('')

  const memberOptions = expertOptions.filter((option) => option.id !== leaderExpertId)

  React.useEffect(() => {
    if (!open) return
    setLabel('')
    setId('')
    setIdTouched(false)
    setDescription('')
    setLeaderExpertId('')
    setSelectedMembers([])
    setRoles({})
    setInstructions('')
    setIcon('')
    setAccent('')
  }, [open])

  // 团长变更后把已选中的团长从成员里移除（团长不能兼任成员）
  const handleLeaderChange = (value: string): void => {
    setLeaderExpertId(value)
    setSelectedMembers((current) => current.filter((memberId) => memberId !== value))
  }

  const toggleMember = (expertId: string): void => {
    setSelectedMembers((current) =>
      current.includes(expertId)
        ? current.filter((item) => item !== expertId)
        : [...current, expertId],
    )
  }

  const setRole = (expertId: string, role: string): void => {
    setRoles((current) => ({ ...current, [expertId]: role }))
  }

  const canSubmit = label.trim().length > 0 && leaderExpertId.length > 0 && selectedMembers.length > 0

  const handleSubmit = (): void => {
    if (!canSubmit || busy) return
    onSubmit({
      id: id.trim() || slugifyLabel(label),
      label: label.trim(),
      description: description.trim() || undefined,
      ...(icon || accent ? { avatar: { ...(icon ? { icon } : {}), ...(accent ? { accent } : {}) } } : {}),
      leaderExpertId,
      members: selectedMembers.map((expertId) => ({
        expertId,
        ...(roles[expertId]?.trim() ? { role: roles[expertId]!.trim() } : {}),
      })),
      instructions: instructions.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建专家团</DialogTitle>
          <DialogDescription>
            专家团 = 团长 + 成员。运行时团长拆解任务为委派计划，成员各自执行，团长汇总验收。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">名称 *</label>
              <Input
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value)
                  if (!idTouched) setId(slugifyLabel(event.target.value))
                }}
                placeholder="如：移动端专项团"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">id（slug）</label>
              <Input
                value={id}
                onChange={(event) => {
                  setId(event.target.value)
                  setIdTouched(true)
                }}
                placeholder="自动按名称生成"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">描述（一句话）</label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="团队定位，卡片展示用"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">图标</label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger className="w-full"><SelectValue placeholder="默认 Users" /></SelectTrigger>
                <SelectContent>
                  {['Users', 'ShieldCheck', 'Layers', 'Code2', 'Bot'].map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">强调色</label>
              <Select value={accent} onValueChange={setAccent}>
                <SelectTrigger className="w-full"><SelectValue placeholder="默认主题色" /></SelectTrigger>
                <SelectContent>
                  {[
                    { value: 'primary', label: '主题色' },
                    { value: 'indigo', label: '靛蓝' },
                    { value: 'emerald', label: '翡翠' },
                    { value: 'amber', label: '琥珀' },
                    { value: 'rose', label: '玫瑰' },
                  ].map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 团长 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">团长（协调者，不亲自实现）*</label>
            <Select value={leaderExpertId} onValueChange={handleLeaderChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择团长专家" />
              </SelectTrigger>
              <SelectContent>
                {expertOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 成员 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">成员（可多选，团长自动排除）*</label>
            <div className={cn('max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 bg-content-area p-2')}>
              {memberOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
                  先选择团长（成员从其余专家中勾选）
                </div>
              ) : (
                memberOptions.map((option) => {
                  const checked = selectedMembers.includes(option.id)
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                        checked ? 'bg-primary/10' : 'hover:bg-muted/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMember(option.id)}
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-transparent',
                        )}
                        aria-label={checked ? `移除 ${option.label}` : `添加 ${option.label}`}
                      >
                        {checked && <Plus className="size-3 rotate-45" />}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{option.label}</span>
                      {checked && (
                        <Input
                          value={roles[option.id] ?? ''}
                          onChange={(event) => setRole(option.id, event.target.value)}
                          placeholder="团队内角色"
                          className="h-7 w-32 text-xs"
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedMembers.map((expertId) => {
                  const option = expertOptions.find((item) => item.id === expertId)
                  return (
                    <span
                      key={expertId}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {option?.label ?? expertId}
                      <button
                        type="button"
                        onClick={() => toggleMember(expertId)}
                        className="text-primary/50 hover:text-primary"
                        aria-label={`移除 ${option?.label ?? expertId}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* 协调策略 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">团长协调策略（可选）</label>
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="如：先架构评审再分头实现，最后统一验收…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || busy}>
            {busy ? '创建中...' : '创建专家团'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
