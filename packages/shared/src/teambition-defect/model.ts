/**
 * TB 缺陷看板共享模型
 *
 * 纯函数与类型，供 main（teambition-board-service / IPC）与 renderer
 * （TB 缺陷看板视图）复用。不依赖运行时，无 side effect。
 *
 * 关键业务规则（对齐 TB 缺陷工作流实测）：
 * - 状态机每个状态有 kind（start/unset/end）、pos（顺序位）、rejectStatusIds（合法回跳目标）
 * - 研发视图三区按「状态阶段」划分（不按 executor，因数据源=我执行未关闭，executor 恒为我）：
 *   dev（研发责任段，待我处理）/ waiting（等待他人：审核·测试·SE）/ closed（终态）
 */

import type { TaskType } from '../tasks/task-record'

// ---------------------------------------------------------------------------
// TB 状态机
// ---------------------------------------------------------------------------

/** 状态归属阶段：dev=研发责任段 / waiting=等待他人段 / closed=终态 */
export type TbStatusStage = 'dev' | 'waiting' | 'closed'

export interface TbWorkflowStatus {
  id: string
  name: string
  kind: 'start' | 'unset' | 'end'
  pos: number
  /** 合法回跳目标（rejectStatusIds 实测字段） */
  rejectStatusIds: string[]
  /** 状态阶段归属（三区分类依据；可由 inferStatusStage 推导或显式指定） */
  stage: TbStatusStage
}

/**
 * 状态阶段归属（三区分类依据）。
 * 规则来源：对齐 Teambition 问题单管理规范（teambition-issue-management.md v1.0）：
 * 标准流转 New → In Progress → Resolved → Review → [To Be Integrated/Completed]
 * - 开发执行段（责任人=开发执行人，我可流转）→ dev（待我处理）
 * - 他人处理段（责任人=测试/评审/集成，需他人流转）→ waiting（待他人处理）
 * - 终态 → closed（已关闭）
 * 实现：显式状态名精确匹配（大小写不敏感），避免关键词 includes 误判（如 Assign 是开发段却含 assign 关键词）。
 */
const DEV_STAGE_STATUSES = new Set([
  // 文档：开发执行人责任段（我可流转）
  'new', 'assign', 'in progress', 'open', 'reopen', '待处理', '进行中', '处理中', '正在处理',
  'clarified', 'great', 'changed',
])

/** 他人处理段（测试/评审/集成/等待信息/驳回等，责任人非我，需他人流转下一状态） */
const WAITING_STAGE_STATUSES = new Set([
  // 文档：Resolved 后必须经 Review；Review → To Be Integrated / Won't Fix / Invalid
  'review', 'resolved', 'fixed', 'done', 'completed', 'to be integrated',
  // 文档：Wait For Info（等更多信息）、自动指派前阶段
  'wait for info', 'pending', 'commited', 'nextspinfix', '待审核', '待测试', '待验证', '等待',
  '已提交', '已修', '已解决', '已完成', 'reject', 'invalid', 'duplicate', 'wontfix', 'worksforme',
  'not an issue', 'delayed clone', 'need clone', 'low value fix', 'postponed',
])

export function inferStatusStage(name: string, kind: 'start' | 'unset' | 'end'): TbStatusStage {
  if (kind === 'end') return 'closed'
  const lower = name.trim().toLowerCase()
  if (DEV_STAGE_STATUSES.has(lower)) return 'dev'
  if (WAITING_STAGE_STATUSES.has(lower)) return 'waiting'
  // 未知状态兜底：非终态默认 dev（研发优先展示），避免误藏任务
  return 'dev'
}

// ---------------------------------------------------------------------------
// 角色视图（按「当前状态的处理人是否可流转」分类）
// ---------------------------------------------------------------------------

/** 看板视图角色：研发 / 测试（后续可扩展 SPM 等） */
export type TbViewRole = 'developer' | 'tester'

/** 角色数据范围 */
export type TbRoleScope = 'my-executed' | 'my-involved'

