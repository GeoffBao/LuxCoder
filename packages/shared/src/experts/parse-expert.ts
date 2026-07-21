import type { ExpertChannelBinding, ExpertManifest } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
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
    skillSlugs: readStringArray(parsed.skillSlugs),
    mcpIds: readStringArray(parsed.mcpIds),
    channelBindings: readChannelBindings(parsed.channelBindings),
  }
}
