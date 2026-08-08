import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILTIN_EXPERT_DEFINITIONS,
  BUILTIN_EXPERT_TEAM_DEFINITIONS,
  BUILTIN_EXPERT_TEAM_SQUADS,
  parseExpertJson,
  parseTeamJson,
} from '@myyoda/shared/experts'
import type {
  ExpertAvatar,
  ExpertDefinition,
  ExpertManifest,
  ExpertPackage,
  TeamSquad,
} from '@myyoda/shared/experts'

const EXPERT_JSON = 'expert.json'
const TEAM_JSON = 'team.json'
const IDENTITY_MD = 'IDENTITY.md'
const SOUL_MD = 'SOUL.md'
const RULES_MD = 'RULES.md'

function buildDefaultManifest(definition: ExpertDefinition): ExpertManifest {
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind ?? 'expert',
    roleLabels: definition.roleLabels ?? [],
    description: definition.description,
    avatar: definition.avatar,
    defaultProviderChannelId: definition.defaultProviderChannelId,
    defaultModel: definition.defaultModel,
    skillSlugs: [],
    mcpIds: [],
    channelBindings: [],
  }
}

function buildSeedSoulMd(label: string): string {
  return `# ${label}\n\n保持专业、清晰、可执行的协作语气。\n`
}

function buildSeedRulesMd(): string {
  return `# 操作边界\n\n- 不执行未授权的危险操作\n- 不确定时先说明假设\n`
}

function readOptionalTextFile(path: string): string {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

function loadExpertPackage(expertDir: string): ExpertPackage | null {
  try {
    const expertJsonPath = join(expertDir, EXPERT_JSON)
    if (!existsSync(expertJsonPath)) return null

    const manifest = parseExpertJson(readFileSync(expertJsonPath, 'utf-8'))
    return {
      ...manifest,
      identityMd: readOptionalTextFile(join(expertDir, IDENTITY_MD)),
      soulMd: readOptionalTextFile(join(expertDir, SOUL_MD)),
      rulesMd: readOptionalTextFile(join(expertDir, RULES_MD)),
    }
  } catch (error) {
    console.warn(`[专家] 跳过损坏的专家包 (${expertDir}):`, error)
    return null
  }
}

// ---------------------------------------------------------------------------
// 团队（team.json）读写
// ---------------------------------------------------------------------------

function loadTeamSquad(teamDir: string): TeamSquad | null {
  try {
    const teamJsonPath = join(teamDir, TEAM_JSON)
    if (!existsSync(teamJsonPath)) return null
    return parseTeamJson(readFileSync(teamJsonPath, 'utf-8'))
  } catch (error) {
    console.warn(`[专家团] 跳过损坏的 team.json (${teamDir}):`, error)
    return null
  }
}

/** 按 id 读取团队（仅读取 team.json 新结构；老 kind:'team' 人设包走 getExpert） */
export function getTeam(root: string, id: string): TeamSquad | null {
  if (id.length === 0) return null
  return loadTeamSquad(join(root, id))
}

/** 列出 root 下全部有效团队（按 id 排序） */
export function listTeams(root: string): TeamSquad[] {
  if (!existsSync(root)) return []
  const teams: TeamSquad[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const team = loadTeamSquad(join(root, entry.name))
    if (team) teams.push(team)
  }
  return teams.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * 判定 id 是「专家」还是「团队」：
 * - 目录有 team.json → 'team'（新结构）
 * - 目录有 expert.json 且 kind==='team' → 'team'（老「单 Agent 人设包」，向后兼容）
 * - 其余有效专家包 → 'expert'
 * - 无效/缺失 → null
 */
export function resolveExpertOrTeamKind(root: string, id: string): 'expert' | 'team' | null {
  if (id.length === 0) return null
  const dir = join(root, id)
  if (!existsSync(dir)) return null
  if (existsSync(join(dir, TEAM_JSON))) return 'team'
  const expert = loadExpertPackage(dir)
  if (!expert) return null
  return expert.kind === 'team' ? 'team' : 'expert'
}

export interface CreateTeamInput {
  id: string
  label: string
  description?: string
  avatar?: ExpertAvatar
  leaderExpertId: string
  instructions?: string
  members?: Array<{ expertId: string; role?: string }>
  singleAgent?: boolean
}

export interface UpdateTeamInput {
  label?: string
  description?: string
  avatar?: ExpertAvatar
  leaderExpertId?: string
  instructions?: string
  members?: Array<{ expertId: string; role?: string }>
  singleAgent?: boolean
}

/** 新建专家团（team.json）；目录已存在则抛错 */
export function createTeam(root: string, input: CreateTeamInput): TeamSquad {
  const id = input.id.trim().toLowerCase()
  const label = input.label.trim()
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error('专家团 id 须为小写 slug（字母开头，仅 a-z / 0-9 / -）')
  }
  if (!label) {
    throw new Error('专家团名称不能为空')
  }

  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }

  const teamDir = join(root, id)
  if (existsSync(teamDir)) {
    throw new Error(`专家团已存在: ${id}`)
  }

  if (!input.leaderExpertId.trim()) {
    throw new Error('专家团必须指定团长')
  }

  const squad: TeamSquad = {
    id,
    label,
    kind: 'team',
    leaderExpertId: input.leaderExpertId.trim(),
    members: (input.members ?? []).map((m) => ({
      expertId: m.expertId.trim(),
      ...(m.role?.trim() ? { role: m.role.trim() } : {}),
    })),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.avatar ? { avatar: input.avatar } : {}),
    ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
    ...(input.singleAgent ? { singleAgent: true } : {}),
  }

  mkdirSync(teamDir, { recursive: true })
  writeFileSync(join(teamDir, TEAM_JSON), `${JSON.stringify(squad, null, 2)}\n`, 'utf-8')
  writeFileSync(join(teamDir, IDENTITY_MD), `# ${label}\n\n${squad.description ?? '专家团协作'}\n`, 'utf-8')
  writeFileSync(join(teamDir, SOUL_MD), buildSeedSoulMd(label), 'utf-8')
  writeFileSync(join(teamDir, RULES_MD), buildSeedRulesMd(), 'utf-8')
  console.log(`[专家团] 已创建团队: ${id}`)

  const created = getTeam(root, id)
  if (!created) throw new Error(`专家团创建后读取失败: ${id}`)
  return created
}

