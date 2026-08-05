/**
 * SkillHub 企业市场服务（内网）
 *
 * 对接公司内网 SkillHub 服务器（http://10.115.48.254:8787），只读分发：
 * 1. GET /index.json 拉取技能清单（name/files/description/downloads/stars/display_name）
 * 2. 对清单中每项 GET /{skillName}/{file} 逐个下载文件
 * 3. 写入工作区 skills/ 并标记来源（skillhub）
 *
 * 清单格式与 OpenCode Discovery.pull 兼容：只依赖 name + files，忽略未知字段。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillHubIndex, SkillHubInstallResult, SkillHubSkill } from '@luxcoder/shared'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { getFetchFn } from './proxy-fetch'

/** SkillHub 服务器基址（可配置；无尾斜杠） */
export const SKILLHUB_BASE_URL = process.env.LUXCODER_SKILLHUB_URL ?? 'http://10.115.48.254:8787'

/**
 * 获取带代理配置的 fetch：
 * - 设置里启用代理（系统/手动）→ 走设置的代理
 * - 未启用代理 → 直连（全局 fetch）
 */
async function getSkillHubFetch(): Promise<typeof globalThis.fetch> {
  const proxyUrl = await getEffectiveProxyUrl()
  return getFetchFn(proxyUrl)
}

/** 拉取 SkillHub 技能清单 */
export async function fetchSkillHubIndex(): Promise<SkillHubSkill[]> {
  const fetchFn = await getSkillHubFetch()
  const res = await fetchFn(`${SKILLHUB_BASE_URL}/index.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`拉取 SkillHub 清单失败 (${res.status})`)
  }
  const data = (await res.json()) as SkillHubIndex
  return data.skills ?? []
}

/**
 * 从 SkillHub 安装技能到工作区 skills/ 目录。
 * 逐文件下载（Discovery.pull 第二步），写入 <skillName>/ 并标记来源 skillhub。
 */
export async function installSkillHubSkill(
  workspaceSkillsDir: string,
  skill: SkillHubSkill,
): Promise<SkillHubInstallResult> {
  const targetPath = join(workspaceSkillsDir, skill.name)
  if (existsSync(targetPath)) {
    throw new Error(`当前工作区已存在同名 Skill: ${skill.name}`)
  }

  mkdirSync(targetPath, { recursive: true })

  // 逐个下载清单中的文件
  const fetchFn = await getSkillHubFetch()
  for (const relPath of skill.files) {
    const fileUrlPath = relPath.split('/').map(encodeURIComponent).join('/')
    const url = `${SKILLHUB_BASE_URL}/${encodeURIComponent(skill.name)}/${fileUrlPath}`
    const res = await fetchFn(url)
    if (!res.ok) {
      throw new Error(`下载 SkillHub 文件失败 (${res.status}): ${skill.name}/${relPath}`)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const dest = join(targetPath, relPath)
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, bytes)
  }

  // 写入来源标记
  const sourceMeta = {
    sourceType: 'skillhub',
    hubName: 'SkillHub',
    hubUrl: SKILLHUB_BASE_URL,
    skillName: skill.name,
    importedAt: new Date().toISOString(),
    displayName: skill.displayName,
    employeeId: skill.employeeId,
  }
  writeFileSync(join(targetPath, '.source.json'), JSON.stringify(sourceMeta, null, 2), 'utf-8')

  // 读取 SKILL.md frontmatter
  const skillMdPath = join(targetPath, 'SKILL.md')
  if (!existsSync(skillMdPath)) {
    throw new Error(`SkillHub 技能缺少 SKILL.md: ${skill.name}`)
  }
  const skillMd = readFileSync(skillMdPath, 'utf-8')
  const frontmatch = skillMd.match(/^---\s*\n([\s\S]*?)\n---/)
  const getField = (key: string): string | undefined => {
    const m = frontmatch?.[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m?.[1]?.trim()
  }
  const name = getField('name') ?? skill.displayName ?? skill.name
  const version = getField('version') ?? '0.0.0'
  const slug = getField('slug') ?? skill.name

  console.log(`[SkillHub] 已安装 Skill: ${skill.name} → ${workspaceSkillsDir}`)
  return { slug, name, version }
}

/** 上报下载次数（忽略失败，不阻塞安装） */
export async function reportSkillHubDownload(skillName: string): Promise<void> {
  try {
    const fetchFn = await getSkillHubFetch()
    await fetchFn(`${SKILLHUB_BASE_URL}/api/v1/skills/${encodeURIComponent(skillName)}/stats/download`, {
      method: 'POST',
    })
  } catch (err) {
    console.warn('[SkillHub] 上报下载统计失败:', (err as Error).message)
  }
}
