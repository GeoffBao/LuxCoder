/**
 * PluginPanelView — 侧边栏常用插件入口的精简视图
 *
 * 完全接管工具条（单排：搜索 + 筛选 + 操作按钮），复用 AgentSkillsView 内容区。
 * 社区市场 / AI分类 / 导入 / 企业导入 的 dialog 由本组件自行管理。
 */
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Search, Store, Sparkles, Plus, Building2, ChevronDown, Blocks, Wrench, Loader2, Star, Bot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentSkillsView } from '@/components/agent-skills/AgentSkillsView'
import { AgentExpertsView } from '@/components/agent-experts/AgentExpertsView'
import { CommunityMarketDialog } from '@/components/agent-skills/CommunityMarketDialog'
import { ImportSkillDialog } from '@/components/agent-skills/ImportSkillDialog'
import { OrgSkillImportDialog } from '@/components/agent-skills/OrgSkillImportDialog'
import { agentSkillsTabAtom } from '@/atoms/active-view'
import { agentPendingPromptAtom } from '@/atoms/agent-atoms'
import { useCreateSession } from '@/hooks/useCreateSession'
import { cn } from '@/lib/utils'
import { SectionTabs } from '@/components/ui/section-tabs'
import type { SkillMeta } from '@yoda/shared'
import { useAgentSkillsData } from './useAgentSkillsData'
import { buildSkillClassificationPrompt } from './AgentSkillsView'

export type PluginTab = 'experts' | 'skills' | 'mcp'
type SourceFilter = 'all' | 'builtin' | 'market' | 'custom'
type StatusFilter = 'all' | 'enabled' | 'disabled'
type CategoryFilter = 'all' | 'ungrouped' | string

interface PluginPanelViewProps {
  tab: PluginTab
  title: string
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '全部来源' },
  { value: 'custom', label: '我的' },
  { value: 'builtin', label: '内置' },
  { value: 'market', label: '市场' },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
]