/** 更新 team.json 可编辑字段（团长/成员/协调策略/描述/头像/单人模式） */
export function updateTeam(
  root: string,
  id: string,
  patch: UpdateTeamInput,
): TeamSquad {
  const existing = getTeam(root, id)
  if (!existing) {
    throw new Error(`专家团不存在: ${id}`)
  }

  const squad: TeamSquad = {
    id: existing.id,
    label: patch.label?.trim() || existing.label,
    kind: 'team',
    leaderExpertId: patch.leaderExpertId?.trim() || existing.leaderExpertId,
    members: patch.members
      ? patch.members.map((m) => ({
          expertId: m.expertId.trim(),
          ...(m.role?.trim() ? { role: m.role.trim() } : {}),
        }))
      : existing.members,
    ...(patch.description !== undefined
      ? (patch.description.trim() ? { description: patch.description.trim() } : {})
      : (existing.description ? { description: existing.description } : {})),
    ...(patch.avatar !== undefined
      ? (patch.avatar ? { avatar: patch.avatar } : {})
      : (existing.avatar ? { avatar: existing.avatar } : {})),
    ...(patch.instructions !== undefined
      ? (patch.instructions.trim() ? { instructions: patch.instructions.trim() } : {})
      : (existing.instructions ? { instructions: existing.instructions } : {})),
    ...(existing.skillSlugs?.length ? { skillSlugs: existing.skillSlugs } : {}),
    ...(existing.mcpIds?.length ? { mcpIds: existing.mcpIds } : {}),
    ...(existing.channelBindings?.length ? { channelBindings: existing.channelBindings } : {}),
    ...(patch.singleAgent !== undefined ? { singleAgent: patch.singleAgent } : (existing.singleAgent ? { singleAgent: true } : {})),
  }

  writeFileSync(join(root, id, TEAM_JSON), `${JSON.stringify(squad, null, 2)}\n`, 'utf-8')
  const updated = getTeam(root, id)
  if (!updated) throw new Error(`专家团更新后读取失败: ${id}`)
  return updated
}

