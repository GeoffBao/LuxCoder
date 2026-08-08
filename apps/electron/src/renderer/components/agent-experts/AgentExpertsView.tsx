/**
 * AgentExpertsView — 「Agent 专家 / 专家团」视图
 *
 * 默认由 Yoda 插件视图嵌入（专家 / 专家团平级 Tab，宿主工具条承载搜索与新建）。
 * 非 embedded 时保留自带头部/搜索条与内部「专家 / 专家团」双 Tab（兼容独立入口）。
 */

import * as React from 'react'
import { Bot, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ExpertKind, ExpertPackage, ExpertTemplate, TeamSquad } from '@myyoda/shared/experts'
import type { Channel } from '@myyoda/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExpertCard } from './ExpertCard'
import { ExpertDetailSheet } from './ExpertDetailSheet'
import { CreateExpertDialog, type CreateExpertDraft } from './CreateExpertDialog'
import { CreateTeamDialog, type CreateTeamDraft } from './CreateTeamDialog'

type ExpertsTab = 'expert' | 'team'

interface AgentExpertsViewProps {
  /** 嵌入 Yoda 插件视图时：隐藏自带头部/搜索条，由宿主工具条承载；搜索词与新建请求由宿主传入。 */
  embedded?: boolean
  /** embedded 模式下宿主工具条的搜索词；非 embedded 忽略。 */
  externalSearch?: string
  /** embedded 模式下宿主工具条点击“新建专家”时递增此 token，触发本组件打开新建弹窗。 */
  createRequestToken?: number
  /** 展示类型：expert 只显示专家、team 只显示专家团；缺省 all（非 embedded 时内部双 Tab 切换）。 */
  kind?: ExpertKind | 'all'
}

