import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Bug, CheckCheck, ListChecks, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { BrowserTbDefectItem, BrowserTbWorkflow } from '@/../preload/index'
import {
  tbCurrentUserIdAtom,
  tbDefectBusyAtom,
  tbDefectDetailAtom,
  tbDefectDetailCacheAtom,
  tbDefectErrorAtom,
  tbDefectItemsAtom,
  tbDefectLoadedWorkspaceAtom,
  tbDefectLoadingAtom,
  tbDefectTaskDetailAtom,
  tbDefectTransitionsAtom,
  tbDefectWorkflowsAtom,
  tbLocalTaskIdsAtom,
} from '@/atoms/tb-defect-atoms'
import { taskBoardSectionAtom } from '@/atoms/task-board-section-atoms'
import { tbDefectLastSyncAtAtom } from '@/atoms/tb-defect-sync-atoms'
import { tbDefectAnalysisAtom, tbDefectExecutionAtom } from '@/atoms/tb-defect-analysis-atoms'
import { serverKanbanRunsAtom, serverKanbanSessionsAtom, serverTaskSummariesAtom } from '@/atoms/kanban-atoms'
import { tabsAtom } from '@/atoms/tab-atoms'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOpenSession } from '@/hooks/useOpenSession'
import { formatRelativeUpdatedAt } from '@/components/app-shell/AgentSessionItem'
import { tbViewRoleAtom } from '@/atoms/tb-view-role-atoms'
import { SectionTabs } from '@/components/ui/section-tabs'
import { buildReportCommentDraft, buildTbCommentDraft, extractAnalysisText, TB_ROLE_VIEWS, type TbRoleView, type TbViewRole } from '@luxcoder/shared/teambition-defect'
import { classifyDefect, isReopened, resolveSkillMatchesForItem, type TbSection } from './tb-defect-model'
import { TbDefectDetailDrawer } from './TbDefectDetailDrawer'
import { TbDefectItemRow, TbSectionHeader } from './TbDefectItemRow'
import { TbSkillSelectDialog, type TbSkillOption, type TbTaskSkillConfirm } from './TbSkillSelectDialog'

/** 三区元数据（标题随角色视图变） */
function sectionMeta(roleView: TbRoleView): Array<{ key: TbSection; title: string; accent: string; hint?: string }> {
  return [
    { key: 'mine-actionable', title: roleView.sectionTitles.mine, accent: 'bg-emerald-500' },
    { key: 'handed-off', title: roleView.sectionTitles.handedOff, accent: 'bg-sky-500' },
    { key: 'closed', title: roleView.sectionTitles.closed, accent: 'bg-foreground/30', hint: '近 3 天' },
  ]
}

/** 测试角色是否启用（当前先屏蔽，仅调试研发板块；改 true 恢复） */
const TESTER_ROLE_VISIBLE = false

/** 角色切换选项（按可见性过滤） */
const ROLE_OPTIONS: Array<{ value: TbViewRole; label: string }> = [
  { value: 'developer', label: '研发' },
  ...(TESTER_ROLE_VISIBLE ? [{ value: 'tester' as const, label: '测试' }] : []),
]

interface TeambitionDefectBoardViewProps {
  workspaceRoot: string
  workspaceId: string
  /** 加入本地任务时默认填充的项目 id（当前看板选中项目） */
  defaultProjectId?: string
  /** 加入本地任务时默认填充的工作目录（选中项目的 workingDirectory） */
  defaultWorkingDirectory?: string
  /** 加入本地任务成功后刷新 Agent 看板 */
  onRefresh?: () => void | Promise<void>
}

