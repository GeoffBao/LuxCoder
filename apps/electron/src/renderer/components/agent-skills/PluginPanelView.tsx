/**
 * PluginPanelView — 侧边栏常用插件入口的精简视图
 *
 * 复用 AgentSkillsView 的内容（隐藏其自带工具条），由本组件提供统一工具条：
 * - 顶部栏：返回 + 标题
 * - 工具条：搜索框 + 来源筛选（全部/内置/市场/我的）+ 状态筛选（全部/启用/停用）
 * - 内容：AgentSkillsView 的 Skills / MCP 列表（来源 Badge 已内嵌在卡片上）
 */
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AgentSkillsView } from '@/components/agent-skills/AgentSkillsView'
import { agentSkillsTabAtom } from '@/atoms/active-view'
import { activeViewAtom } from '@/atoms/active-view'
import { cn } from '@/lib/utils'

type PluginTab = 'skills' | 'mcp'
type SourceFilter = 'all' | 'builtin' | 'market' | 'custom'
type StatusFilter = 'all' | 'enabled' | 'disabled'

interface PluginPanelViewProps {
  tab: PluginTab
  title: string
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'builtin', label: '内置' },
  { value: 'market', label: '市场' },
  { value: 'custom', label: '我的' },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
]

function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function PluginPanelView({ tab, title }: PluginPanelViewProps): React.ReactElement {
  const setAgentSkillsTab = useSetAtom(agentSkillsTabAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const [query, setQuery] = React.useState('')
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')

  // 进入时自动设置正确的子 tab
  React.useEffect(() => {
    setAgentSkillsTab(tab)
  }, [tab, setAgentSkillsTab])

  const handleBack = React.useCallback(() => {
    setActiveView('conversations')
  }, [setActiveView])

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏：返回 + 标题 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="h-8 gap-1.5 px-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
          <span>返回</span>
        </Button>
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
      </div>

      {/* 工具条：搜索 + 来源筛选 + 状态筛选 */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-4 py-2.5">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'skills' ? '搜索 Skill...' : '搜索 MCP 服务器...'}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <FilterPills options={SOURCE_OPTIONS} value={sourceFilter} onChange={setSourceFilter} />
        <FilterPills options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {/* 内容区：AgentSkillsView，隐藏自带工具条，使用受控筛选 */}
      <div className="flex-1 overflow-auto">
        <AgentSkillsView
          embedded
          hideToolbar
          externalQuery={query}
          sourceFilter={sourceFilter}
          statusFilter={statusFilter}
        />
      </div>
    </div>
  )
}