export function AgentExpertsView({
  embedded = false,
  externalSearch = '',
  createRequestToken = 0,
  kind = 'all',
}: AgentExpertsViewProps): React.ReactElement {
  const [experts, setExperts] = React.useState<ExpertPackage[]>([])
  const [teams, setTeams] = React.useState<TeamSquad[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<ExpertsTab>('expert')
  const [search, setSearch] = React.useState('')
  const [selectedExpertId, setSelectedExpertId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [createTeamOpen, setCreateTeamOpen] = React.useState(false)
  const [creatingTeam, setCreatingTeam] = React.useState(false)
  const [templates, setTemplates] = React.useState<ExpertTemplate[]>([])
  const [channels, setChannels] = React.useState<Channel[]>([])

  // embedded 模式下搜索词由宿主统一管理；非 embedded 使用本地状态。
  const activeSearch = embedded ? externalSearch : search

  // 宿主工具条“新建专家”按钮通过递增 token 触发弹窗（避免跨组件直接操作内部状态）。
  const prevCreateToken = React.useRef(createRequestToken)
  React.useEffect(() => {
    if (createRequestToken !== prevCreateToken.current) {
      prevCreateToken.current = createRequestToken
      setCreateOpen(true)
    }
  }, [createRequestToken])

  const loadExperts = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [list, teamList, templateList, channelList] = await Promise.all([
        window.electronAPI.experts.list(),
        window.electronAPI.experts.listTeams(),
        window.electronAPI.experts.listTemplates(),
        window.electronAPI.listChannels(),
      ])
      setExperts(list)
      setTeams(teamList)
      setTemplates(templateList)
      setChannels(channelList)
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

  const expertList = React.useMemo(
    () => experts.filter((expert) => (expert.kind ?? 'expert') === 'expert'),
    [experts],
  )
  const teamList = React.useMemo(
    () => experts.filter((expert) => expert.kind === 'team'),
    [experts],
  )
  const activeTab: ExpertsTab =
    kind === 'expert' ? 'expert' : kind === 'team' ? 'team' : tab
  const activeList = activeTab === 'team' ? teamList : expertList

  const query = activeSearch.trim().toLowerCase()
  const filteredExperts = React.useMemo(() => {
    if (!query) return activeList
    return activeList.filter((expert) =>
      expert.label.toLowerCase().includes(query) ||
      expert.id.toLowerCase().includes(query) ||
      expert.identityMd.toLowerCase().includes(query) ||
      (expert.roleLabels ?? []).some((role) => role.toLowerCase().includes(query)),
    )
  }, [activeList, query])

  const selectedExpert = experts.find((expert) => expert.id === selectedExpertId) ?? null

  // 专家 label 索引（解析团队卡团长/成员名称）
  const expertLabels = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const expert of experts) map[expert.id] = expert.label
    for (const team of teams) map[team.id] = team.label
    return map
  }, [experts, teams])

  // 团长候选：只能选专家（kind==='expert'），排除团队
  const leaderOptions = React.useMemo(
    () => experts.filter((expert) => (expert.kind ?? 'expert') === 'expert')
      .map((expert) => ({ id: expert.id, label: expert.label })),
    [experts],
  )

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
        description: draft.description,
        avatar: draft.avatar,
        defaultProviderChannelId: draft.defaultProviderChannelId,
        defaultModel: draft.defaultModel,
        skillSlugs: draft.skillSlugs,
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

  const handleCreateTeam = async (draft: CreateTeamDraft): Promise<void> => {
    setCreatingTeam(true)
    try {
      const created = await window.electronAPI.experts.createTeam(draft)
      setTeams((current) => [...current, created].sort((a, b) => a.id.localeCompare(b.id)))
      // 老结构兼容：重新拉取专家包（seed 会把 kind:'team' expert.json 补齐）
      const list = await window.electronAPI.experts.list()
      setExperts(list)
      setCreateTeamOpen(false)
      setTab('team')
      toast.success('专家团已创建')
    } catch (cause) {
      toast.error('创建专家团失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setCreatingTeam(false)
    }
  }

  const showInternalTabs = !embedded && kind === 'all'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!embedded && (
        <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-8 pt-14 pb-4">
          <div className="flex items-center gap-2.5">
            <Bot className="size-6 text-foreground/70" />
            <h1 className="text-2xl font-semibold text-foreground">Agent 专家</h1>
          </div>
          {tab === 'expert' && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建专家
            </Button>
          )}
          {tab === 'team' && (
            <Button size="sm" onClick={() => setCreateTeamOpen(true)}>
              <Plus className="h-4 w-4" />
              新建专家团
            </Button>
          )}
        </div>
      )}

      {!embedded && (
        <div className="titlebar-no-drag mx-auto flex w-full max-w-6xl shrink-0 items-center gap-3 px-8 pb-4">
          {showInternalTabs && (
            <Tabs value={tab} onValueChange={(value) => setTab(value as ExpertsTab)}>
              <TabsList>
                <TabsTrigger value="expert" className="gap-1.5">
                  <Bot className="size-3.5" />
                  专家
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-1.5">
                  <Users className="size-3.5" />
                  专家团
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-content-area px-3 transition-colors focus-within:border-primary/40">
            <Search size={14} className="shrink-0 text-foreground/40" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={activeTab === 'team' ? '搜索专家团名称或角色...' : '搜索专家名称或 slug...'}
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground/35 focus:outline-none"
            />
          </div>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {activeList.length} 个{activeTab === 'team' ? '专家团' : '专家'}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-8 pb-10">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">加载中...</div>
          ) : filteredExperts.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8 text-foreground/30" />}
              title={activeList.length === 0 ? (activeTab === 'team' ? '暂无专家团' : '暂无专家') : '没有匹配的结果'}
              hint={activeList.length === 0 ? '应用启动时会自动种子内置专家包。' : '试试更换搜索关键词。'}
            />
          ) : (
            <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
              {filteredExperts.map((expert) => (
                <ExpertCard
                  key={expert.id}
                  expert={expert}
                  teams={teams}
                  expertLabels={expertLabels}
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
        templates={templates}
        channels={channels}
        onOpenChange={setCreateOpen}
        onSubmit={(draft) => void handleCreate(draft)}
      />

      <CreateTeamDialog
        open={createTeamOpen}
        busy={creatingTeam}
        expertOptions={leaderOptions}
        onOpenChange={setCreateTeamOpen}
        onSubmit={(draft) => void handleCreateTeam(draft)}
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
