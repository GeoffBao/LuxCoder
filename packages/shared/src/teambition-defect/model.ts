/**
 * TB 缺陷看板共享模型
 *
 * 纯函数与类型，供 main（teambition-board-service / IPC）与 renderer
 * （TB 缺陷看板视图）复用。不依赖运行时，无 side effect。
 *
 * 关键业务规则（对齐 TB 缺陷工作流实测）：
 * - 状态机每个状态有 kind（start/unset/end）、pos（顺序位）、rejectStatusIds（合法回跳目标）
 * - 授权跟随 TB 状态级执行者集合（P1 简化：executor==当前用户 或 未认领且在参与者中）
 * - 研发视图三区：mine-actionable（我可流转）/ handed-off（已移交他人，只读跟踪）/ closed（终态）
 */

import type { TaskType } from '../tasks/task-record'

// ---------------------------------------------------------------------------
// TB 状态机
// ---------------------------------------------------------------------------

export interface TbWorkflowStatus {
  id: string
  name: string
  kind: 'start' | 'unset' | 'end'
  pos: number
  /** 合法回跳目标（rejectStatusIds 实测字段） */
  rejectStatusIds: string[]
}

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
 * 研发视图三区划分（纯函数，可单测）。
 *
 * - 终态（kind=end）→ closed
 * - executor == 当前用户 → mine-actionable（我可流转）
 * - executor 为空且当前用户在参与人 → mine-actionable（可认领）
 * - 否则 → handed-off（已移交他人，只读跟踪）
 */
export function classifyTbDefect(
  item: Pick<TbDefectItem, 'tfsId' | 'executorId' | 'involveMembers'>,
  workflow: TbWorkflow | undefined,
  currentUserId: string,
): TbSection {
  const status = findWorkflowStatus(workflow, item.tfsId)
  if (status?.kind === 'end') return 'closed'
  if (item.executorId === currentUserId) return 'mine-actionable'
  if (!item.executorId && item.involveMembers.includes(currentUserId)) return 'mine-actionable'
  return 'handed-off'
}

/**
 * 当前用户是否可对该任务执行流转（即存在合法目标且当前在我端）。
 * 返回可流转的目标状态列表；空数组 = 不可流转。
 */
export function canTransition(
  item: Pick<TbDefectItem, 'tfsId' | 'executorId' | 'involveMembers'>,
  workflow: TbWorkflow | undefined,
  currentUserId: string,
): TbWorkflowStatus[] {
  if (classifyTbDefect(item, workflow, currentUserId) !== 'mine-actionable') return []
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
  for (const skill of enabled) {
    const name = skill.name.toLowerCase()
    const slug = skill.slug.toLowerCase()
    const description = (skill.description ?? '').toLowerCase()

    // 1. 日志类 skill：有附件时优先匹配描述含「日志/log/问题单/TB/缺陷」的 skill
    if (hasLog && /日志|log|问题单|teambition|tb|缺陷|分析/.test(description)) {
      matches.push({ slug: skill.slug, name: skill.name, reason: '问题单带有日志附件，适配日志/问题单分析类 skill', kind: 'exact' })
      continue
    }
    // 2. 缺陷类 skill：类型是 bug 时匹配描述含「缺陷/bug/流转」的 skill
    if (isBug && /缺陷|bug|流转|问题单|teambition|tb/.test(description)) {
      matches.push({ slug: skill.slug, name: skill.name, reason: '缺陷类型问题单，适配缺陷流转/分析类 skill', kind: 'exact' })
      continue
    }
    // 3. 关键词兜底：skill 名出现在问题文本中
    const nameWord = name.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').trim()
    if (nameWord && haystack.toLowerCase().includes(nameWord)) {
      matches.push({ slug: skill.slug, name: skill.name, reason: `问题描述命中 skill 关键词「${skill.name}」`, kind: 'keyword' })
    }
  }
  return matches
}
