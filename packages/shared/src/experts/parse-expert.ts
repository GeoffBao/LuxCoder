import type { ExpertAvatar, ExpertChannelBinding, ExpertManifest } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readAvatar(value: unknown): ExpertAvatar | undefined {
  if (!isRecord(value)) return undefined
  const avatar: ExpertAvatar = {}
  const icon = readOptionalString(value.icon)
  if (icon) avatar.icon = icon
  const accent = readOptionalString(value.accent)
  if (accent) avatar.accent = accent
  return Object.keys(avatar).length > 0 ? avatar : undefined
}

function isValidChannelBinding(value: unknown): value is ExpertChannelBinding {
  if (!isRecord(value)) return false
  const channel = value.channel
  const accountId = value.accountId
  return (channel === 'feishu' || channel === 'discord') && typeof accountId === 'string' && accountId.length > 0
}

function readChannelBindings(value: unknown): ExpertChannelBinding[] {
  if (!Array.isArray(value)) return []
  return value.filter(isValidChannelBinding)
}

/** 解析 expert.json 文本为 ExpertManifest；非法 JSON 或缺少 id/label 时抛错 */
export function parseExpertJson(raw: string): ExpertManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('无效的 expert.json：JSON 解析失败')
  }

  if (!isRecord(parsed)) {
    throw new Error('无效的 expert.json：根对象必须是 object')
  }

  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('无效的 expert.json：id 必须是 string')
  }
  if (typeof parsed.label !== 'string' || parsed.label.length === 0) {
    throw new Error('无效的 expert.json：label 必须是 string')
  }

  return {
    id: parsed.id,
    label: parsed.label,
    kind: parsed.kind === 'team' ? 'team' : 'expert',
    roleLabels: readStringArray(parsed.roleLabels),
    description: readOptionalString(parsed.description),
    avatar: readAvatar(parsed.avatar),
    defaultProviderChannelId: readOptionalString(parsed.defaultProviderChannelId),
    defaultModel: readOptionalString(parsed.defaultModel),
    skillSlugs: readStringArray(parsed.skillSlugs),
    mcpIds: readStringArray(parsed.mcpIds),
    channelBindings: readChannelBindings(parsed.channelBindings),
  }
}
