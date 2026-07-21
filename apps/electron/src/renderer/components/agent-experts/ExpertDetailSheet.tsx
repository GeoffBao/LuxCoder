/**
 * ExpertDetailSheet — Agent 专家详情右侧抽屉
 *
 * 编辑 IDENTITY / SOUL / RULES 文本与 skillSlugs；mcpIds 只读；渠道绑定占位。
 */

import * as React from 'react'
import { Bot, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/primitives'
import type { ExpertPackage } from '@luxagents/shared/experts'

interface ExpertDetailSheetProps {
  expert: ExpertPackage | null
  onOpenChange: (open: boolean) => void
  onSaved: (expert: ExpertPackage) => void
}

function parseSkillSlugsInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function formatSkillSlugsInput(slugs: string[]): string {
  return slugs.join('\n')
}

export function ExpertDetailSheet({
  expert,
  onOpenChange,
  onSaved,
}: ExpertDetailSheetProps): React.ReactElement {
  return (
    <Sheet open={expert !== null} onOpenChange={onOpenChange}>
      <SheetContent
        hideClose
        side="right"
        className="w-[62vw] min-w-[680px] max-w-[1100px] sm:max-w-[1100px] p-0 flex flex-col gap-0"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">Agent 专家详情</SheetTitle>
        {expert && <ExpertDetailBody key={expert.id} expert={expert} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  )
}

interface ExpertDetailBodyProps {
  expert: ExpertPackage
  onOpenChange: (open: boolean) => void
  onSaved: (expert: ExpertPackage) => void
}

function ExpertDetailBody({ expert, onOpenChange, onSaved }: ExpertDetailBodyProps): React.ReactElement {
  const [label, setLabel] = React.useState(expert.label)
  const [identityMd, setIdentityMd] = React.useState(expert.identityMd)
  const [soulMd, setSoulMd] = React.useState(expert.soulMd)
  const [rulesMd, setRulesMd] = React.useState(expert.rulesMd)
  const [skillSlugsInput, setSkillSlugsInput] = React.useState(formatSkillSlugsInput(expert.skillSlugs))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setLabel(expert.label)
    setIdentityMd(expert.identityMd)
    setSoulMd(expert.soulMd)
    setRulesMd(expert.rulesMd)
    setSkillSlugsInput(formatSkillSlugsInput(expert.skillSlugs))
  }, [expert])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const skillSlugs = parseSkillSlugsInput(skillSlugsInput)
      await window.electronAPI.experts.updateFiles(expert.id, {
        identityMd,
        soulMd,
        rulesMd,
      })
      const updated = await window.electronAPI.experts.updateManifest(expert.id, {
        label: label.trim() || expert.label,
        skillSlugs,
      })
      onSaved({ ...updated, identityMd, soulMd, rulesMd })
      toast.success('专家配置已保存')
    } catch (cause) {
      console.error('[ExpertDetail] 保存失败:', cause)
      toast.error('保存失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-xl bg-violet-500/12 p-2 text-violet-500">
            <Bot size={20} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-foreground">{expert.label}</div>
            <div className="truncate text-[13px] text-muted-foreground">{expert.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Save size={14} className="mr-1.5" />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <ExpertFieldSection title="显示名称">
            <SettingsCard divided={false}>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="w-full rounded-lg border border-border/60 bg-content-area px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="专家显示名称"
              />
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection title="IDENTITY.md" description="角色名与一句话定位">
            <SettingsCard divided={false}>
              <textarea
                value={identityMd}
                onChange={(event) => setIdentityMd(event.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-border/60 bg-content-area px-3 py-2 font-mono text-[13px] leading-6 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection title="SOUL.md" description="语气与协作立场">
            <SettingsCard divided={false}>
              <textarea
                value={soulMd}
                onChange={(event) => setSoulMd(event.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-border/60 bg-content-area px-3 py-2 font-mono text-[13px] leading-6 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection title="RULES.md" description="操作边界与行为约束">
            <SettingsCard divided={false}>
              <textarea
                value={rulesMd}
                onChange={(event) => setRulesMd(event.target.value)}
                rows={8}
                className="w-full resize-y rounded-lg border border-border/60 bg-content-area px-3 py-2 font-mono text-[13px] leading-6 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection
            title="Skill 引用"
            description="每行一个 slug，或用英文逗号分隔。完整 Skill 内容仍由 Agent 技能模块管理。"
          >
            <SettingsCard divided={false}>
              <textarea
                value={skillSlugsInput}
                onChange={(event) => setSkillSlugsInput(event.target.value)}
                rows={4}
                placeholder={'brainstorming\npdf'}
                className="w-full resize-y rounded-lg border border-border/60 bg-content-area px-3 py-2 font-mono text-[13px] leading-6 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection title="MCP 引用" description="只读占位，后续版本支持多选绑定。">
            <SettingsCard divided={false}>
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
                {expert.mcpIds.length > 0 ? expert.mcpIds.join(', ') : '暂无 MCP 绑定'}
              </div>
            </SettingsCard>
          </ExpertFieldSection>

          <ExpertFieldSection title="渠道绑定" description="飞书 / Discord Bot 路由将在后续版本接入。">
            <SettingsCard divided={false}>
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
                后续接入
              </div>
            </SettingsCard>
          </ExpertFieldSection>
        </div>
      </div>
    </div>
  )
}

function ExpertFieldSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