/**
 * 角色视图配置：决定「该角色待我处理的是哪些状态」以及三区标题。
 * 依据 Teambition 问题单管理规范（teambition-issue-management.md v1.0）各流转段责任人：
 * - 研发：开发执行人责任段（New→In Progress→Resolved 前段）
 * - 测试：评审/验证责任段（Resolved→Review→To Be Integrated）
 */
export interface TbRoleView {
  /** 该角色「待我处理/我可流转」的状态名集合（精确匹配，小写） */
  actionableStatuses: ReadonlySet<string>
  /** 数据范围：my-executed 我执行 / my-involved 我参与 */
  scope: TbRoleScope
  /** 三区标题（随角色变） */
  sectionTitles: { mine: string; handedOff: string; closed: string }
}

/** 测试角色「待我验证」的状态集（评审/验证段，责任人=测试） */
const TESTER_ACTIONABLE_STATUSES = new Set([
  'review', 'resolved', 'fixed', 'done', 'completed', 'to be integrated',
  '待测试', '待验证', '待审核', 'commited', 'nextspinfix', 'pending', 'wait for info',
  'reject', 'invalid', 'duplicate', 'wontfix', 'worksforme', 'not an issue',
  '已提交', '已修', '已解决', '已完成', 'low value fix', 'postponed',
])

/** 角色视图配置表（渲染层直接消费） */
export const TB_ROLE_VIEWS: Record<TbViewRole, TbRoleView> = {
  developer: {
    actionableStatuses: DEV_STAGE_STATUSES,
    scope: 'my-executed',
    sectionTitles: { mine: '待我处理', handedOff: '待他人处理', closed: '已关闭' },
  },
  tester: {
    actionableStatuses: TESTER_ACTIONABLE_STATUSES,
    scope: 'my-involved',
    sectionTitles: { mine: '待我验证', handedOff: '待开发处理', closed: '已关闭' },
  },
}

/** 统一的 TB 问题分析 skill（分析 + 流转双模式；TB 看板加入本地任务的必选技能） */
export const TB_CONNECT_SKILL_SLUG = 'connect-tb-workflow'

export interface TbWorkflow {
  /** 工作流 ID（taskflowId） */
  taskflowId: string
  statuses: TbWorkflowStatus[]
}

// ---------------------------------------------------------------------------
// TB 缺陷任务视图模型
// ---------------------------------------------------------------------------

export interface TbStatusTransition {
  fromName: string
  toName: string
  /** 流转说明（tfsUpdateNote） */
  note?: string
  /** 时间戳 */
  at: number
  /** 操作人 userId */
  by?: string
}

export interface TbDefectItem {
  taskId: string
  uniqueId?: number
  content: string
  projectId: string
  /** 项目名（由 QueryProjectsV3 批量映射；可能缺失） */
  projectName?: string
  /** 当前状态 ID */
  tfsId: string
  /** 当前状态名（由状态机映射，可能为 undefined 若映射失败） */
  tfsName?: string
  executorId?: string
  involveMembers: string[]
  priority?: number
  progress?: number
  dueDate?: string
  startDate?: string
  accomplishTime?: string
  /** 类型名（缺陷）；预留多类型扩展 */
  type?: TaskType
  transitions?: TbStatusTransition[]
}

export type TbSection = 'mine-actionable' | 'handed-off' | 'closed'

// ---------------------------------------------------------------------------
// TB 任务详情与信息完整性检测（P1.5 新增）
// ---------------------------------------------------------------------------

/** TB 任务附件（日志文件等） */
export interface TbTaskAttachment {
  /** 资源 ID（work:{workId} / 文件字段 resourceId）；可能缺失（仅文件名） */
  resourceId?: string
  name: string
  /** 文件大小（字节，可能缺失） */
  size?: number
}

/** TB 任务详情：基础信息 + 附件 + 自定义字段摘要 */
export interface TbTaskDetail {
  taskId: string
  uniqueId?: number
  content: string
  projectId: string
  /** 当前状态名（已由状态机映射） */
  tfsName?: string
  /** 任务备注/描述全文（note 字段） */
  note?: string
  /** 问题描述（customfields 中 rtf/note 类型字段） */
  description?: string
  /** 附件列表（customfields 中 work 类型字段） */
  attachments: TbTaskAttachment[]
  /** 自定义字段摘要：字段名 → 展示值（供 UI 展示基础信息） */
  fields: Array<{ name: string; value: string }>
  executorId?: string
  involveMembers: string[]
  priority?: number
  progress?: number
  dueDate?: string
  startDate?: string
  created?: string
}

