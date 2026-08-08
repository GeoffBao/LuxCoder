/**
 * 新建自定义 Agent 专家对话框
 *
 * 对齐 Synara 的新建体验：从内置模板一键创建（模板来自 default-experts/templates/），
 * 或空白创建。支持 description / avatar（icon+accent）/ 默认渠道与模型。
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Channel } from '@myyoda/shared'
import type { ExpertTemplate } from '@myyoda/shared/experts'

export interface CreateExpertDraft {
  id: string
  label: string
  identitySummary?: string
  description?: string
  avatar?: { icon?: string; accent?: string }
  defaultProviderChannelId?: string
  defaultModel?: string
  skillSlugs?: string[]
}

export interface CreateExpertDialogProps {
  open: boolean
  busy?: boolean
  templates: ExpertTemplate[]
  /** 可用渠道（默认渠道/模型选择用） */
  channels: Channel[]
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: CreateExpertDraft) => void
}

const ICON_OPTIONS = ['Bot', 'Layers', 'Code2', 'ClipboardCheck', 'UserRound', 'ShieldCheck']
const ACCENT_OPTIONS = [
  { value: 'primary', label: '主题色' },
  { value: 'emerald', label: '翡翠' },
  { value: 'indigo', label: '靛蓝' },
  { value: 'amber', label: '琥珀' },
  { value: 'rose', label: '玫瑰' },
  { value: 'sky', label: '天蓝' },
]

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
  templates,
  channels,
  onOpenChange,
  onSubmit,
}: CreateExpertDialogProps): React.ReactElement {
  const [tab, setTab] = React.useState<'template' | 'blank'>('template')
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null)
  const [label, setLabel] = React.useState('')
  const [id, setId] = React.useState('')
  const [idTouched, setIdTouched] = React.useState(false)
  const [identitySummary, setIdentitySummary] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [icon, setIcon] = React.useState('')
  const [accent, setAccent] = React.useState('')
  const [providerChannelId, setProviderChannelId] = React.useState('')
  const [modelId, setModelId] = React.useState('')
  const [skillSlugs, setSkillSlugs] = React.useState<string[]>([])

  const enabledChannels = React.useMemo(() => channels.filter((channel) => channel.enabled), [channels])
  const selectedChannel = enabledChannels.find((channel) => channel.id === providerChannelId) ?? null

  React.useEffect(() => {
    if (!open) {
      setTab('template')
      setSelectedTemplate(null)
      setLabel('')
      setId('')
      setIdTouched(false)
      setIdentitySummary('')
      setDescription('')
      setIcon('')
      setAccent('')
      setProviderChannelId('')
      setModelId('')
      setSkillSlugs([])
    }
  }, [open])

  // 切换渠道时重置模型选择
  const handleChannelChange = (channelId: string): void => {
    setProviderChannelId(channelId)
    setModelId('')
  }

  // 选中模板 → 填充字段
  const applyTemplate = (template: ExpertTemplate): void => {
    setSelectedTemplate(template.slug)
    setLabel(template.name)
    setId(slugifyLabel(template.name))
    setIdTouched(true)
    setIdentitySummary(template.description)
    setDescription(template.description)
    setIcon(template.icon)
    setAccent(template.accent)
    setSkillSlugs(template.skills ?? [])
  }

  const handleLabelChange = (value: string): void => {
    setLabel(value)
    if (!idTouched) setId(slugifyLabel(value))
  }

  const canSubmit = label.trim().length > 0 && /^[a-z][a-z0-9-]*$/.test(id.trim())

  const handleSubmit = (): void => {
    if (!canSubmit || busy) return
    onSubmit({
      id: id.trim(),
      label: label.trim(),
      identitySummary: identitySummary.trim() || undefined,
      description: description.trim() || undefined,
      ...(icon || accent ? { avatar: { ...(icon ? { icon } : {}), ...(accent ? { accent } : {}) } } : {}),
      defaultProviderChannelId: providerChannelId || undefined,
      defaultModel: modelId || undefined,
      ...(skillSlugs.length > 0 ? { skillSlugs } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建 Agent 专家</DialogTitle>
          <DialogDescription>
            创建自定义专家包。可以从内置模板一键创建，也可以空白自定义。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as 'template' | 'blank')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">从模板</TabsTrigger>
            <TabsTrigger value="blank">空白创建</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3 py-2">
          {tab === 'template' && (
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {templates.length === 0 && (
                <div className="col-span-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-center text-[13px] text-muted-foreground">
                  暂无可用模板，切到「空白创建」
                </div>
              )}
              {templates.map((template) => {
                const active = selectedTemplate === template.slug
                return (
                  <button
                    key={template.slug}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      active ? 'border-primary/50 bg-primary/5' : 'border-border/60 bg-content-area hover:border-border',
                    )}
                  >
                    <span className="block truncate text-[13px] font-medium text-foreground">{template.name}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                      {template.description || template.slug}
                    </span>
                    {template.category && (
                      <span className="mt-1 inline-block rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                        {template.category}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
            </label>
          </div>

          <label className="block space-y-1.5 text-xs font-medium">
            一句话定位（卡片展示）
            <Input
              value={identitySummary}
              onChange={(event) => setIdentitySummary(event.target.value)}
              placeholder="该专家擅长的领域与协作风格"
              disabled={busy}
            />
          </label>

          <label className="block space-y-1.5 text-xs font-medium">
            详细描述（可选）
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="更完整的角色说明，作为 IDENTITY.md 正文"
              rows={2}
              disabled={busy}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs font-medium">
              图标
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger className="w-full"><SelectValue placeholder="默认 Bot" /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              强调色
              <Select value={accent} onValueChange={setAccent}>
                <SelectTrigger className="w-full"><SelectValue placeholder="默认主题色" /></SelectTrigger>
                <SelectContent>
                  {ACCENT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs font-medium">
              默认渠道
              <Select value={providerChannelId} onValueChange={handleChannelChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="继承会话渠道" />
                </SelectTrigger>
                <SelectContent>
                  {enabledChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              默认模型
              <Select value={modelId} onValueChange={setModelId} disabled={!selectedChannel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={selectedChannel ? '选择模型' : '先选渠道'} />
                </SelectTrigger>
                <SelectContent>
                  {selectedChannel?.models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || busy}
            onClick={handleSubmit}
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