// ---------------------------------------------------------------------------
// Seed 与迁移
// ---------------------------------------------------------------------------

/**
 * 内置专家团的一次性迁移：老用户目录已存在（缺 team.json）时补写新结构。
 * 只在「目录存在且没有 team.json」时写入，绝不覆盖用户已有的 team.json。
 */
function migrateLegacyBuiltinTeams(root: string): void {
  for (const squad of BUILTIN_EXPERT_TEAM_SQUADS) {
    const teamDir = join(root, squad.id)
    if (!existsSync(teamDir)) continue
    if (existsSync(join(teamDir, TEAM_JSON))) continue
    writeFileSync(join(teamDir, TEAM_JSON), `${JSON.stringify(squad, null, 2)}\n`, 'utf-8')
    console.log(`[专家团] 已迁移内置团队为 squad 结构: ${squad.id}`)
  }
}

/** 为缺失的内置专家写入种子包（已存在目录不覆盖）；老内置团队目录补写 team.json 完成迁移 */
export function seedBuiltinExperts(root: string): void {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }

  for (const definition of [...BUILTIN_EXPERT_DEFINITIONS, ...BUILTIN_EXPERT_TEAM_DEFINITIONS]) {
    const expertDir = join(root, definition.id)
    if (existsSync(expertDir)) continue

    mkdirSync(expertDir, { recursive: true })
    const manifest = buildDefaultManifest(definition)

    writeFileSync(join(expertDir, EXPERT_JSON), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    writeFileSync(
      join(expertDir, IDENTITY_MD),
      definition.identityMd ?? `# ${definition.label}\n\n${definition.identitySummary}\n`,
      'utf-8',
    )
    writeFileSync(join(expertDir, SOUL_MD), definition.soulMd ?? buildSeedSoulMd(definition.label), 'utf-8')
    writeFileSync(join(expertDir, RULES_MD), definition.rulesMd ?? buildSeedRulesMd(), 'utf-8')
    console.log(`[专家] 已种子内置${definition.kind === 'team' ? '专家团' : '专家'}: ${definition.id}`)
  }

  // 新结构：内置团队补写 team.json（新装用户目录刚创建、老用户走迁移）
  migrateLegacyBuiltinTeams(root)

  // 文案升级：已存在的「通用专家」→「通用软件专家」（不覆盖用户其它改名）
  const general = getExpert(root, 'general')
  if (general?.label === '通用专家') {
    updateExpertManifest(root, 'general', { label: '通用软件专家' })
  }
}

/** 列出 root 下全部有效专家包，损坏包跳过 */
export function listExperts(root: string): ExpertPackage[] {
  if (!existsSync(root)) return []

  const experts: ExpertPackage[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const expert = loadExpertPackage(join(root, entry.name))
    if (expert) experts.push(expert)
  }

  return experts.sort((left, right) => left.id.localeCompare(right.id))
}

const EXPERT_ID_RE = /^[a-z][a-z0-9-]*$/

export interface CreateExpertInput {
  id: string
  label: string
  identitySummary?: string
  description?: string
  avatar?: ExpertAvatar
  defaultProviderChannelId?: string
  defaultModel?: string
  skillSlugs?: string[]
}