/** 信息完整性检查项 */
export interface TbCompletenessItem {
  key: 'log' | 'steps' | 'time' | 'probability' | 'description'
  label: string
  /** 是否已满足 */
  ok: boolean
  /** 提示文案（ok=false 时的建议） */
  hint: string
}

export interface TbCompletenessResult {
  /** 全部满足 */
  complete: boolean
  /** 满足项数 / 总项数 */
  satisfied: number
  total: number
  items: TbCompletenessItem[]
}

const PROBABILITY_KEYWORDS = ['概率', '复现概率', '出现概率', '频率', '复现率', '触发概率', '频次']
const STEPS_KEYWORDS = ['步骤', '复现步骤', '操作步骤', '路径', '流程', '前置条件']
const TIME_KEYWORDS = ['时间', '发生时间', '出现时间', '时间段', '何时', '上午', '下午', '晚上', '凌晨', '时分']

/**
 * 分析 TB 任务信息的完整性（纯函数，可单测）。
 * 检测问题单信息是否完善，为 AI 分析提供基础：
 * - 日志附件（attachments 或 fields 中带附件/日志）
 * - 问题步骤明确（描述/备注含步骤类关键词）
 * - 问题时间标注（描述/字段含时间关键词）
 * - 问题概率备注（字段/描述含概率关键词）
 * - 问题描述（note/description 非空）
 */
export function analyzeTaskCompleteness(detail: Pick<TbTaskDetail, 'note' | 'description' | 'attachments' | 'fields'>): TbCompletenessResult {
  const text = [detail.note, detail.description]
    .filter((value): value is string => Boolean(value))
    .join('\n')
  const fieldNames = detail.fields.map((field) => field.name).join(' ')
  const fieldValues = detail.fields.map((field) => field.value).join(' ')
  const haystack = `${text}\n${fieldNames}\n${fieldValues}`

  const hasLog = detail.attachments.length > 0 || fieldNames.includes('日志') || fieldNames.includes('log')
  const hasSteps = STEPS_KEYWORDS.some((keyword) => haystack.includes(keyword))
  const hasTime = TIME_KEYWORDS.some((keyword) => haystack.includes(keyword))
  const hasProbability = PROBABILITY_KEYWORDS.some((keyword) => haystack.includes(keyword))
  const hasDescription = Boolean(text.trim())

  const items: TbCompletenessItem[] = [
    {
      key: 'log',
      label: '日志/附件',
      ok: hasLog,
      hint: hasLog ? '已提供日志或附件' : '缺少日志或附件，建议补充诊断日志',
    },
    {
      key: 'steps',
      label: '复现步骤',
      ok: hasSteps,
      hint: hasSteps ? '问题步骤描述明确' : '缺少复现步骤，建议补充操作步骤/前置条件',
    },
    {
      key: 'time',
      label: '时间标注',
      ok: hasTime,
      hint: hasTime ? '已标注问题时间' : '缺少时间标注，建议补充发生时间/时间段',
    },
    {
      key: 'probability',
      label: '问题概率',
      ok: hasProbability,
      hint: hasProbability ? '已备注问题概率' : '缺少问题概率备注，建议补充复现概率/频率',
    },
    {
      key: 'description',
      label: '问题描述',
      ok: hasDescription,
      hint: hasDescription ? '问题描述完整' : '缺少问题描述，建议补充问题现象与影响',
    },
  ]

  const satisfied = items.filter((item) => item.ok).length
  return {
    complete: satisfied === items.length,
    satisfied,
    total: items.length,
    items,
  }
}

// ---------------------------------------------------------------------------
// 状态机推导
// ---------------------------------------------------------------------------

