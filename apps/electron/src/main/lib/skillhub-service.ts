/**
 * SkillHub 企业市场服务（内网）
 *
 * 对接公司内网 SkillHub 服务器（http://10.115.48.254:8787），只读分发：
 * 1. GET /index.json 拉取技能清单（name/files/description/downloads/stars/display_name）
 * 2. 对清单中每项 GET /{skillName}/{file} 逐个下载文件
 * 3. 写入工作区 skills/ 并标记来源（skillhub）
 *
 * 清单格式与 OpenCode Discovery.pull 兼容：只依赖 name + files，忽略未知字段。
 * 安全约束：技能名/文件路径必须通过服务端契约校验（防路径穿越）；安装失败自动清理残留。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillHubIndex, SkillHubInstallResult, SkillHubSkill } from '@yoda/shared'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { getFetchFn } from './proxy-fetch'

/** SkillHub 服务器基址（可配置；无尾斜杠） */
export const SKILLHUB_BASE_URL = process.env.YODA_SKILLHUB_URL ?? 'http://10.115.48.254:8787'

/** 技能名服务端契约（OpenAPI：^[a-z0-9][a-z0-9-]{0,127}$） */
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/

/** 下载超时（毫秒）；内网抖动容忍，避免无限挂起 */
const FETCH_TIMEOUT_MS = 15_000

/** 判断是否内网/私网地址（应直连，不经过企业代理） */
function isPrivateNetworkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  } catch {
    return true
  }
}

/** 校验技能名与文件相对路径，防止路径穿越/逃逸 skills 目录 */
function assertSafeSkillPath(skillName: string, relPath?: string): void {
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    throw new Error(`非法的 Skill 名称: ${skillName}`)
  }
  if (relPath === undefined) return
  if (relPath.includes('\\') || relPath.startsWith('/') || /^[a-zA-Z]:/.test(relPath)) {
    throw new Error(`非法的 Skill 文件路径: ${relPath}`)
  }
  const segments = relPath.split('/')
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw new Error(`非法的 Skill 文件路径: ${relPath}`)
  }
}

/**
 * 获取带代理配置的 fetch：
 * - 内网 SkillHub 必须直连（企业代理会拦截内网、并把内部资源名透出）
 * - 外网地址才走设置的代理；未启用代理时全局 fetch 直连
 */
async function getSkillHubFetch(): Promise<typeof globalThis.fetch> {
  if (isPrivateNetworkUrl(SKILLHUB_BASE_URL)) {
    return globalThis.fetch
  }
  const proxyUrl = await getEffectiveProxyUrl()
  return getFetchFn(proxyUrl)
}

/** 拉取 SkillHub 技能清单 */
export async function fetchSkillHubIndex(): Promise<SkillHubSkill[]> {
  const fetchFn = await getSkillHubFetch()
  const res = await fetchFn(`${SKILLHUB_BASE_URL}/index.json`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`拉取 SkillHub 清单失败 (${res.status})`)
  }
  const data = (await res.json()) as SkillHubIndex
  if (!data || !Array.isArray(data.skills)) {
    throw new Error('SkillHub 清单格式异常：缺少 skills 数组')
  }
  return data.skills
}

/**
 * 从 SkillHub 安装技能到工作区 skills/ 目录。
 * 逐文件下载（Discovery.pull 第二步），写入 <skillName>/ 并标记来源 skillhub。
 * 任一步失败都会清理已写入的半成品目录，保证可重试。
 */
export async function installSkillHubSkill(
  workspaceSkillsDir: string,
  skill: SkillHubSkill,
): Promise<SkillHubInstallResult> {
  assertSafeSkillPath(skill.name)
  const targetPath = join(workspaceSkillsDir, skill.name)
  if (existsSync(targetPath)) {
    throw new Error(`当前工作区已存在同名 Skill: ${skill.name}`)
  }

  mkdirSync(targetPath, { recursive: true })

  try {
    // 逐个下载清单中的文件
    const fetchFn = await getSkillHubFetch()
    for (const relPath of skill.files) {
      assertSafeSkillPath(skill.name, relPath)
      const fileUrlPath = relPath.split('/').map(encodeURIComponent).join('/')
      const url = `${SKILLHUB_BASE_URL}/${encodeURIComponent(skill.name)}/${fileUrlPath}`
      const res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) {
        throw new Error(`下载 SkillHub 文件失败 (${res.status}): ${skill.name}/${relPath}`)
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      const dest = join(targetPath, relPath)
      mkdirSync(join(dest, '..'), { recursive: true })
      writeFileSync(dest, bytes)
    }

    // 写入来源标记（兼容服务端 snake_case 字段；sourceKind 供 UI 显示市场徽标）
    const sourceMeta = {
      sourceType: 'skillhub',
      sourceKind: 'market' as const,
      hubName: 'SkillHub',
      hubUrl: SKILLHUB_BASE_URL,
      skillName: skill.name,
      importedAt: new Date().toISOString(),
      displayName: skill.display_name ?? skill.displayName,
      employeeId: skill.employee_id ?? skill.employeeId,
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
    const name = getField('name') ?? skill.display_name ?? skill.displayName ?? skill.name
    const version = getField('version') ?? '0.0.0'
    const slug = getField('slug') ?? skill.name

    console.log(`[SkillHub] 已安装 Skill: ${skill.name} → ${workspaceSkillsDir}`)
    return { slug, name, version }
  } catch (cause) {
    // 清理半成品目录，保证下次可重试
    rmSync(targetPath, { recursive: true, force: true })
    throw cause
  }
}

/** 上报下载次数（忽略失败，不阻塞安装；需 Authorization，缺少凭据时静默） */
export async function reportSkillHubDownload(skillName: string): Promise<void> {
  try {
    assertSafeSkillPath(skillName)
    const fetchFn = await getSkillHubFetch()
    await fetchFn(`${SKILLHUB_BASE_URL}/api/v1/skills/${encodeURIComponent(skillName)}/stats/download`, {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    console.warn('[SkillHub] 上报下载统计失败:', (err as Error).message)
  }
}
