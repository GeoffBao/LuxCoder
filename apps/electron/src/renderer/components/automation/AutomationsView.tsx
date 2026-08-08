/**
 * 定时任务主界面（AutomationsView）
 *
 * 参考 multica autopilots 模块的设计语言，适配 Yoda 定时任务数据模型：
 * - Header：标题 + 总数 + 「新建定时任务」主按钮
 * - 工具栏：状态筛选（全部/启用中/已暂停/已完成，带计数）+ 空间范围 + 排序
 * - 列表：表格化卡片行（状态点 / 名称 / 调度 / 上次运行 / 下次运行 / 模型·空间），
 *   hover 显示行操作（立即运行 / 暂停启用 / 删除），点击行进入编辑表单
 * - 空状态：模板卡片网格（每日新闻摘要 / 每周进展 / 依赖审计…），点模板快速创建
 *
 * 复用 automationFormAtom → AutomationFormView 作为创建/编辑表单；本组件是定时任务唯一主界面。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  BarChart3,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  GitPullRequest,
  Newspaper,
  Pause,
  Play,
  Plus,
  Power,
  Shield,
  Trash2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  automationsAtom,
  automationFormAtom,
  automationToDraft,
  createEmptyDraft,
  type AutomationDraft,
} from '@/atoms/automation-atoms'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { channelsAtom } from '@/atoms/chat-atoms'
import { planningWorkspaceScopeAtom } from '@/atoms/planning-atoms'
import type { Automation } from '@yoda/shared'

/** 状态筛选维度（参考 multica autopilots 的 scope 语义） */
type AutomationScope = 'all' | 'active' | 'paused' | 'completed'

/** 排序维度：默认按下次运行 */
type AutomationSortField = 'nextRun' | 'lastRun' | 'created' | 'name'

/** 任务状态维度（active 启用中 / 手动暂停 / 跑满自动完成） */
type AutomationState = 'active' | 'paused' | 'completed'

function automationState(a: Automation): AutomationState {
  if (!a.active) {
    return a.completedAt ? 'completed' : 'paused'
  }
  return 'active'
}

// ---------------------------------------------------------------------------
// 格式化工具
// ---------------------------------------------------------------------------