/** 按状态 ID 查状态；不存在返回 undefined。 */
export function findWorkflowStatus(workflow: TbWorkflow | undefined, tfsId: string): TbWorkflowStatus | undefined {
  return workflow?.statuses.find((status) => status.id === tfsId)
}

/** 按状态名查状态（小写不敏感）。 */
export function findWorkflowStatusByName(workflow: TbWorkflow | undefined, name: string): TbWorkflowStatus | undefined {
  const target = name.trim().toLowerCase()
  return workflow?.statuses.find((status) => status.name.toLowerCase() === target)
}

/**
 * 推导当前状态下可流转的合法目标状态集合。
 *
 * 规则（零硬编码，全部来自状态机数据）：
 * - 正向推进：pos 大于当前状态 pos 且非 end 的状态（继续推进）
 * - 终态关闭：pos 大于当前 pos 且 end 的状态（Close / Postpone 等）
 * - 回跳/驳回：当前状态的 rejectStatusIds 中的状态
 * - 排除当前状态自身
 * 返回按 pos 排序（回跳项按其在 rejectStatusIds 中的顺序前置，便于用户感知"驳回"语义）。
 */
export function deriveLegalTargets(
  workflow: TbWorkflow | undefined,
  currentTfsId: string,
): TbWorkflowStatus[] {
  if (!workflow) return []
  const current = findWorkflowStatus(workflow, currentTfsId)
  if (!current) return []
  // 终态不再流转：Close/Postpone 等 end 状态是终点，不存在下一步（避免把其他 end 当目标）
  if (current.kind === 'end') return []

  const forward: TbWorkflowStatus[] = []
  const ends: TbWorkflowStatus[] = []
  const rejects: TbWorkflowStatus[] = []

  for (const status of workflow.statuses) {
    if (status.id === currentTfsId) continue
    if (current.rejectStatusIds.includes(status.id)) {
      rejects.push(status)
      continue
    }
    if (status.pos > current.pos) {
      if (status.kind === 'end') ends.push(status)
      else forward.push(status)
    }
  }

  const sortByPos = (list: TbWorkflowStatus[]): TbWorkflowStatus[] =>
    [...list].sort((a, b) => a.pos - b.pos)

  return [...sortByPos(rejects), ...sortByPos(forward), ...sortByPos(ends)]
}

// ---------------------------------------------------------------------------
// 三区划分与授权
// ---------------------------------------------------------------------------

/**
 * 按角色视图三区划分（纯函数，可单测）。
 *
 * 语义：当前状态是否属于「该角色可流转」→ mine-actionable；否则 handed-off；终态 → closed。
 * - closed：stage=closed（终态）
 * - mine-actionable：当前状态名命中 roleView.actionableStatuses
 * - 其余非终态 → handed-off
 *
 * 兼容：状态机缺失时按 executor 兜底（未认领且我在参与人可认领）。
 */
export function classifyTbDefect(
  item: Pick<TbDefectItem, 'tfsId' | 'executorId' | 'involveMembers'>,
  workflow: TbWorkflow | undefined,
  roleView: TbRoleView,
  currentUserId: string,
): TbSection {
  const status = findWorkflowStatus(workflow, item.tfsId)
  if (status) {
    const stage = status.stage ?? (status.kind === 'end' ? 'closed' : undefined)
    if (stage === 'closed') return 'closed'
    if (roleView.actionableStatuses.has(status.name.trim().toLowerCase())) return 'mine-actionable'
    return 'handed-off'
  }
  // 兜底：状态机缺失时按 executor（历史语义）
  if (item.executorId === currentUserId) return 'mine-actionable'
  if (!item.executorId && item.involveMembers.includes(currentUserId)) return 'mine-actionable'
  return 'handed-off'
}

/**
 * 当前用户是否可对该任务执行流转（即存在合法目标且当前在该角色待处理端）。
 * 返回可流转的目标状态列表；空数组 = 不可流转。
 */
export function canTransition(
  item: Pick<TbDefectItem, 'tfsId' | 'executorId' | 'involveMembers'>,
  workflow: TbWorkflow | undefined,
  roleView: TbRoleView,
  currentUserId: string,
): TbWorkflowStatus[] {
  if (classifyTbDefect(item, workflow, roleView, currentUserId) !== 'mine-actionable') return []
  return deriveLegalTargets(workflow, item.tfsId)
}