/** 新建自定义专家包（目录已存在则抛错） */
export function createExpert(root: string, input: CreateExpertInput): ExpertPackage {
  const id = input.id.trim().toLowerCase()
  const label = input.label.trim()
  if (!EXPERT_ID_RE.test(id)) {
    throw new Error('专家 id 须为小写 slug（字母开头，仅 a-z / 0-9 / -）')
  }
  if (!label) {
    throw new Error('专家名称不能为空')
  }

  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }

  const expertDir = join(root, id)
  if (existsSync(expertDir)) {
    throw new Error(`专家已存在: ${id}`)
  }

  mkdirSync(expertDir, { recursive: true })
  const summary = input.identitySummary?.trim() || `${label} 专业协作角色`
  const manifest = buildDefaultManifest({
    id,
    label,
    identitySummary: summary,
    description: input.description,
    avatar: input.avatar,
    defaultProviderChannelId: input.defaultProviderChannelId,
    defaultModel: input.defaultModel,
  })
  if (input.skillSlugs?.length) {
    manifest.skillSlugs = input.skillSlugs
  }

  writeFileSync(join(expertDir, EXPERT_JSON), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  writeFileSync(join(expertDir, IDENTITY_MD), `# ${label}\n\n${summary}\n`, 'utf-8')
  writeFileSync(join(expertDir, SOUL_MD), buildSeedSoulMd(label), 'utf-8')
  writeFileSync(join(expertDir, RULES_MD), buildSeedRulesMd(), 'utf-8')
  console.log(`[专家] 已创建专家: ${id}`)

  const created = getExpert(root, id)
  if (!created) throw new Error(`专家创建后读取失败: ${id}`)
  return created
}

/** 按 id 读取单个专家包 */
export function getExpert(root: string, id: string): ExpertPackage | null {
  if (id.length === 0) return null
  const expertDir = join(root, id)
  if (!existsSync(expertDir)) return null
  return loadExpertPackage(expertDir)
}

export type ExpertManifestPatch = Partial<
  Pick<
    ExpertManifest,
    | 'skillSlugs'
    | 'mcpIds'
    | 'label'
    | 'description'
    | 'avatar'
    | 'defaultProviderChannelId'
    | 'defaultModel'
  >
>

/** 更新 expert.json 中的可编辑 manifest 字段 */
export function updateExpertManifest(
  root: string,
  id: string,
  patch: ExpertManifestPatch,
): ExpertPackage {
  const existing = getExpert(root, id)
  if (!existing) {
    throw new Error(`专家不存在: ${id}`)
  }

  const updated: ExpertManifest = {
    id: existing.id,
    label: patch.label ?? existing.label,
    kind: existing.kind ?? 'expert',
    roleLabels: existing.roleLabels ?? [],
    description: patch.description ?? existing.description,
    avatar: patch.avatar ?? existing.avatar,
    defaultProviderChannelId: patch.defaultProviderChannelId ?? existing.defaultProviderChannelId,
    defaultModel: patch.defaultModel ?? existing.defaultModel,
    skillSlugs: patch.skillSlugs ?? existing.skillSlugs,
    mcpIds: patch.mcpIds ?? existing.mcpIds,
    channelBindings: existing.channelBindings,
  }

  writeFileSync(join(root, id, EXPERT_JSON), `${JSON.stringify(updated, null, 2)}\n`, 'utf-8')

  return {
    ...updated,
    identityMd: existing.identityMd,
    soulMd: existing.soulMd,
    rulesMd: existing.rulesMd,
  }
}

/** 更新 IDENTITY / SOUL / RULES 文本文件 */
export function updateExpertFiles(
  root: string,
  id: string,
  files: Partial<{ identityMd: string; soulMd: string; rulesMd: string }>,
): ExpertPackage {
  const existing = getExpert(root, id)
  if (!existing) {
    throw new Error(`专家不存在: ${id}`)
  }

  const expertDir = join(root, id)
  if (files.identityMd !== undefined) {
    writeFileSync(join(expertDir, IDENTITY_MD), files.identityMd, 'utf-8')
  }
  if (files.soulMd !== undefined) {
    writeFileSync(join(expertDir, SOUL_MD), files.soulMd, 'utf-8')
  }
  if (files.rulesMd !== undefined) {
    writeFileSync(join(expertDir, RULES_MD), files.rulesMd, 'utf-8')
  }

  const updated = getExpert(root, id)
  if (!updated) {
    throw new Error(`专家读取失败: ${id}`)
  }
  return updated
}
