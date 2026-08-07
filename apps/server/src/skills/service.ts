/**
 * Skills 存储与打包服务
 *
 * Skill 以 zip（fflate）形式上传/下载：
 * - 上传 zip → 解压校验 SKILL.md → 提取 frontmatter（slug/name/version）→ 落盘目录
 * - 下载 → 重新打包为 zip
 *
 * 存储布局（由 MYYODA_SERVER_SKILLS_DIR 或默认 data/skills 决定）：
 *   <dir>/<orgId>/<skillId>/<version>/... （当前版本内容）
 *   <dir>/<orgId>/<skillId>/<version>.zip （历史版本归档）
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { getDb } from '../db'

const DEFAULT_SKILLS_DIR = join(import.meta.dir, '..', '..', 'data', 'skills')

export function getSkillsDir(): string {
  return process.env.MYYODA_SERVER_SKILLS_DIR ?? DEFAULT_SKILLS_DIR
}

export interface SkillManifest {
  slug: string
  name: string
  version: string
  description?: string
}

/** 从 zip 字节中解析 SKILL.md frontmatter */
export function parseSkillZip(zip: Uint8Array): { manifest: SkillManifest; files: Record<string, Uint8Array> } {
  const files = unzipSync(zip)
  const skillMd = files['SKILL.md']
  if (!skillMd) {
    throw new Error('Skill 包缺少 SKILL.md 文件')
  }
  const text = new TextDecoder().decode(skillMd)
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) {
    throw new Error('SKILL.md 缺少 frontmatter（--- 开头）')
  }
  const frontmatter = match[1] ?? ''
  const getField = (key: string): string | undefined => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m?.[1]?.trim()
  }
  const slug = getField('slug') ?? getField('name')
  const name = getField('name')
  const version = getField('version')
  const description = getField('description')
  if (!slug || !name || !version) {
    throw new Error('SKILL.md frontmatter 必须包含 name 与 version（slug 可选，缺省用 name）')
  }
  return {
    manifest: {
      slug: slug.toLowerCase().replace(/[^a-z0-9-_]+/g, '-'),
      name,
      version,
      description,
    },
    files,
  }
}

/** 将 Skill 内容打包为 zip */
export function packSkillZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 })
}

/** 读取目录内容，返回相对路径 → 文件字节映射 */
export function readDirFiles(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.isFile()) {
        files[rel] = new Uint8Array(readFileSync(full))
      }
    }
  }
  walk(dir, '')
  return files
}

/** 计算目录内容 sha256（用于 content_hash 与更新检测） */
export function computeDirHash(dir: string): string {
  const files = readDirFiles(dir)
  const encoder = new TextEncoder()
  const hash = createHash('sha256')
  for (const name of Object.keys(files).sort()) {
    hash.update(name)
    hash.update(encoder.encode('\0'))
    hash.update(files[name]!)
  }
  return hash.digest('hex')
}

function ensureDirFor(filePath: string): void {
  const parent = dirname(filePath)
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }
}

/** 落盘 Skill 内容（zip → 目录），返回 contentHash 与归档路径 */
export function storeSkillZip(
  orgId: string,
  skillId: string,
  version: string,
  zip: Uint8Array,
): { contentHash: string; archivePath: string } {
  const dir = getSkillsDir()
  const versionDir = join(dir, orgId, skillId, version)
  mkdirSync(versionDir, { recursive: true })

  const files = unzipSync(zip)
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(versionDir, name)
    ensureDirFor(filePath)
    writeFileSync(filePath, content)
  }

  const archivePath = join(dir, orgId, skillId, `${version}.zip`)
  ensureDirFor(archivePath)
  writeFileSync(archivePath, zip)

  return { contentHash: computeDirHash(versionDir), archivePath }
}

/** 读取某版本内容并打包为 zip；不存在返回 null */
export function loadSkillZip(orgId: string, skillId: string, version: string): Uint8Array | null {
  const archivePath = join(getSkillsDir(), orgId, skillId, `${version}.zip`)
  if (existsSync(archivePath)) {
    return new Uint8Array(readFileSync(archivePath))
  }
  const versionDir = join(getSkillsDir(), orgId, skillId, version)
  if (!existsSync(versionDir)) return null
  return packSkillZip(readDirFiles(versionDir))
}

/** 清理 Skill 全部存储（撤销时调用） */
export function removeSkillStorage(orgId: string, skillId: string): void {
  const dir = join(getSkillsDir(), orgId, skillId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}