/** 是否应标红置顶（Reopen 被打回）：当前状态名为 Reopen，或最近一条流转到 Reopen。 */
export function isTbDefectReopened(
  item: Pick<TbDefectItem, 'tfsName' | 'transitions'>,
  workflow: TbWorkflow | undefined,
): boolean {
  if (findWorkflowStatusByName(workflow, 'reopen')?.id && item.tfsName?.toLowerCase() === 'reopen') return true
  const last = item.transitions?.at(-1)
  return Boolean(last && last.toName.toLowerCase() === 'reopen')
}

/** Reopen 判定需要的是状态名；缺 workflow 时仅按状态名/历史兜底。 */
export function isTbDefectOverdue(item: Pick<TbDefectItem, 'dueDate' | 'tfsId'>, workflow: TbWorkflow | undefined, now: number): boolean {
  if (!item.dueDate) return false
  const status = findWorkflowStatus(workflow, item.tfsId)
  if (status?.kind === 'end') return false
  return Date.parse(item.dueDate) < now
}

// ---------------------------------------------------------------------------
// Skill 适配判断（P1.7 新增）
// ---------------------------------------------------------------------------

/** Skill 适配条目 */
export interface TbSkillMatch {
  slug: string
  name: string
  /** 匹配理由（为什么这个 skill 适配当前问题） */
  reason: string
  /** 匹配强度：exact / keyword */
  kind: 'exact' | 'keyword'
}

/** Skill 适配输入（宽松：详情部分字段，无需完整 TbTaskDetail） */
export interface TbSkillMatchInput {
  content?: string
  note?: string
  description?: string
  attachments?: TbTaskAttachment[]
  type?: TaskType
  fields?: Array<{ name: string; value: string }>
}

/**
 * 判断当前问题单是否有可用的 Skill 适配。
 *
 * 规则（纯函数，可单测）：
 * - 已启用 skill 的 name/slug/description 与问题特征匹配
 * - 问题特征来源：附件（日志 → log 类 skill）、描述关键词、类型（bug → 缺陷类 skill）
 * - 无匹配返回空数组（UI 显示「暂无 skill 适配」）
 */
export function resolveSkillMatches(
  detail: TbSkillMatchInput,
  skills: Array<{ slug: string; name: string; description?: string; enabled: boolean }>,
): TbSkillMatch[] {
  const enabled = skills.filter((skill) => skill.enabled !== false)
  if (enabled.length === 0) return []

  const text = [detail.content, detail.note, detail.description]
    .filter((value): value is string => Boolean(value))
    .join('\n')
  const fieldValues = (detail.fields ?? []).map((field) => field.value).join(' ')
  const haystack = `${text}\n${fieldValues}`
  const hasLog = (detail.attachments ?? []).length > 0
  const isBug = detail.type === 'bug'

  const matches: TbSkillMatch[] = []
  const seen = new Set<string>()
  for (const skill of enabled) {
    const name = skill.name.toLowerCase()
    const slug = skill.slug.toLowerCase()
    const description = (skill.description ?? '').toLowerCase()
    // 每个 skill 的综合证据文本（名称+描述），用于「问题内容命中」判断；
    // 不把宽泛词（缺陷/bug/TB/问题单）作为触发词，避免误配大量 skill。
    const skillEvidence = `${name} ${description}`
    const hitKeywords: string[] = []
    let kind: TbSkillMatch['kind'] | undefined
    let reason = ''

    // 1. 日志/附件类：问题带日志附件，且 skill 明确专注「日志/信令/抓包」分析
    //    （要求强信号：slug/名含 log/trace/signal/抓包/信令，或描述含「下载日志/日志分析/抓包/信令」等复合动作词；
    //    不能只靠描述含通用词「日志/bug/崩溃」，否则会误配 systematic-debugging 等调试类 skill）
    if (hasLog) {
      const nameSlug = `${name} ${slug}`
      const logStrongSignal = /(^|[\s_-])(log|trace|signal|pcap|抓包|信令)/.test(nameSlug)
        || /下载日志|日志分析|抓包|信令分析|logcat|串口日志/.test(skillEvidence)
      if (logStrongSignal) {
        hitKeywords.push('log')
        kind = 'exact'
        reason = '问题单带有日志附件，适配日志/信令分析类 skill'
      }
    }

    // 2. 问题内容关键词命中 skill 特征词（精确匹配，避免误配）
    if (!kind && haystack.trim()) {
      // 从 skill 名/描述提取「特征词」：优先长词/专业词，避免命中通用词
      const featureWords = extractSkillFeatureWords(skill.name, skill.description ?? '')
      const matchedFeature = featureWords.find((word) => word.length >= 2 && haystack.toLowerCase().includes(word.toLowerCase()))
      if (matchedFeature) {
        hitKeywords.push(matchedFeature)
        kind = 'keyword'
        reason = `问题内容命中 skill 特征词「${matchedFeature}」`
      }
    }

    // 3. 缺陷类型 + skill 明确专注缺陷（名称含 tb/缺陷/bug 且描述专注缺陷流转/分析/编排）
    if (!kind && isBug) {
      const bugFocused = /(^|[\s_-])(bug|tb)|缺陷/.test(skill.name)
        && /缺陷|流转|编排|分析|定位|根因|修复|排查|认领|关闭/.test(description)
      if (bugFocused) {
        hitKeywords.push('bug')
        kind = 'exact'
        reason = '缺陷类型问题单，适配缺陷流转/分析类 skill'
      }
    }

    if (kind && !seen.has(slug)) {
      seen.add(slug)
      matches.push({ slug: skill.slug, name: skill.name, reason, kind })
    }
  }
  return matches
}

