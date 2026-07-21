import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILTIN_EXPERT_DEFINITIONS,
  parseExpertJson,
} from '@luxagents/shared/experts'
import type { ExpertDefinition, ExpertManifest, ExpertPackage } from '@luxagents/shared/experts'

const EXPERT_JSON = 'expert.json'
const IDENTITY_MD = 'IDENTITY.md'
const SOUL_MD = 'SOUL.md'
const RULES_MD = 'RULES.md'

function buildDefaultManifest(definition: ExpertDefinition): ExpertManifest {
  return {
    id: definition.id,
    label: definition.label,
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

/** 为缺失的内置专家写入种子包（已存在目录不覆盖） */
export function seedBuiltinExperts(root: string): void {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true })
  }

  for (const definition of BUILTIN_EXPERT_DEFINITIONS) {
    const expertDir = join(root, definition.id)
    if (existsSync(expertDir)) continue

    mkdirSync(expertDir, { recursive: true })
    const manifest = buildDefaultManifest(definition)

    writeFileSync(join(expertDir, EXPERT_JSON), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
    writeFileSync(
      join(expertDir, IDENTITY_MD),
      `# ${definition.label}\n\n${definition.identitySummary}\n`,
      'utf-8',
    )
    writeFileSync(join(expertDir, SOUL_MD), buildSeedSoulMd(definition.label), 'utf-8')
    writeFileSync(join(expertDir, RULES_MD), buildSeedRulesMd(), 'utf-8')
    console.log(`[专家] 已种子内置专家: ${definition.id}`)
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

/** 按 id 读取单个专家包 */
export function getExpert(root: string, id: string): ExpertPackage | null {
  if (id.length === 0) return null
  const expertDir = join(root, id)
  if (!existsSync(expertDir)) return null
  return loadExpertPackage(expertDir)
}

/** 更新 expert.json 中的可编辑 manifest 字段 */
export function updateExpertManifest(
  root: string,
  id: string,
  patch: Partial<Pick<ExpertManifest, 'skillSlugs' | 'mcpIds' | 'label'>>,
): ExpertPackage {
  const existing = getExpert(root, id)
  if (!existing) {
    throw new Error(`专家不存在: ${id}`)
  }

  const updated: ExpertManifest = {
    id: existing.id,
    label: patch.label ?? existing.label,
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
