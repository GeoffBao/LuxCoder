/**
 * AgentExpertsView — 「Agent 专家」全屏视图
 *
 * 由侧边栏「Agent 专家」入口触发，全屏占据中间内容区。
 * 展示内置专家卡片网格，点击打开详情抽屉编辑身份核与 Skill 引用。
 */

import * as React from 'react'
import { Bot, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ExpertPackage } from '@luxcodex/shared/experts'
import { Button } from '@/components/ui/button'
import { ExpertCard } from './ExpertCard'
import { ExpertDetailSheet } from './ExpertDetailSheet'
import { CreateExpertDialog, type CreateExpertDraft } from './CreateExpertDialog'

export function AgentExpertsView(): React.ReactElement {
  const [experts, setExperts] = React.useState<ExpertPackage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [selectedExpertId, setSelectedExpertId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const loadExperts = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.electronAPI.experts.list()
      setExperts(list)
    } catch (cause) {
      console.error('[AgentExperts] 加载专家列表失败:', cause)
      toast.error('加载专家列表失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadExperts()
  }, [loadExperts])

  const query = search.trim().toLowerCase()
  const filteredExperts = React.useMemo(() => {
    if (!query) return experts
    return experts.filter((expert) =>
      expert.label.toLowerCase().includes(query) ||
      expert.id.toLowerCase().includes(query) ||
      expert.identityMd.toLowerCase().includes(query),
    )
  }, [experts, query])

  const selectedExpert = experts.find((expert) => expert.id === selectedExpertId) ?? null

  const handleSaved = (updated: ExpertPackage): void => {
    setExperts((current) =>
      current.map((expert) => (expert.id === updated.id ? updated : expert)),
    )
  }

  const handleCreate = async (draft: CreateExpertDraft): Promise<void> => {
    setCreating(true)
    try {
      const created = await window.electronAPI.experts.create({
        id: draft.id,
        label: draft.label,
        identitySummary: draft.identitySummary || undefined,
      })
      setExperts((current) => [...current, created].sort((a, b) => a.id.localeCompare(b.id)))
      setCreateOpen(false)
      setSelectedExpertId(created.id)
      toast.success('专家已创建')
    } catch (cause) {
      toast.error('创建专家失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pt-14 pb-4">
        <div className="flex items-center gap-2.5">
          <Bot className="size-6 text-foreground/70" />
          <h1 className="text-2xl font-semibold text-foreground">Agent 专家</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建专家
        </Button>
      </div>

      <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center gap-3 px-8 pb-4">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索专家名称或 slug..."
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
          {experts.length} 个专家
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-8 pb-10">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">加载中...</div>
          ) : filteredExperts.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8 text-foreground/30" />}
              title={experts.length === 0 ? '暂无专家' : '没有匹配的专家'}
              hint={experts.length === 0 ? '应用启动时会自动种子内置专家包。' : '试试更换搜索关键词。'}
            />
          ) : (
            <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
              {filteredExperts.map((expert) => (
                <ExpertCard
                  key={expert.id}
                  expert={expert}
                  onOpen={() => setSelectedExpertId(expert.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ExpertDetailSheet
        expert={selectedExpert}
        onOpenChange={(open) => {
          if (!open) setSelectedExpertId(null)
        }}
        onSaved={handleSaved}
      />

      <CreateExpertDialog
        open={createOpen}
        busy={creating}
        onOpenChange={setCreateOpen}
        onSubmit={(draft) => void handleCreate(draft)}
      />
    </div>
  )
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode
  title: string
  hint: string
}): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/[0.04]">{icon}</div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[15px] font-medium text-foreground/85">{title}</div>
        <div className="text-[13px] leading-relaxed text-foreground/50">{hint}</div>
      </div>
    </div>
  )
}