/** 提取 skill 名/描述中的特征词（去除停用词，保留专业词/中文词/长英文词） */
function extractSkillFeatureWords(name: string, description: string): string[] {
  const combined = `${name} ${description}`
  const words = combined.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? []
  const stopwords = new Set([
    'skill', 'skills', 'the', 'and', 'for', 'with', 'from', 'this', 'that', '使用', '进行',
    '帮助', '提供', '用于', '支持', '相关', '问题', '任务', '分析', '处理', '工作', '流程',
    'teambition', 'tb', '系统', '场景', '调用', '接入', '工具', '能力',
  ])
  return words.filter((word) => !stopwords.has(word.toLowerCase()) && word.length >= 2)
}

/**
 * 把 AI 预分析结果整理为「书面四段式」回传评论草稿。
 * 顺序固定：结论先行 → 证据日志 → 下一步动作 → 修复建议。
 * - 若原文已含四段标题（结论/证据日志/下一步/修复），直接按原文返回；
 * - 否则生成四段骨架，把原文内容放进「结论」，其余段落标注待补充/见报告。
 */
export function buildTbCommentDraft(analysis: string): string {
  const text = (analysis ?? '').trim()
  if (!text) {
    return [
      '## 🔍 结论',
      '',
      '**待补充**（尚未执行 AI 分析，或分析结果为空）',
      '',
      '## 📎 证据日志',
      '',
      '```',
      '无',
      '```',
      '',
      '## ➡️ 下一步动作',
      '',
      '| 优先级 | 动作 | 责任方 |',
      '|--------|------|--------|',
      '| P0 | 待补充 | 待补充 |',
      '',
      '## 🛠 修复建议',
      '',
      '**短期**：待补充',
      '**长期**：待补充',
      '**验证**：待补充',
    ].join('\n')
  }

  // 已含四段标题 → 直接返回原文（Agent 分析时已按模板输出）
  const hasConclusion = /结论|核心结论/.test(text)
  const hasEvidence = /证据|日志/.test(text)
  const hasNext = /下一步|动作/.test(text)
  const hasFix = /修复建议|修复|建议/.test(text)
  if (hasConclusion && hasEvidence && hasNext && hasFix) {
    return text
  }

  // 未按四段式输出 → 组织为四段骨架，原文放「结论」，其余标注
  return [
    '## 🔍 结论',
    '',
    text,
    '',
    '## 📎 证据日志',
    '',
    '```',
    '待补充（详见详细分析报告）',
    '```',
    '',
    '## ➡️ 下一步动作',
    '',
    '| 优先级 | 动作 | 责任方 |',
    '|--------|------|--------|',
    '| P0 | 待补充 | 待补充 |',
    '',
    '## 🛠 修复建议',
    '',
    '**短期**：待补充',
    '**长期**：待补充',
    '**验证**：待补充',
  ].join('\n')
}