/** 动态分类：从当前 Skills 的 group 提取，空 group 归「未分组」 */
function collectCategories(skills: SkillMeta[]): { value: string; label: string; count: number }[] {
  const map = new Map<string, number>()
  for (const s of skills) {
    const g = (s.group ?? '').trim()
    const key = g || 'ungrouped'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const items = [...map.entries()]
    .map(([value, count]) => ({
      value,
      label: value === 'ungrouped' ? '未分组' : value,
      count,
    }))
    .sort((a, b) => (a.value === 'ungrouped' ? 1 : b.value === 'ungrouped' ? -1 : a.label.localeCompare(b.label, 'zh-CN')))
  return items
}

/** 下拉菜单筛选器（通用） */
function FilterDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  icon,
}: {
  label: string
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
  icon?: React.ReactNode
}): React.ReactElement {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors',
            value !== 'all'
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-content-area text-foreground/75 hover:bg-foreground/[0.04]'
          )}
        >
          {icon}
          <span>{current?.label ?? label}</span>
          <ChevronDown size={13} className="text-foreground/40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 z-[9999]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(opt.value === value && 'bg-primary/10 text-primary')}
          >
            <span className="flex-1">{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className="text-[11px] tabular-nums text-muted-foreground">{opt.count}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PluginPanelView({ tab, title }: PluginPanelViewProps): React.ReactElement {
  const setAgentSkillsTab = useSetAtom(agentSkillsTabAtom)
  const setPendingPrompt = useSetAtom(agentPendingPromptAtom)
  const { createAgent } = useCreateSession()
  const [query, setQuery] = React.useState('')
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>('all')
  const [classifying, setClassifying] = React.useState(false)
  const [marketOpen, setMarketOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [orgImportOpen, setOrgImportOpen] = React.useState(false)
  const [addMcpRequest, setAddMcpRequest] = React.useState(0)
  const [createExpertRequest, setCreateExpertRequest] = React.useState(0)

  // 数据层（动态分类 + dialog 数据）
  const data = useAgentSkillsData()
  const categories = React.useMemo(() => collectCategories(data.skills), [data.skills])

  // 进入时自动设置正确的子 tab
  React.useEffect(() => {
    setAgentSkillsTab(tab)
  }, [tab, setAgentSkillsTab])

  // 切换子 tab 时重置搜索与筛选，避免上个页面的关键词污染新页面列表
  React.useEffect(() => {
    setQuery('')
    setSourceFilter('all')
    setStatusFilter('all')
    setCategoryFilter('all')
  }, [tab])

  const categoryOptions = React.useMemo(() => {
    return [
      { value: 'all' as const, label: '全部分类' },
      ...categories.map((c) => ({ value: c.value, label: c.label, count: c.count })),
    ]
  }, [categories])

  /** AI 分类：创建 Agent 会话，读取 SKILL.md 并补全 group（复用 AgentSkillsView 的 prompt 逻辑） */
  const handleClassifySkills = React.useCallback(async (): Promise<void> => {
    if (classifying) return
    if (!data.skillsDir) {
      toast.error('无法定位当前工作区 Skills 目录')
      return
    }
    setClassifying(true)
    try {
      const sessionId = await createAgent()
      if (!sessionId) {
        toast.error('创建 Agent 会话失败')
        return
      }
      setPendingPrompt({
        sessionId,
        message: buildSkillClassificationPrompt({
          workspaceName: data.workspaceName,
          skillsDir: data.skillsDir,
          skills: data.skills,
        }),
      })
      toast.success('已创建 Skills 分类整理会话')
    } catch (error) {
      console.error('[Plugin] 创建 Skills 分类会话失败:', error)
      toast.error(error instanceof Error ? error.message : '创建 Skills 分类会话失败')
    } finally {
      setClassifying(false)
    }
  }, [classifying, createAgent, data.skills, data.skillsDir, data.workspaceName, setPendingPrompt])

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏：标题 + 子页 tab（技能 / MCP / 专家Agent） */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        <SectionTabs
          value={tab}
          onChange={setAgentSkillsTab}
          options={[
            { value: 'skills', label: '技能', icon: <Star size={12} /> },
            { value: 'mcp', label: 'MCP', icon: <Wrench size={12} /> },
            { value: 'experts', label: '专家Agent', icon: <Bot size={12} /> },
          ]}
        />
      </div>

      {/* 工具条（单排）：搜索 + 分类/来源/状态 + 操作按钮，横向可滚动 */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border/70 px-4 py-2.5 scrollbar-thin">
        <div className="relative w-52 shrink-0">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'experts' ? '搜索专家名称或 slug...' : tab === 'skills' ? '搜索 Skill...' : '搜索 MCP 服务器...'}
            className="h-8 pl-8 text-[13px]"
          />
        </div>

        {tab === 'skills' && (
          <FilterDropdown
            label="分类"
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            icon={<Blocks size={14} className="text-foreground/50" />}
          />
        )}

        <FilterDropdown
          label="来源"
          options={SOURCE_OPTIONS}
          value={sourceFilter}
          onChange={setSourceFilter}
          icon={tab === 'mcp' ? <Wrench size={14} className="text-foreground/50" /> : undefined}
        />

        <FilterDropdown
          label="状态"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        {/* 操作按钮（Skills 页） */}
        {tab === 'skills' && (
          <>
            <div className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => setMarketOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              <Store size={13} />
              <span>社区市场</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleClassifySkills()}
                  disabled={classifying || data.skills.length === 0}
                  className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/60 bg-content-area px-3 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {classifying ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>AI 分类</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">创建 Agent 会话，读取 SKILL.md 内容并补全 group</TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/60 bg-content-area px-3 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
            >
              <Plus size={13} />
              <span>导入</span>
            </button>
            <button
              type="button"
              onClick={() => setOrgImportOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 text-[12px] font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
            >
              <Building2 size={13} />
              <span>企业导入</span>
            </button>
          </>
        )}

        {/* 操作按钮（MCP 页） */}
        {tab === 'mcp' && (
          <>
            <div className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => setAddMcpRequest((n) => n + 1)}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={13} />
              <span>添加服务器</span>
            </button>
          </>
        )}

        {/* 操作按钮（专家页） */}
        {tab === 'experts' && (
          <>
            <div className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => setCreateExpertRequest((n) => n + 1)}
              className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus size={13} />
              <span>新建专家</span>
            </button>
          </>
        )}
      </div>

      {/* 内容区：专家页复用 AgentExpertsView（embedded）；Skills/MCP 走 AgentSkillsView 受控筛选 */}
      <div className="flex-1 overflow-auto">
        {tab === 'experts' ? (
          <AgentExpertsView
            embedded
            kind="expert"
            externalSearch={query}
            createRequestToken={createExpertRequest}
          />
        ) : (
          /* Skills / MCP：内容区补左右留白，避免卡片贴侧边菜单太挤 */
          <div className="px-4">
            <AgentSkillsView
              embedded
              hideToolbar
              externalQuery={query}
              sourceFilter={sourceFilter}
              statusFilter={statusFilter}
              categoryFilter={categoryFilter}
              addMcpRequestToken={addMcpRequest}
            />
          </div>
        )}
      </div>

      {/* 操作 dialog（Skills 页） */}
      {tab === 'skills' && (
        <>
          <CommunityMarketDialog
            open={marketOpen}
            onOpenChange={setMarketOpen}
            workspaceSlug={data.workspaceSlug}
            installedSkills={data.skills}
            onImported={() => { /* 安装后自动刷新（useAgentSkillsData 依赖 capabilitiesVersion） */ }}
          />
          <ImportSkillDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            workspaceSlug={data.workspaceSlug}
            installedSkills={data.skills}
            onImported={() => { /* 同上 */ }}
          />
          <OrgSkillImportDialog
            open={orgImportOpen}
            onOpenChange={setOrgImportOpen}
            workspaceSlug={data.workspaceSlug}
            installedSkills={data.skills}
            onImported={() => { /* 同上 */ }}
          />
        </>
      )}
    </div>
  )
}
