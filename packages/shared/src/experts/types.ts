export interface ExpertChannelBinding {
  channel: 'feishu' | 'discord'
  accountId: string
}

export interface ExpertManifest {
  id: string
  label: string
  skillSlugs: string[]
  mcpIds: string[]
  channelBindings: ExpertChannelBinding[]
}

export interface ExpertDefinition {
  id: string
  label: string
  /** IDENTITY.md 种子一句话 */
  identitySummary: string
}

export interface ExpertPackage extends ExpertManifest {
  identityMd: string
  soulMd: string
  rulesMd: string
}