/**
 * 从会话 SDK 消息中提取「分析结论文本」。
 * 不能机械取最后一条 assistant——TaskRunner 执行完成后会追加验收消息
 * （“验证最终结果与任务标准”表格），它不是分析结论。
 * 因此从后往前找**最后一条含分析结论特征**的 assistant 文本：
 * 命中「结论先行 / 根因 / 证据 / 下一步动作 / 修复建议 / 分析结论」等标记即视为分析结论。
 * 兼容 SDKMessage.message 为 string（部分消息类型）或 { content: [...] } 两种形态。
 */
export function extractAnalysisText(messages: Array<{ type?: string; message?: unknown }>): string {
  const analysisMarkers = /结论先行|分析结论|根因|证据日志|下一步动作|修复建议|🔍|📎|➡️|🛠/
  const assistantText = (msg: { type?: string; message?: unknown }): string => {
    if (msg?.type !== 'assistant') return ''
    const raw = msg.message
    if (typeof raw === 'string') return raw.trim()
    if (raw && typeof raw === 'object') {
      const content = (raw as { content?: Array<{ type?: string; text?: string }> }).content
      if (Array.isArray(content)) {
        return content
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim()
      }
    }
    return ''
  }
  // 第一遍：找最后一条含分析结论特征的 assistant 文本
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = assistantText(messages[i]!)
    if (text && analysisMarkers.test(text)) return text
  }
  // 兜底：没有明显分析标记时取最后一条非空 assistant 文本
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = assistantText(messages[i]!)
    if (text) return text
  }
  return ''
}

/**
 * 从分析报告（markdown）中提取「四段式」内容用于 AI 分析预览。
 * 报告文件是权威源（AI 会话总结可能被验收回复污染/格式不定），
 * 因此优先从报告提取：
 * - 结论：报告标题 + 元数据中的问题编号；若报告含「根因」段落则取根因要点
 * - 根因：
 * - 证据日志：
 * - 下一步动作：
 * - 修复建议：
 * 兼容 qxdm_sim_analysis_report.md 与 connect-tb-workflow 的 HTML/通用报告标题风格。
 */
