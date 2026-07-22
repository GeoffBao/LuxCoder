/**
 * Proma → LuxCoder upstream sync 共享工具
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface RenameReplacement {
  from: string
  to: string
}

export interface ForbiddenPattern {
  id: string
  regex: string
  message: string
}

export interface RenameMap {
  skipDirNames: string[]
  skipFileGlobs: string[]
  allowlistGlobs: string[]
  warnOnlyGlobs: string[]
  replacements: RenameReplacement[]
  forbiddenPatterns: ForbiddenPattern[]
  sdkPlatformPackages: string[]
  luxOnlySkills: string[]
}

export interface Finding {
  severity: 'error' | 'warn'
  check: string
  file?: string
  line?: number
  message: string
}

const ROOT = join(import.meta.dir, '../..')

export function repoRoot(): string {
  return ROOT
}

export function loadRenameMap(): RenameMap {
  const path = join(import.meta.dir, 'rename-map.json')
  return JSON.parse(readFileSync(path, 'utf-8')) as RenameMap
}

/** 极简 glob：支持 ** / * 与 精确相对路径 */
export function matchGlob(relPath: string, glob: string): boolean {
  const norm = relPath.split(sep).join('/')
  const g = glob.split(sep).join('/')

  if (!g.includes('*')) {
    return norm === g || norm.endsWith('/' + g) || norm.includes('/' + g + '/')
  }

  // **/foo → 任意前缀
  let pattern = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE::/g, '.*')

  // 允许 **/x 匹配 x 本身
  if (pattern.startsWith('.*/')) {
    pattern = `(?:.*\\/)?${pattern.slice(3)}`
  }

  return new RegExp(`^${pattern}$`).test(norm)
}

export function isSkippedFile(relPath: string, map: RenameMap): boolean {
  return map.skipFileGlobs.some((g) => matchGlob(relPath, g))
}

export function isAllowlisted(relPath: string, map: RenameMap): boolean {
  return map.allowlistGlobs.some((g) => matchGlob(relPath, g))
}

export function isWarnOnly(relPath: string, map: RenameMap): boolean {
  return map.warnOnlyGlobs.some((g) => matchGlob(relPath, g))
}

export function walkFiles(dir: string, map: RenameMap, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') {
      // 仍扫描 .github；其余点目录跳过（.git 等已在 skipDirNames）
      if (map.skipDirNames.includes(entry.name)) continue
      if (entry.isDirectory() && entry.name !== '.github') continue
    }
    if (entry.isDirectory() && map.skipDirNames.includes(entry.name)) continue

    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, map, out)
      continue
    }
    if (!entry.isFile()) continue

    const rel = relative(ROOT, full)
    if (isSkippedFile(rel, map)) continue
    out.push(full)
  }
  return out
}

export function readText(path: string): string | null {
  try {
    const buf = readFileSync(path)
    // 粗略跳过二进制
    if (buf.includes(0)) return null
    return buf.toString('utf-8')
  } catch {
    return null
  }
}

export function parseSkillVersionFromContent(content: string): string {
  let text = content
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return '0.0.0'

  for (const line of fmMatch[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key === 'version' && value) return value
  }
  return '0.0.0'
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile() || statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function printFindings(findings: Finding[]): void {
  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')

  for (const f of [...errors, ...warns]) {
    const loc = f.file
      ? f.line
        ? `${f.file}:${f.line}`
        : f.file
      : ''
    const prefix = f.severity === 'error' ? 'ERROR' : 'WARN '
    console.log(`${prefix} [${f.check}] ${loc ? loc + ' — ' : ''}${f.message}`)
  }

  console.log('')
  console.log(`合计: ${errors.length} error(s), ${warns.length} warn(s)`)
}