/** 调度配置 → 可读文案 */
function formatSchedule(a: Automation): string {
  if (a.scheduleType === 'once') {
    const when = a.scheduledAt
      ? new Date(a.scheduledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '指定时间'
    return `仅一次 ${when}`
  }
  if (a.scheduleType === 'daily') return `每天 ${a.timeOfDay ?? '09:00'}`
  if (a.scheduleType === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每${names[a.dayOfWeek ?? 1]} ${a.timeOfDay ?? '09:00'}`
  }
  if (a.scheduleType === 'monthly') {
    const dom = a.dayOfMonth ?? 1
    const suffix = dom >= 29 ? '（短月落在最后一天）' : ''
    return `每月 ${dom} 号 ${a.timeOfDay ?? '09:00'}${suffix}`
  }
  const min = a.intervalMinutes
  let label: string
  if (min < 60) label = `每 ${min} 分钟`
  else if (min < 1440) label = `每 ${min / 60} 小时`
  else label = `每 ${min / 1440} 天`
  return a.maxRuns !== undefined ? `${label}·限 ${a.maxRuns} 次` : label
}

/** 相对时间（上次运行列）：几秒/几分钟/几小时前，超过 3 天显示日期 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 3 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 下次运行：今天显示 HH:MM，跨天显示 MM/DD HH:MM */
function formatNextRun(ts: number | undefined): string {
  if (!ts || ts <= 0) return '—'
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hhmm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${hhmm}`
}

/** 上次运行结果状态点颜色 */
function runStatusDotClass(status: string | undefined): string {
  if (status === 'success') return 'bg-emerald-500'
  if (status === 'error') return 'bg-red-500'
  if (status === 'skipped') return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}

/** 任务是否具备运行 / 启用所需的最小完整度（模型 + 空间） */
function isRunnable(a: Automation): boolean {
  return !!a.channelId && !!a.workspaceId
}

// ---------------------------------------------------------------------------
// 空状态模板（参考 multica autopilots 的 TEMPLATES 网格）
// ---------------------------------------------------------------------------

interface AutomationTemplate {
  id: string
  name: string
  prompt: string
  icon: LucideIcon
  schedule: Pick<AutomationDraft, 'scheduleType' | 'timeOfDay' | 'dayOfWeek'>
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'daily_news',
    name: '每日新闻摘要',
    prompt: '搜索今天发布的行业新闻，筛选与我们相关的条目，每条给出标题、来源和要点，最后汇总成一份简洁的简报。',
    icon: Newspaper,
    schedule: { scheduleType: 'daily', timeOfDay: '09:00' },
  },
  {
    id: 'pr_review',
    name: '代码审查提醒',
    prompt: '列出仓库中超过 24 小时未审查的 Pull Request，附上作者、停留时长和改动摘要，提醒团队及时安排审查。',
    icon: GitPullRequest,
    schedule: { scheduleType: 'daily', timeOfDay: '10:00' },
  },
  {
    id: 'bug_triage',
    name: 'Bug 分类整理',
    prompt: '列出所有待处理的 Bug，读取描述和相关日志，按严重程度（严重/高/中/低）分类，并给出建议的处理顺序。',
    icon: Bug,
    schedule: { scheduleType: 'daily', timeOfDay: '09:00' },
  },
  {
    id: 'weekly_progress',
    name: '每周项目进展',
    prompt: '汇总本周已完成、进行中和阻塞的任务，计算关键指标（完成数、新增数、净变化），输出一份结构化周报。',
    icon: BarChart3,
    schedule: { scheduleType: 'weekly', timeOfDay: '17:00', dayOfWeek: 1 },
  },
  {
    id: 'dependency_audit',
    name: '依赖安全检查',
    prompt: '对项目运行依赖审计，找出存在安全漏洞的包以及落后太多大版本的依赖，列出严重程度、影响包和修复建议。',
    icon: Shield,
    schedule: { scheduleType: 'weekly', timeOfDay: '08:00', dayOfWeek: 1 },
  },
  {
    id: 'documentation_check',
    name: '文档一致性检查',
    prompt: '列出过去 7 天合并的代码变更，检查相关文档是否同步更新，找出缺少文档的 API 和配置项，整理成待补充清单。',
    icon: FileSearch,
    schedule: { scheduleType: 'weekly', timeOfDay: '14:00', dayOfWeek: 1 },
  },
]

// ---------------------------------------------------------------------------
// 主视图
// ---------------------------------------------------------------------------

export function AutomationsView({ standalone = false }: { standalone?: boolean } = {}): React.ReactElement {
  const automations = useAtomValue(automationsAtom)
  const setAutomations = useSetAtom(automationsAtom)
  const setForm = useSetAtom(automationFormAtom)
  const [workspaceScope, setWorkspaceScope] = useAtom(planningWorkspaceScopeAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const channels = useAtomValue(channelsAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)

  const [scope, setScope] = React.useState<AutomationScope>('all')
  const [sortField, setSortField] = React.useState<AutomationSortField>('nextRun')

  const refreshList = React.useCallback(async () => {
    const list = await window.electronAPI.listAutomations(workspaceScope, currentWorkspaceId ?? undefined)
    setAutomations(list)
  }, [setAutomations, workspaceScope, currentWorkspaceId])

  // 空间范围切换后重新拉取（AutomationInitializer 只监听 workspace 切换，不监听 current/all）
  React.useEffect(() => {
    void refreshList()
  }, [refreshList])

  const channelName = React.useCallback(
    (id: string | undefined): string => channels.find((c) => c.id === id)?.name ?? '未配置模型',
    [channels],
  )
  const workspaceName = React.useCallback(
    (id: string | undefined): string => workspaces.find((w) => w.id === id)?.name ?? '未配置空间',
    [workspaces],
  )

  // 状态计数（scope 徽标用完整集合，与 multica 的 scopeCounts 语义一致）
  const counts = React.useMemo(() => {
    let active = 0
    let paused = 0
    let completed = 0
    for (const a of automations) {
      if (automationState(a) === 'active') active++
      else if (automationState(a) === 'completed') completed++
      else paused++
    }
    return { all: automations.length, active, paused, completed }
  }, [automations])

  // 筛选 + 排序
  const rows = React.useMemo(() => {
    const filtered = scope === 'all' ? [...automations] : automations.filter((a) => automationState(a) === scope)
    filtered.sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return b.createdAt - a.createdAt
        case 'lastRun': {
          const av = a.lastRunAt ?? 0
          const bv = b.lastRunAt ?? 0
          return bv - av
        }
        case 'nextRun':
        default: {
          const av = a.nextRunAt && a.nextRunAt > 0 ? a.nextRunAt : Number.POSITIVE_INFINITY
          const bv = b.nextRunAt && b.nextRunAt > 0 ? b.nextRunAt : Number.POSITIVE_INFINITY
          return av - bv
        }
      }
    })
    return filtered
  }, [automations, scope, sortField])

  const openCreate = (template?: AutomationTemplate): void => {
    let maxN = 0
    for (const a of automations) {
      const m = /^定时任务\s*(\d+)$/.exec(a.name.trim())
      if (m) maxN = Math.max(maxN, Number(m[1]))
    }
    const draft = createEmptyDraft()
    if (template) {
      draft.name = template.name
      draft.prompt = template.prompt
      draft.scheduleType = template.schedule.scheduleType
      draft.timeOfDay = template.schedule.timeOfDay
      draft.dayOfWeek = template.schedule.dayOfWeek
    } else {
      draft.name = `定时任务 ${maxN + 1}`
    }
    setForm({ open: true, draft })
  }

  const openEdit = (a: Automation): void => {
    setForm({ open: true, draft: automationToDraft(a) })
  }

  const openPlanningWindow = React.useCallback((): void => {
    void window.electronAPI.openPlanningWindow().catch((error) => {
      console.error('[定时任务] 打开独立窗口失败:', error)
      toast.error('打开独立窗口失败')
    })
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header：非 standalone 用 pt-14 让到 AppShell 全局 drag 层下方（对齐原 PlanningView） */}
      <header className={cn('relative titlebar-no-drag flex w-full items-start justify-between', standalone ? 'px-5 pb-4 pt-8' : 'px-6 pb-5 pt-14 sm:px-8 xl:px-10')}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap size={22} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-wrap-balance">
              定时任务
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium tabular-nums text-foreground/55">
                {counts.all} 项
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">让 AI 按计划自动执行任务，无需人工值守</p>
          </div>
        </div>
        {!standalone && (
          <button
            type="button"
            onClick={openPlanningWindow}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.96]"
          >
            <ExternalLink size={16} /> 独立窗口
          </button>
        )}
        {counts.all > 0 && (
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.96]"
          >
            <Plus size={16} /> 新建定时任务
          </button>
        )}
      </header>

      {/* 工具栏：状态筛选 + 空间范围 + 排序 */}
      {counts.all > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-4 sm:px-8 xl:px-10">
          <div className="flex items-center gap-2">
            <nav className="inline-flex rounded-xl bg-muted/60 p-1 shadow-inner" aria-label="定时任务状态筛选">
              {([
                { id: 'all', label: '全部' },
                { id: 'active', label: '启用中' },
                { id: 'paused', label: '已暂停' },
                { id: 'completed', label: '已完成' },
              ] as Array<{ id: AutomationScope; label: string }>).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScope(item.id)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
                    scope === item.id ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                  <span className={cn('text-xs tabular-nums', scope === item.id ? 'text-foreground/55' : 'text-foreground/35')}>
                    {counts[item.id]}
                  </span>
                </button>
              ))}
            </nav>
            <nav className="inline-flex rounded-xl bg-muted/60 p-1 shadow-inner" aria-label="空间范围">
              {(['current', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setWorkspaceScope(s)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
                    workspaceScope === s ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'current' ? '当前空间' : '全部空间'}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/40">排序</span>
            <Select value={sortField} onValueChange={(v) => setSortField(v as AutomationSortField)}>
              <SelectTrigger className="h-9 w-36 gap-2 rounded-lg bg-background text-[13px] shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nextRun">下次运行</SelectItem>
                <SelectItem value="lastRun">最近运行</SelectItem>
                <SelectItem value="created">创建时间</SelectItem>
                <SelectItem value="name">名称</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* 列表内容 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {counts.all === 0 ? (
          <EmptyState onCreate={() => openCreate()} onPickTemplate={openCreate} />
        ) : rows.length === 0 ? (
          <div className="mx-auto max-w-xl px-8 py-24 text-center text-sm text-foreground/45">
            当前筛选下没有定时任务，试试切换状态或「全部」。
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl px-6 pb-8 sm:px-8 xl:px-10">
            <div className="overflow-hidden rounded-xl border border-border/50 bg-content-area shadow-sm">
              {/* 表头（参考 multica ListGridHeader） */}
              <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 text-[12px] font-medium text-foreground/45">
                <span className="flex-1 min-w-0">任务</span>
                <span className="hidden w-44 shrink-0 md:block">调度</span>
                <span className="hidden w-36 shrink-0 lg:block">上次运行</span>
                <span className="hidden w-32 shrink-0 lg:block">下次运行</span>
                <span className="hidden w-40 shrink-0 xl:block">模型 · 空间</span>
                <span className="w-8 shrink-0" aria-hidden="true" />
              </div>
              {rows.map((a, i) => (
                <AutomationRow
                  key={a.id}
                  automation={a}
                  index={i}
                  channelName={channelName}
                  workspaceName={workspaceName}
                  onEdit={() => openEdit(a)}
                  onRefresh={refreshList}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 列表行
// ---------------------------------------------------------------------------

interface AutomationRowProps {
  automation: Automation
  index: number
  channelName: (id: string | undefined) => string
  workspaceName: (id: string | undefined) => string
  onEdit: () => void
  onRefresh: () => Promise<void>
}

function AutomationRow({ automation: a, index, channelName, workspaceName, onEdit, onRefresh }: AutomationRowProps): React.ReactElement {
  const state = automationState(a)
  const lastRun = a.runHistory.length > 0 ? a.runHistory[a.runHistory.length - 1] : undefined

  const handleRunNow = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!isRunnable(a)) {
      toast.error('请先为该任务配置模型与空间')
      onEdit()
      return
    }
    toast.success(`已开始运行「${a.name}」`, {
      description: '本次任务会创建新的 Agent 会话，可在左侧会话列表查看',
    })
    try {
      await window.electronAPI.runAutomationNow(a.id)
      await onRefresh()
    } catch (err) {
      toast.error('运行失败')
      console.error('[定时任务] 立即运行失败:', err)
    }
  }

  const handleToggle = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!a.active && !isRunnable(a)) {
      toast.error('请先为该任务配置模型与空间')
      onEdit()
      return
    }
    try {
      await window.electronAPI.toggleAutomation(a.id, !a.active)
      await onRefresh()
      toast.success(a.active ? '已暂停' : '已启用')
    } catch (err) {
      toast.error('操作失败')
      console.error('[定时任务] 切换状态失败:', err)
    }
  }

  const handleDelete = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm(`确定要删除定时任务「${a.name}」吗？`)) return
    try {
      await window.electronAPI.deleteAutomation(a.id)
      await onRefresh()
      toast.success('已删除')
    } catch (err) {
      toast.error('删除失败')
      console.error('[定时任务] 删除失败:', err)
    }
  }

  const stateDot = state === 'active' ? 'bg-emerald-500' : state === 'completed' ? 'bg-blue-500' : 'bg-amber-500'
  const stateLabel = state === 'active' ? '启用中' : state === 'completed' ? '已完成' : '已暂停'
  const model = a.modelId ?? channelName(a.channelId)
  const runCountLabel = a.maxRuns !== undefined ? `${a.runCount ?? 0}/${a.maxRuns}` : `${a.runCount ?? 0} 次`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className={cn(
        'group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.15] cursor-pointer focus:outline-none focus-visible:bg-foreground/[0.18]',
        index > 0 && 'border-t border-border/40',
      )}
    >
      {/* 任务主信息：状态点 + 名称 + 状态标签 + prompt 摘要 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 shrink-0 rounded-full', stateDot)} title={stateLabel} />
          <span className="truncate text-[14px] font-medium text-foreground">{a.name}</span>
          <span className={cn(
            'shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium',
            state === 'active' ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : state === 'completed' ? 'bg-blue-500/12 text-blue-600 dark:text-blue-400' : 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
          )}>
            {stateLabel}
          </span>
        </div>
        <div className="mt-1 truncate text-[12px] text-foreground/45">{a.prompt}</div>
      </div>

      {/* 调度 */}
      <div className="hidden w-44 shrink-0 md:block">
        <div className="flex items-center gap-1.5 text-[12px] text-foreground/70">
          <Clock size={12} className="shrink-0 text-foreground/35" />
          <span className="truncate">{formatSchedule(a)}</span>
        </div>
        <div className="mt-1 text-[12px] tabular-nums text-foreground/45">已运行 {runCountLabel}</div>
      </div>

      {/* 上次运行 */}
      <div className="hidden w-36 shrink-0 lg:block">
        {lastRun ? (
          <>
            <div className="flex items-center gap-1.5 text-[12px] tabular-nums text-foreground/70">
              <span className={cn('size-1.5 shrink-0 rounded-full', runStatusDotClass(lastRun.status))} />
              <span>{formatRelativeTime(lastRun.runAt)}</span>
            </div>
            <div className="mt-1 text-[12px] text-foreground/45">
              {lastRun.status === 'success' ? '运行成功' : lastRun.status === 'error' ? '运行失败' : '已跳过'}
            </div>
          </>
        ) : (
          <span className="text-[12px] text-foreground/35">从未运行</span>
        )}
      </div>

      {/* 下次运行 */}
      <div className="hidden w-32 shrink-0 lg:block">
        {a.active ? (
          <>
            <div className="flex items-center gap-1.5 text-[12px] tabular-nums text-foreground/70">
              <CheckCircle2 size={12} className="shrink-0 text-emerald-500/70" />
              <span>{formatNextRun(a.nextRunAt)}</span>
            </div>
            <div className="mt-1 text-[12px] text-foreground/45">
              {a.scheduleType === 'once' ? '一次性任务' : a.maxRuns !== undefined ? `限 ${a.maxRuns} 次` : '长期循环'}
            </div>
          </>
        ) : (
          <span className="text-[12px] text-foreground/35">—</span>
        )}
      </div>

      {/* 模型 · 空间 */}
      <div className="hidden w-40 shrink-0 xl:block">
        <div className="truncate text-[12px] text-foreground/70" title={model}>{model}</div>
        <div className="mt-1 truncate text-[12px] text-foreground/45" title={workspaceName(a.workspaceId)}>{workspaceName(a.workspaceId)}</div>
      </div>

      {/* 右侧槽位：默认显示下次运行摘要，hover 显示行操作（Play/删除），右侧固定暂停启用按钮。 */}
      <div className="relative h-7 w-28 shrink-0">
        <span className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 text-[12px] tabular-nums whitespace-nowrap transition-opacity group-hover:opacity-0',
          'text-foreground/40',
        )}>
          {formatNextRun(a.active ? a.nextRunAt : 0)}
        </span>
        <div className="pointer-events-none absolute right-8 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`立即运行 ${a.name}`}
                onClick={(e) => { void handleRunNow(e) }}
                className="p-1.5 rounded-md text-foreground/50 hover:text-foreground/85 hover:bg-foreground/[0.08] transition-colors"
              >
                <Play className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">立即运行一次</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`删除 ${a.name}`}
                onClick={(e) => { void handleDelete(e) }}
                className="p-1.5 rounded-md text-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">删除任务</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={a.active ? `暂停 ${a.name}` : `启用 ${a.name}`}
              onClick={(e) => { void handleToggle(e) }}
              className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2 p-1.5 flex items-center justify-center rounded-md transition-colors',
                a.active
                  ? 'text-foreground/35 hover:bg-foreground/[0.06] hover:text-foreground/70 group-hover:text-foreground/55'
                  : 'text-foreground/30 hover:bg-emerald-500/10 hover:text-emerald-500 group-hover:text-foreground/45',
              )}
            >
              {a.active ? <Pause className="size-3.5" /> : <Power className="size-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {a.active ? '暂停任务：从当前开始不再继续后续自动处理' : '启用任务'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 空状态（模板卡片网格，参考 multica autopilots empty state）
// ---------------------------------------------------------------------------

function EmptyState({ onCreate, onPickTemplate }: { onCreate: () => void; onPickTemplate: (t: AutomationTemplate) => void }): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-4xl px-8 pb-12">
      <div className="flex flex-col items-center pt-14 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Zap className="size-8" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-foreground/90">暂无定时任务</h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-foreground/50">
          定时任务可以让 AI 周期性地执行某项任务，如每天总结邮件、每小时检查 GitHub 仓库等。
          也可以直接在对话中说「以后每隔 X 分钟…」，Yoda 会自动识别并创建。
        </p>
        <div className="mt-7 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => {
            const Icon = tpl.icon
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onPickTemplate(tpl)}
                className="group flex items-start gap-3 rounded-xl border border-border/50 bg-content-area p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-px"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/60 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground/85">{tpl.name}</div>
                  <div className="mt-1 text-[12px] text-foreground/45">{tpl.schedule.scheduleType === 'weekly' ? '每周执行' : '每天执行'}</div>
                </div>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mt-8 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-4 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
        >
          <Plus size={14} /> 从空白创建
        </button>
      </div>
    </div>
  )
}