export function extractReportSections(report: string): {
  conclusion: string
  rootCause: string
  evidence: string
  nextSteps: string
  fixSuggestions: string
} {
  // 兼容 HTML 报告：<h1>/<h2> 标题转 markdown，正文标签剥离
  let text = (report ?? '').replace(/\r\n/g, '\n')
  if (/<h[12]/i.test(text)) {
    text = text
      .replace(/<h1[^>]*>([^<]*)<\/h1>/gi, (_m, t: string) => `\n# ${t.trim()}\n`)
      .replace(/<h2[^>]*>([^<]*)<\/h2>/gi, (_m, t: string) => `\n## ${t.trim()}\n`)
      .replace(/<h3[^>]*>([^<]*)<\/h3>/gi, (_m, t: string) => `\n### ${t.trim()}\n`)
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/pre>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
  }
  const sections: Record<string, string> = {}
  // 按 markdown 标题（## / ###）切段，标题名做归一化后归档
  const lines = text.split('\n')
  let currentHeading = ''
  const headingBuf: string[] = []
  const flush = (): void => {
    if (!currentHeading) return
    const key = normalizeReportHeading(currentHeading)
    if (key && !sections[key]) sections[key] = headingBuf.join('\n').trim()
    headingBuf.length = 0
  }
  for (const line of lines) {
    const m = line.match(/^#{1,4}\s+(.+)$/)
    if (m) {
      flush()
      currentHeading = m[1]!.trim()
    } else {
      headingBuf.push(line)
    }
  }
  flush()

  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      if (sections[key]) return sections[key]!
    }
    return ''
  }

  // 结论：四段式报告优先取「结论」段全文（一句话核心判定）；老报告（无结论段）回退从根因段提取
  const explicitConclusion = pick('结论', '核心结论', '分析结论')
  const rootCause = pick('根因', '根因定位', '现象与解读')
  const evidence = pick('证据摘要', '证据日志', '关键证据', '证据')
  const nextSteps = pick('下一步动作', '建议下一步', '下一步', '后续动作')
  const fixSuggestions = pick('修复建议', '解决建议', '建议修复')

  let conclusion = explicitConclusion
  if (conclusion) {
    // 清理：去掉加粗/列表标记，保留核心判定文字
    conclusion = conclusion
      .replace(/\*\*/g, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/[。；;\s]+$/, '')
      .trim()
    conclusion = `**结论**：${conclusion}`
  } else {
    // 老报告回退：从根因段提取「根因定位/根因：」后的核心一句话
    const rootCauseCore =
      rootCause.match(/根因(?:定位)?\s*[:：]?\s*([^\n]*ATR[^\n]*)/) ??
      rootCause.match(/根因(?:定位)?\s*[:：]?\s*([^\n]{5,160})/)
    let conclusionLine = rootCauseCore?.[1]?.trim() ?? ''
    conclusionLine = conclusionLine
      .replace(/\*\*/g, '')
      .replace(/^[（(]?[^）)]*[）)]\s*[:：]?\s*/, '')
      .replace(/[。；;\s]+$/, '')
    if (/落在[:：]?$|可能(?:是|为)?$|推测[:：]?$/.test(conclusionLine)) {
      const suspect = rootCause.match(/\*\*([^\n*]*(?:嫌疑|可能|疑似)[^\n*]{2,60})\*\*/)
      if (suspect?.[1]) conclusionLine = `${conclusionLine} ${suspect[1].replace(/\*\*/g, '')}`
    }
    if (!conclusionLine) {
      const bold = rootCause.match(/\*\*([^\n*]{5,160})\*\*/)
      conclusionLine = bold?.[1]?.trim() ?? ''
    }
    conclusion = conclusionLine ? `**结论**：${conclusionLine}` : ''
  }

  return {
    conclusion,
    rootCause: rootCause.slice(0, 500),
    evidence: evidence.slice(0, 800),
    nextSteps: nextSteps.slice(0, 500),
    fixSuggestions: fixSuggestions.slice(0, 500),
  }
}

/** 报告标题归一化：去序号、去 emoji，匹配常见标题写法 */
function normalizeReportHeading(heading: string): string {
  const h = heading.replace(/^\d+\.\s*/, '').replace(/^#{1,4}\s*/, '').replace(/[🔴🟠🟡🔵📌✅➡️🛠📎🔬🔍]/g, '').trim()
  // 结论单独优先（避免「结论」误入根因分支）
  if (/^(核心结论|结论|分析结论)$/.test(h)) return '结论'
  if (/(根因|核心结论|现象与解读|分析结论)/.test(h)) return '根因'
  if (/(证据摘要|证据日志|关键证据|证据)/.test(h)) return '证据'
  if (/(下一步动作|建议下一步|下一步|后续动作)/.test(h)) return '下一步'
  if (/(修复建议|解决建议|建议修复)/.test(h)) return '修复'
  if (/(元数据)/.test(h)) return '元数据'
  return ''
}

/** 把分析报告四段式组织成书面评论草稿（结论先行/根因/证据日志/下一步动作/修复建议） */
export function buildReportCommentDraft(report: string): string {
  const s = extractReportSections(report)
  const block = (title: string, body: string, fallback = '待补充'): string =>
    `## ${title}\n\n${body.trim() || fallback}`
  return [
    block('🔍 结论', s.conclusion),
    '',
    block('🔬 根因', s.rootCause),
    '',
    block('📎 证据日志', s.evidence),
    '',
    block('➡️ 下一步动作', s.nextSteps),
    '',
    block('🛠 修复建议', s.fixSuggestions),
  ].join('\n')
}