/** TB 问题看板主视图：研发三区 + 单条详情（基础信息/完整性/分支提示/时间线） */
export function TeambitionDefectBoardView({ workspaceRoot, workspaceId, defaultProjectId, defaultWorkingDirectory, onRefresh }: TeambitionDefectBoardViewProps): React.ReactElement {
  const [items, setItems] = useAtom(tbDefectItemsAtom)
  const [loading, setLoading] = useAtom(tbDefectLoadingAtom)
  const [error, setError] = useAtom(tbDefectErrorAtom)
  /** 是否 Mock 网关（无真实 TB 配置时的本地兜底，展示「演示数据」角标） */
  const [isMock, setIsMock] = React.useState(false)
  const [detail, setDetail] = useAtom(tbDefectDetailAtom)
  const [detailCache, setDetailCache] = useAtom(tbDefectDetailCacheAtom)
  const [taskDetail, setTaskDetail] = useAtom(tbDefectTaskDetailAtom)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [transitions, setTransitions] = useAtom(tbDefectTransitionsAtom)
  const [transitionsLoading, setTransitionsLoading] = React.useState(false)
  const [workflows, setWorkflows] = useAtom(tbDefectWorkflowsAtom)
  const [currentUserId, setCurrentUserId] = useAtom(tbCurrentUserIdAtom)
  const [busy, setBusy] = useAtom(tbDefectBusyAtom)
  const [analysisMap, setAnalysisMap] = useAtom(tbDefectAnalysisAtom)
  const [lastSyncAt, setLastSyncAt] = useAtom(tbDefectLastSyncAtAtom)
  /** 已同步 AI 分析预览的「taskId → 会话 updatedAt」：会话更新（重跑/继续）后重新拉取覆盖旧内容，否则不重复拉 */
  const syncedAnalysisAtRef = React.useRef<Record<string, number>>({})
  /** 当前视图角色（研发/测试）：决定数据范围与三区归属 */
  const [viewRole, setViewRole] = useAtom(tbViewRoleAtom)
  const roleView = TB_ROLE_VIEWS[viewRole]
  // 测试角色屏蔽时强制回退研发（避免持久化的 tester 残留仍生效）
  React.useEffect(() => {
    if (!TESTER_ROLE_VISIBLE && viewRole === 'tester') setViewRole('developer')
  }, [setViewRole, viewRole])
  const [checkedTaskIds, setCheckedTaskIds] = React.useState<Set<string>>(new Set())
  const [addingTaskIds, setAddingTaskIds] = React.useState<Set<string>>(new Set())
  const [localTaskIds, setLocalTaskIds] = useAtom(tbLocalTaskIdsAtom)
  /** 多选模式：默认关闭（复选框隐藏）；工具栏「多选」按钮切换 */
  const [multiSelectActive, setMultiSelectActive] = React.useState(false)
  /** 已关闭区：懒加载近 3 天关闭的我的任务（首次展开时拉取） */
  const [closedItems, setClosedItems] = React.useState<BrowserTbDefectItem[]>([])
  const [closedLoading, setClosedLoading] = React.useState(false)
  const [closedLoaded, setClosedLoaded] = React.useState(false)
  /** Skill 勾选对话框：滚动预览（一次展示所有任务，每条各自技能） */
  const [skillDialogTasks, setSkillDialogTasks] = React.useState<TbTaskSkillConfirm[]>([])
  const [skillDialogBusy, setSkillDialogBusy] = React.useState(false)
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // 执行状态联动：从本地 Agent 看板任务/会话/运行快照派生「TB taskId → 执行状态」
  // （复用 Agent 看板模块级 atom，与看板执行状态实时联动，不重复请求）
  const taskSummaries = useAtomValue(serverTaskSummariesAtom)
  const agentSessions = useAtomValue(serverKanbanSessionsAtom)
  const taskRuns = useAtomValue(serverKanbanRunsAtom)
  const [, setExecutionMap] = useAtom(tbDefectExecutionAtom)
  const executionMap = useAtomValue(tbDefectExecutionAtom)
  React.useEffect(() => {
    const next: Record<string, { status: 'idle' | 'running' | 'completed' | 'failed'; at: number; summary?: string; taskSlug?: string }> = {}
    // 分析结果回写：completed 会话若会话 updatedAt 变化（重跑/继续执行），重新拉取覆盖预览
    const pendingAnalysis: Array<{ tbTaskId: string; sessionId: string; updatedAt: number }> = []
    for (const task of taskSummaries ?? []) {
      if (!task.teambitionTaskId) continue
      const linkedSession = task.orchestratorSessionId
        ? agentSessions.find((session) => session.id === task.orchestratorSessionId)
        : agentSessions.find((session) => session.taskSlug === task.taskSlug && !session.parentSessionId)
      const run = taskRuns.find((candidate) =>
        candidate.taskSlug === task.taskSlug && (linkedSession === undefined || candidate.runId === linkedSession.taskRunId),
      )
      let status: 'idle' | 'running' | 'completed' | 'failed' = 'idle'
      let summary: string | undefined
      if (linkedSession) {
        const sessionStatus = linkedSession.sessionStatus
        if (sessionStatus === 'running' || sessionStatus === 'in-progress' || sessionStatus === 'queued') {
          status = 'running'
        } else if (sessionStatus === 'done' || sessionStatus === 'completed') {
          status = 'completed'
        } else if (sessionStatus === 'needs-review' || sessionStatus === 'failed') {
          status = 'failed'
          summary = run?.failureReason
        }
      }
      next[task.teambitionTaskId] = {
        status,
        at: Date.now(),
        ...(summary ? { summary } : {}),
        taskSlug: task.taskSlug,
      }
      // 已完成：会话 updatedAt 变化（重跑/继续执行产生新消息）→ 重新拉会话消息覆盖预览；未变化不重复拉
      if (status === 'completed' && linkedSession) {
        const updatedAt = linkedSession.updatedAt ?? 0
        if (syncedAnalysisAtRef.current[task.teambitionTaskId] !== updatedAt) {
          pendingAnalysis.push({ tbTaskId: task.teambitionTaskId, sessionId: linkedSession.id, updatedAt })
        }
      }
    }
    setExecutionMap(next)
    for (const item of pendingAnalysis) {
      void syncAnalysisFromSession(item.tbTaskId, item.sessionId, item.updatedAt)
    }
  }, [agentSessions, setExecutionMap, taskRuns, taskSummaries])
  const [openSections, setOpenSections] = React.useState<Record<TbSection, boolean>>({
    'mine-actionable': true,
    'handed-off': false,
    closed: false,
  })
  const openSession = useOpenSession()
  const tabs = useAtomValue(tabsAtom)
  const setSection = useSetAtom(taskBoardSectionAtom)

  const loadList = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot) return
    setLoading(true)
    setError(null)
    try {
      const api = window.electronAPI.teambitionBoard
      // 按角色数据范围拉取：研发=我执行；测试=我执行+我参与
      const roleTypes = roleView.scope === 'my-involved' ? 'executor,involveMember' : undefined
      const [userId, myDefects, localTaskIds, isMock] = await Promise.all([
        api.getCurrentUser(workspaceRoot),
        api.listMyDefects(workspaceRoot, roleTypes),
        api.listLocalTbTaskIds(workspaceRoot, workspaceId),
        api.isMock(workspaceRoot),
      ])
      setCurrentUserId(userId)
      setItems(myDefects)
      setLocalTaskIds(new Set(localTaskIds))
      setIsMock(isMock)
      // 整体刷新：清空详情缓存，重做完整性检查；已关闭区懒加载数据作废（下次展开重新拉取）
      setDetailCache(new Map())
      setTaskDetail(null)
      setClosedItems([])
      setClosedLoaded(false)
      // 批量补全工作流（含状态名），避免每条任务逐一请求
      if (myDefects.length > 0) {
        const batch = await api.getWorkflowsBatch(workspaceRoot, myDefects.map((task) => task.taskId))
        setWorkflows((prev) => {
          const next = new Map(prev)
          for (const [taskId, workflow] of Object.entries(batch)) next.set(taskId, workflow)
          return next
        })
        // 用工作流补 tfsName（列表展示状态名）
        const enriched = myDefects.map((task) => {
          if (task.tfsName) return task
          const status = batch[task.taskId]?.statuses.find((s) => s.id === task.tfsId)
          return status ? { ...task, tfsName: status.name } : task
        })
        setItems(enriched)
      }
      // 同步成功后才记录「上次更新时间」
      setLastSyncAt(Date.now())
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const reauthHint = message.includes('需要重新授权') || message.includes('needs-reauth') || message.includes('授权')
      setError(reauthHint
        ? 'Teambition 需要重新授权，请先在 MCP 设置中检查 TB-Connect 配置。'
        : message)
      console.error('[TbBoard] 加载任务列表失败:', cause)
    } finally {
      setLoading(false)
    }
  }, [roleView.scope, setCurrentUserId, setClosedItems, setClosedLoaded, setDetailCache, setError, setIsMock, setItems, setLastSyncAt, setLoading, setLocalTaskIds, setTaskDetail, setWorkflows, workspaceRoot, workspaceId])

  // 刷新策略：每个工作区首次进入 TB tab 全量加载一次；之后切走/切回不自动刷新（避免频繁 API 访问），
  // 仅用户手动点「刷新」按钮（loadList）才更新。
  // 用模块级 atom 记录已加载工作区（useRef 会随组件卸载销毁 → 切 tab 回来误触发刷新）
  const section = useAtomValue(taskBoardSectionAtom)
  // 切换视图角色后强制刷新（数据范围/归属变化）
  const prevRoleRef = React.useRef<TbViewRole>(viewRole)
  React.useEffect(() => {
    if (prevRoleRef.current !== viewRole) {
      prevRoleRef.current = viewRole
      setItems([])
      setClosedItems([])
      setClosedLoaded(false)
      void loadList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRole])
  const [loadedWorkspace, setLoadedWorkspace] = useAtom(tbDefectLoadedWorkspaceAtom)
  React.useEffect(() => {
    if (section !== 'tb-defect') return
    if (loadedWorkspace === workspaceRoot) return
    setLoadedWorkspace(workspaceRoot)
    void loadList()
  }, [section, loadedWorkspace, loadList, setLoadedWorkspace, workspaceRoot])

  const openDetail = async (item: BrowserTbDefectItem): Promise<void> => {
    setDetail(item)
    setTransitionsLoading(true)
    setDetailLoading(true)
    setTransitions([])
    setTaskDetail(null)

    // 缓存命中：切换回已看过的任务直接用缓存，不重复调 MCP / 不重复做完整性检查
    const cached = detailCache.get(item.taskId)
    if (cached) {
      setTransitions(cached.transitions)
      setTaskDetail(cached.detail)
      setTransitionsLoading(false)
      setDetailLoading(false)
      return
    }

    try {
      const [result, taskDetailResult] = await Promise.all([
        window.electronAPI.teambitionBoard.listTransitions(workspaceRoot, item.taskId),
        window.electronAPI.teambitionBoard.getTaskDetail(workspaceRoot, item.taskId).catch(() => null),
      ])
      setTransitions(result)
      if (taskDetailResult) {
        setTaskDetail(taskDetailResult)
        // 写入缓存
        setDetailCache((cache) => new Map(cache).set(item.taskId, { detail: taskDetailResult, transitions: result }))
      }
    } catch (cause) {
      console.warn('[TbBoard] 加载任务详情失败:', cause)
      setTransitions([])
    } finally {
      setTransitionsLoading(false)
      setDetailLoading(false)
    }
  }

  // 工作区 Skills（用于 skill 适配判断）
  const [workspaceSkills, setWorkspaceSkills] = React.useState<Array<{ slug: string; name: string; description?: string; enabled: boolean }>>([])

  /** 拉取会话 SDK 消息，提取最后一条 assistant 文本作为分析结果写入「AI 分析预览」区（已按四段式组织） */
  const syncAnalysisFromSession = React.useCallback(async (tbTaskId: string, sessionId: string, updatedAt?: number): Promise<void> => {
    try {
      // 优先从分析报告文件提取（报告是权威源，避免 AI 总结/验收回复污染）
      let text = ''
      if (workspaceRoot) {
        const slug = workspaceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
        const report = await window.electronAPI.teambitionBoard.resolveAnalysisReport(workspaceRoot, slug, sessionId)
        if (report?.trim()) {
          // 从报告组织四段式：结论先行 → 证据日志 → 下一步动作 → 修复建议
          text = buildReportCommentDraft(report)
        }
      }
      // 报告不存在 → 回退：从会话消息提取分析结论文本（跳过验收回复）
      if (!text) {
        const messages = await window.electronAPI.getAgentSessionSDKMessages(sessionId)
        const extracted = extractAnalysisText(messages)
        if (extracted) text = buildTbCommentDraft(extracted)
      }
      if (text) {
        setAnalysisMap((map) => ({ ...map, [tbTaskId]: text }))
      }
      // 记录本次已同步的会话 updatedAt（无论是否取到文本都标记，避免下次重复拉取）
      if (updatedAt !== undefined) syncedAnalysisAtRef.current[tbTaskId] = updatedAt
    } catch (cause) {
      console.warn('[TbBoard] 同步分析结果失败:', cause)
    }
  }, [setAnalysisMap, workspaceRoot])
  React.useEffect(() => {
    if (!workspaceRoot) return
    const slug = workspaceRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
    if (!slug) return
    let cancelled = false
    void window.electronAPI.getWorkspaceCapabilities(slug)
      .then((caps) => { if (!cancelled) setWorkspaceSkills(caps.skills.map((skill) => ({ slug: skill.slug, name: skill.name, description: skill.description, enabled: skill.enabled }))) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [workspaceRoot])

  const grouped = React.useMemo(() => {
    const groups: Record<TbSection, BrowserTbDefectItem[]> = {
      'mine-actionable': [],
      'handed-off': [],
      // 已关闭区 = 懒加载数据（近3天 isDone=true）+ 当前列表被判终态的任务合并，保证任务永不丢失
      closed: [...closedItems],
    }
    for (const item of items) {
      const section = classifyDefect(item, workflows.get(item.taskId), roleView, currentUserId)
      if (section === 'closed') {
        if (!groups.closed.some((closed) => closed.taskId === item.taskId)) groups.closed.push(item)
        continue
      }
      groups[section].push(item)
    }
    groups['mine-actionable'].sort((a, b) => {
      const aReopen = isReopened(a, workflows.get(a.taskId)) ? 1 : 0
      const bReopen = isReopened(b, workflows.get(b.taskId)) ? 1 : 0
      if (aReopen !== bReopen) return bReopen - aReopen
      return (b.priority ?? 0) - (a.priority ?? 0)
    })
    groups['handed-off'].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    return groups
  }, [closedItems, items, workflows, roleView, currentUserId])

  const openLinkedSession = (item: BrowserTbDefectItem): void => {
    // 从本地任务摘要找 TB taskId 对应的会话：优先 orchestratorSessionId，其次 taskSlug
    const summary = taskSummaries?.find((task) => task.teambitionTaskId === item.taskId)
    const sessionId = summary?.orchestratorSessionId
    if (sessionId) {
      void openSession('agent', sessionId, summary?.taskSlug ? `本地任务：${summary.taskSlug}` : '本地任务')
      return
    }
    if (summary?.taskSlug) {
      const linked = tabs.find((tab) => tab.id === `task:${summary.taskSlug}` || tab.sessionId === summary.taskSlug)
      if (linked) {
        void openSession('agent', linked.sessionId ?? linked.id, linked.title)
        return
      }
      void openSession('agent', summary.taskSlug, `本地任务：${summary.taskSlug}`)
      return
    }
    toast.info('未找到关联 Agent 会话', { description: '该 TB 问题单的本地任务会话未找到。' })
  }

  const handleComment = async (text: string): Promise<void> => {
    if (!detail) return
    await window.electronAPI.teambitionBoard.postComment(workspaceRoot, detail.taskId, text)
  }

  // 已关闭区懒加载：首次展开时拉取近 3 天关闭的我的任务（不随整体刷新重复拉取，避免数据量增大）
  const loadClosed = React.useCallback(async (): Promise<void> => {
    if (!workspaceRoot || closedLoaded || closedLoading) return
    setClosedLoading(true)
    try {
      const closed = await window.electronAPI.teambitionBoard.listClosedDefects(workspaceRoot, 3)
      setClosedItems(closed)
      setClosedLoaded(true)
      // 补全状态名（复用整体工作流缓存）
      if (closed.length > 0) {
        const batch = await window.electronAPI.teambitionBoard.getWorkflowsBatch(workspaceRoot, closed.map((task) => task.taskId))
        setWorkflows((prev) => {
          const next = new Map(prev)
          for (const [taskId, workflow] of Object.entries(batch)) next.set(taskId, workflow)
          return next
        })
        const enriched = closed.map((task) => {
          if (task.tfsName) return task
          const status = batch[task.taskId]?.statuses.find((s) => s.id === task.tfsId)
          return status ? { ...task, tfsName: status.name } : task
        })
        setClosedItems(enriched)
      }
    } catch (cause) {
      console.error('[TbBoard] 加载已关闭任务失败:', cause)
      toast.error('加载已关闭任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setClosedLoading(false)
    }
  }, [closedLoaded, closedLoading, setWorkflows, workspaceRoot])

  // 多选模式：可多选任务 = 未加入本地 Agent 看板的条目（已加入置灰不可选）
  const selectableTaskIds = React.useMemo(
    () => items.filter((item) => !localTaskIds.has(item.taskId)).map((item) => item.taskId),
    [items, localTaskIds],
  )
  const allSelectableChecked = selectableTaskIds.length > 0
    && selectableTaskIds.every((taskId) => checkedTaskIds.has(taskId))
  const toggleSelectAll = (): void => {
    if (allSelectableChecked) {
      // 已全选 → 取消全选
      setCheckedTaskIds((prev) => {
        const next = new Set(prev)
        for (const taskId of selectableTaskIds) next.delete(taskId)
        return next
      })
    } else {
      // 未全选 → 全选（保持已选的，补上所有可选项）
      setCheckedTaskIds((prev) => new Set([...prev, ...selectableTaskIds]))
    }
  }
  const toggleMultiSelect = (): void => {
    setMultiSelectActive((active) => {
      const next = !active
      // 退出多选时清空已选，避免隐藏复选框仍残留选中态
      if (!next) setCheckedTaskIds(new Set())
      return next
    })
  }

  // 加入本地任务：自动选 Agent（当前内置专家为通用型，统一 general；后续可扩展模块匹配）
  const LOCAL_TASK_EXPERT_ID = 'general'

  /** 打开 Skill 勾选对话框（逐条确认：每条任务各自候选/勾选） */
  const openSkillDialog = (taskIds: string[]): void => {
    if (!workspaceRoot || !workspaceId || taskIds.length === 0) return
    const tasks = items.filter((item) => taskIds.includes(item.taskId))
    if (tasks.length === 0) return
    const confirms: TbTaskSkillConfirm[] = tasks.map((task) => {
      // AI 匹配：基于标题/类型（列表级），候选列表 = 匹配到的 skill（不全量加载）
      const matched = new Map<string, TbSkillOption>()
      for (const match of resolveSkillMatchesForItem(task, workspaceSkills)) {
        const skill = workspaceSkills.find((s) => s.slug === match.slug)
        if (skill) matched.set(match.slug, { slug: skill.slug, name: skill.name, description: skill.description, autoMatched: true })
      }
      const candidates = [...matched.values()]
      return {
        taskId: task.taskId,
        title: task.content,
        candidates,
        selected: new Set(candidates.map((c) => c.slug)),
      }
    })
    setSkillDialogTasks(confirms)
  }

  /** 更新某条任务的勾选 */
  const changeSkillDialogSelection = (taskId: string, selected: Set<string>): void => {
    setSkillDialogTasks((prev) => prev.map((task) => task.taskId === taskId ? { ...task, selected } : task))
  }

  /** 确认加入：逐条携带各自勾选的 skill 调用主进程 */
  const confirmAddToLocal = async (): Promise<void> => {
    const confirms = skillDialogTasks
    if (!workspaceRoot || !workspaceId || confirms.length === 0) return
    setSkillDialogBusy(true)
    try {
      // 每条任务用各自勾选的技能（不含 connect-tb-workflow——主进程已作为必选自动带）
      const selected = confirms.map((confirm) => {
        const item = items.find((entry) => entry.taskId === confirm.taskId)
        return {
          id: confirm.taskId,
          title: item?.content ?? confirm.title,
          projectId: item?.projectId ?? '',
          type: item?.type,
          uniqueId: item?.uniqueId,
        }
      })
      const skillsByTask: Record<string, string[]> = {}
      for (const confirm of confirms) skillsByTask[confirm.taskId] = [...confirm.selected]
      const result = await window.electronAPI.teambition.createSyncedTasks(workspaceRoot, workspaceId, selected, {
        expertId: LOCAL_TASK_EXPERT_ID,
        // 逐条技能：主进程按 taskId 匹配各自勾选
        skillsByTask,
        // 加入本地任务按当前看板默认填充：项目归属 + 工作目录（未选中项目则不传 → Workspace 范围）
        ...(defaultProjectId ? { projectId: defaultProjectId } : {}),
        ...(defaultWorkingDirectory ? { workingDirectory: defaultWorkingDirectory } : {}),
      })
      const createdCount = result.created?.length ?? 0
      const failedCount = result.failed?.length ?? 0
      const skippedCount = result.skipped?.length ?? 0
      if (createdCount > 0) {
        const parts = [`已加入 ${createdCount} 个任务到 Agent 看板`]
        if (skippedCount > 0) parts.push(`${skippedCount} 个已存在跳过`)
        if (failedCount > 0) parts.push(`${failedCount} 个失败`)
        toast.success(parts.join('，'))
        // 刷新 Agent 看板（新增本地任务后可见）
        if (onRefresh) await onRefresh()
      } else if (failedCount > 0) {
        toast.error(`加入失败：${result.failed?.[0]?.reason ?? '未知原因'}`)
      } else if (skippedCount > 0) {
        toast.info(`${skippedCount} 个任务已存在于 Agent 看板，无需重复加入`)
      } else {
        toast.info('没有可加入的任务')
      }
      // 关闭对话框
      setSkillDialogTasks([])
      // 清除已选（加入成功的任务）
      setCheckedTaskIds((prev) => {
        const next = new Set(prev)
        for (const confirm of confirms) next.delete(confirm.taskId)
        return next
      })
      // 已成功创建的任务立即标记为本地已有（无需等刷新）
      if (createdCount > 0) {
        setLocalTaskIds((prev) => {
          const next = new Set(prev)
          for (const confirm of confirms) next.add(confirm.taskId)
          return next
        })
      }
    } catch (cause) {
      console.error('[TbBoard] 加入本地任务失败:', cause)
      toast.error('加入本地任务失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setSkillDialogBusy(false)
    }
  }

  /** 加入本地任务入口：先打开 Skill 勾选对话框 */
  const addToLocal = (taskIds: string[]): void => {
    openSkillDialog(taskIds)
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center bg-background p-6">
        <div className="max-w-sm text-center">
          <Bug className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="font-semibold">TB 任务加载失败</h1>
          <p className="mt-1 break-words text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadList()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />重试
          </Button>
        </div>
      </div>
    )
  }

  const total = items.length

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="titlebar-drag-region flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm">
        <div className="titlebar-no-drag flex items-center gap-2">
          <Bug className="size-5 text-foreground/70" />
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-semibold">TB 问题看板</h1>
              {isMock && (
                <span
                  className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                  title="未检测到已启用的真实 TB MCP，当前展示演示数据；配置后刷新即可连接真实企业数据"
                >
                  演示数据
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{roleView.scope === 'my-involved' ? '我参与' : '我名下'} {total} 个任务 · 点击卡片查看详情与流转</p>
          </div>
        </div>
        <div className="titlebar-no-drag flex items-center gap-2">
          <SectionTabs
            value={viewRole}
            onChange={(role) => setViewRole(role as TbViewRole)}
            options={ROLE_OPTIONS}
          />
          {multiSelectActive && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || addingTaskIds.size > 0}
              onClick={toggleSelectAll}
              className={cn(allSelectableChecked && 'bg-primary/10 text-primary')}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              {allSelectableChecked ? '取消全选' : '全选'}
            </Button>
          )}
          {checkedTaskIds.size > 0 && (
            <Button
              size="sm"
              disabled={busy || addingTaskIds.size > 0}
              onClick={() => void addToLocal([...checkedTaskIds])}
              className="bg-primary"
            >
              {addingTaskIds.size > 0 && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              加入本地任务（{checkedTaskIds.size}）
            </Button>
          )}
          <Button
            variant={multiSelectActive ? 'secondary' : 'outline'}
            size="sm"
            disabled={busy || addingTaskIds.size > 0}
            onClick={toggleMultiSelect}
            className={cn(multiSelectActive && 'bg-primary/10 text-primary')}
          >
            <ListChecks className="mr-1 h-3.5 w-3.5" />
            {multiSelectActive ? '退出多选' : '多选'}
          </Button>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadList()}>
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} />
            {loading ? '刷新中…' : '刷新'}
          </Button>
          {lastSyncAt ? (
            <span
              className="whitespace-nowrap text-[11px] text-muted-foreground"
              title={`上次同步：${new Date(lastSyncAt).toLocaleString()}`}
            >
              {now - lastSyncAt < 60_000 ? '刚刚同步' : `同步于 ${formatRelativeUpdatedAt(lastSyncAt, now)}前`}
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setSection('agent')}>返回 Agent 看板</Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(360px,1.2fr)_minmax(320px,0.8fr)]">
        <section className="min-h-0 overflow-y-auto rounded-2xl bg-card p-3 shadow-sm">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在拉取 TB 任务…
            </div>
          ) : total === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bug className="mx-auto mb-2 h-6 w-6 text-foreground/30" />
              名下暂无任务问题单
            </div>
          ) : (
            <div className="space-y-4">
              {sectionMeta(roleView).map(({ key, title, accent, hint }) => {
                const list = grouped[key]
                return (
                  <section key={key}>
                    <TbSectionHeader
                      title={title}
                      count={list.length}
                      accent={accent}
                      hint={hint}
                      open={openSections[key]}
                      onToggle={(open) => {
                        setOpenSections((prev) => ({ ...prev, [key]: open }))
                        // 已关闭区首次展开时懒加载近 3 天关闭任务
                        if (open && key === 'closed') void loadClosed()
                      }}
                    />
                    {openSections[key] && key === 'closed' && closedLoading && list.length === 0 && (
                      <div className="mt-1 flex items-center justify-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> 加载近 3 天关闭任务…
                      </div>
                    )}
                    {openSections[key] && list.length > 0 && (
                      <div className="mt-1 space-y-1.5">
                        {list.map((item) => (
                          <TbDefectItemRow
                            key={item.taskId}
                            item={item}
                            workflow={workflows.get(item.taskId)}
                            currentUserId={currentUserId}
                            selected={detail?.taskId === item.taskId}
                            showCheckbox={multiSelectActive}
                            checked={checkedTaskIds.has(item.taskId)}
                            alreadyInLocal={localTaskIds.has(item.taskId)}
                            onCheckChange={(checked) => setCheckedTaskIds((prev) => {
                              const next = new Set(prev)
                              if (checked) next.add(item.taskId)
                              else next.delete(item.taskId)
                              return next
                            })}
                            disabled={busy || addingTaskIds.size > 0}
                            addingToLocal={addingTaskIds.has(item.taskId)}
                            onClick={() => void openDetail(item)}
                            onAddToLocal={(entry) => void addToLocal([entry.taskId])}
                            onComment={() => void openDetail(item)}
                            // 仅已加入本地任务才有关联会话，可跳转；未加入不显示按钮
                            onOpenSession={localTaskIds.has(item.taskId) ? () => openLinkedSession(item) : undefined}
                          />
                        ))}
                      </div>
                    )}
                    {openSections[key] && list.length === 0 && (
                      <p className="mt-1 px-2 py-1 text-[11px] text-muted-foreground/60">暂无</p>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>

        {detail ? (
          <TbDefectDetailDrawer
            item={detail}
            workflow={workflows.get(detail.taskId)}
            transitions={transitions}
            transitionsLoading={transitionsLoading}
            detail={taskDetail}
            detailLoading={detailLoading}
            currentUserId={currentUserId}
            busy={busy}
            analysis={analysisMap[detail.taskId] ?? ''}
            onAnalysisChange={(text) => setAnalysisMap((map) => ({ ...map, [detail.taskId]: text }))}
            execution={executionMap[detail.taskId]}
            skillMatches={resolveSkillMatchesForItem(detail, workspaceSkills)}
            onClose={() => { setDetail(null); setTaskDetail(null) }}
            onComment={handleComment}
          />
        ) : (
          <aside className="hidden items-center justify-center rounded-2xl bg-card/60 p-6 text-sm text-muted-foreground lg:flex">
            选择左侧任务单查看详情与流转
          </aside>
        )}
      </div>

      {/* 加入本地任务前的 Skill 勾选：AI 识别技能预勾选，用户可手动增删 */}
      <TbSkillSelectDialog
        open={skillDialogTasks.length > 0}
        tasks={skillDialogTasks}
        onSelectedChange={changeSkillDialogSelection}
        onCancel={() => {
          setSkillDialogTasks([])
        }}
        onConfirm={() => void confirmAddToLocal()}
        busy={skillDialogBusy}
      />
    </div>
  )
}
