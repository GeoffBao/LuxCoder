import type { ExpertAvatar, TeamMember, TeamSquad } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function readAvatar(value: unknown): ExpertAvatar | undefined {
  if (!isRecord(value)) return undefined
  const avatar: ExpertAvatar = {}
  if (typeof value.icon === 'string' && value.icon.length > 0) avatar.icon = value.icon
  if (typeof value.accent === 'string' && value.accent.length > 0) avatar.accent = value.accent
  return Object.keys(avatar).length > 0 ? avatar : undefined
}

function readMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) return []
  const members: TeamMember[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    if (typeof item.expertId !== 'string' || item.expertId.length === 0) continue
    const member: TeamMember = { expertId: item.expertId }
    if (typeof item.role === 'string' && item.role.length > 0) member.role = item.role
    members.push(member)
  }
  return members
}

/**
 * 解析 team.json 文本为 TeamSquad；非法 JSON 或缺少 id/label/leaderExpertId 时抛错。
 * 只做结构解析与基础校验（成员 role 去重、leader 不能兼任 member）；
 * 「leader/member 必须解析为专家」的存在性校验走 validateTeamSquad（需要目录上下文）。
 */
export function parseTeamJson(raw: string): TeamSquad {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('无效的 team.json：JSON 解析失败')
  }

  if (!isRecord(parsed)) {
    throw new Error('无效的 team.json：根对象必须是 object')
  }

  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('无效的 team.json：id 必须是 string')
  }
  if (typeof parsed.label !== 'string' || parsed.label.length === 0) {
    throw new Error('无效的 team.json：label 必须是 string')
  }
  if (typeof parsed.leaderExpertId !== 'string' || parsed.leaderExpertId.length === 0) {
    throw new Error('无效的 team.json：leaderExpertId 必须是 string')
  }

  const members = readMembers(parsed.members)
  // leader 兼任 member 会造成委派环路（团长派给自己），显式拦截
  if (members.some((m) => m.expertId === parsed.leaderExpertId)) {
    throw new Error('无效的 team.json：团长不能同时是团队成员')
  }

  const squad: TeamSquad = {
    id: parsed.id,
    label: parsed.label,
    kind: 'team',
    leaderExpertId: parsed.leaderExpertId,
    members,
  }

  if (typeof parsed.description === 'string' && parsed.description.length > 0) {
    squad.description = parsed.description
  }
  const avatar = readAvatar(parsed.avatar)
  if (avatar) squad.avatar = avatar
  if (typeof parsed.instructions === 'string' && parsed.instructions.length > 0) {
    squad.instructions = parsed.instructions
  }

  const skillSlugs = readStringArray(parsed.skillSlugs)
  if (skillSlugs.length > 0) squad.skillSlugs = skillSlugs
  const mcpIds = readStringArray(parsed.mcpIds)
  if (mcpIds.length > 0) squad.mcpIds = mcpIds
  if (parsed.singleAgent === true) squad.singleAgent = true

  return squad
}

export interface TeamValidationIssue {
  path: string
  message: string
}

export type TeamKindResolver = (id: string) => 'expert' | 'team' | null

/**
 * 校验团队配置的目录一致性：
 * - 团长必须存在且是专家（kind==='expert'），拦截「团长指向另一个团队」的嵌套配置
 * - 每个成员必须存在且是专家，拦截「团队里塞团队」的递归结构
 * - 成员 id 去重（同一专家不能重复入团）
 * 返回空数组 = 校验通过。
 */
export function validateTeamSquad(
  squad: TeamSquad,
  resolveKind: TeamKindResolver,
): TeamValidationIssue[] {
  const issues: TeamValidationIssue[] = []

  const leaderKind = resolveKind(squad.leaderExpertId)
  if (leaderKind === null) {
    issues.push({ path: 'leaderExpertId', message: `团长专家不存在: ${squad.leaderExpertId}` })
  } else if (leaderKind !== 'expert') {
    issues.push({ path: 'leaderExpertId', message: `团长必须是专家（不能是另一个专家团）: ${squad.leaderExpertId}` })
  }

  const seen = new Set<string>()
  for (const member of squad.members) {
    if (seen.has(member.expertId)) {
      issues.push({ path: 'members', message: `成员重复: ${member.expertId}` })
      continue
    }
    seen.add(member.expertId)
    const kind = resolveKind(member.expertId)
    if (kind === null) {
      issues.push({ path: 'members', message: `成员专家不存在: ${member.expertId}` })
    } else if (kind !== 'expert') {
      issues.push({ path: 'members', message: `成员必须是专家（不能嵌套专家团）: ${member.expertId}` })
    }
  }

  return issues
}
