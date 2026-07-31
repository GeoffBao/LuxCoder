export interface ExpertChannelBinding {
  channel: 'feishu' | 'discord'
  accountId: string
}

/** expert = 单角色专家；team = 单 Agent 扮演的多角色协作人设（无真实多 Agent 编排） */
export type ExpertKind = 'expert' | 'team'

export interface ExpertManifest {
  id: string
  label: string
  kind?: ExpertKind
  /** 团队角色标签（专家团卡片展示用），普通专家留空 */
  roleLabels?: string[]
  skillSlugs: string[]
  mcpIds: string[]
  channelBindings: ExpertChannelBinding[]
}

export interface ExpertDefinition {
  id: string
  label: string
  kind?: ExpertKind
  roleLabels?: string[]
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
