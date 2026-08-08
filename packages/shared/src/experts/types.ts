export interface ExpertChannelBinding {
  channel: 'feishu' | 'discord'
  accountId: string
}

/** expert = 单角色专家；team = 专家团（真实 leader + members 编排） */
export type ExpertKind = 'expert' | 'team'

/** 卡片视觉（emoji/lucide 图标名 + 主题 accent 色 token） */
export interface ExpertAvatar {
  /** lucide 图标名（如 'Layers'）；缺省由 UI 用首字符兜底 */
  icon?: string
  /** 主题 accent 色 token（如 'primary'）；缺省 'primary' */
  accent?: string
}

export interface ExpertManifest {
  id: string
  label: string
  kind?: ExpertKind
  /** 团队角色标签（专家团卡片展示用），普通专家留空 */
  roleLabels?: string[]
  /** 一句话描述（卡片/picker 展示） */
  description?: string
  /** 卡片视觉 */
  avatar?: ExpertAvatar
  /** 专家默认 AI Provider 渠道 id（映射 Multica runtime 绑定；任务显式指定渠道时优先） */
  defaultProviderChannelId?: string
  /** 专家默认模型（任务显式指定模型时优先） */
  defaultModel?: string
  skillSlugs: string[]
  mcpIds: string[]
  channelBindings: ExpertChannelBinding[]
}

/**
 * 内置专家模板（对齐 Multica agenttmpl 字段；新建专家时的参考目录）
 * 存储：default-experts/templates/<slug>.json
 */
export interface ExpertTemplate {
  slug: string
  name: string
  description: string
  category: string
  icon: string
  accent: string
  /** 完整系统提示正文（新建时作为 IDENTITY.md 种子） */
  instructions: string
  skills: string[]
}

/** 专家团成员：一个专家 + 团队内角色说明 */
export interface TeamMember {
  expertId: string
  /** 团队内角色说明（如「架构设计」），展示与团长名册用 */
  role?: string
}

/**
 * 专家团（真实 Squad）—— team.json 结构。
 * 与老「单 Agent 人设包」（expert.json kind:'team'）不同：团长负责拆解委派，
 * 成员按 DAG 各自执行，团长汇总节点验收合并。
 */
export interface TeamSquad {
  id: string
  label: string
  kind?: 'team'
  description?: string
  avatar?: ExpertAvatar
  /** 团长 = 一个专家（必须存在且 kind==='expert'），负责编排与汇总 */
  leaderExpertId: string
  /** 团长协调策略（leader briefing 用，不是成员提示词） */
  instructions?: string
  members: TeamMember[]
  /** 兼容保留：作为团员能力汇总展示（不直接注入） */
  skillSlugs?: string[]
  mcpIds?: string[]
  channelBindings?: ExpertChannelBinding[]
  /** 单人模式：members 为空时退化为旧行为（直接注入团队人设） */
  singleAgent?: boolean
}

export interface ExpertDefinition {
  id: string
  label: string
  kind?: ExpertKind
  roleLabels?: string[]
  /** 一句话描述（卡片/picker 展示） */
  description?: string
  /** 卡片视觉 */
  avatar?: ExpertAvatar
  /** 专家默认 AI Provider 渠道 id */
  defaultProviderChannelId?: string
  /** 专家默认模型 */
  defaultModel?: string
  /** IDENTITY.md 种子一句话（team 场景仅在无 identityMd 覆盖时使用） */
  identitySummary: string
  /** 完整覆盖种子 IDENTITY/SOUL/RULES 正文；缺省时按 identitySummary/通用模板生成 */
  identityMd?: string
  soulMd?: string
  rulesMd?: string
}

export interface ExpertPackage extends ExpertManifest {
  identityMd: string
  soulMd: string
  rulesMd: string
}
