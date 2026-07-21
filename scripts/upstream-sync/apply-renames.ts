#!/usr/bin/env bun
/**
 * 将 Proma 残留字符串按 rename-map 批量替换。
 *
 * 默认 dry-run；加 --write 才落盘。
 * 若改动了 default-skills/<skill>/SKILL.md，自动 patch bump frontmatter version。
 *
 *   bun run sync:apply-renames
 *   bun run sync:apply-renames -- --write
 */
import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  isAllowlisted,
  loadRenameMap,
  parseSkillVersionFromContent,
  readText,
  repoRoot,
  walkFiles,
} from './shared.ts'

interface Change {
  file: string
  count: number
  samples: string[]
  versionBump?: string
}

const write = process.argv.includes('--write')
const map = loadRenameMap()
const root = repoRoot()
const files = walkFiles(root, map)
const changes: Change[] = []

function bumpPatchVersion(version: string): string {
  const parts = version.split('.').map((p) => Number.parseInt(p, 10))
  while (parts.length < 3) parts.push(0)
  parts[2] = (parts[2] ?? 0) + 1
  return parts.join('.')
}

function maybeBumpSkillVersion(rel: string, content: string): { text: string; bump?: string } {
  if (!rel.match(/^apps\/electron\/default-skills\/[^/]+\/SKILL\.md$/)) {
    return { text: content }
  }
  const current = parseSkillVersionFromContent(content)
  if (current === '0.0.0') return { text: content }
  const nextVer = bumpPatchVersion(current)
  const bumped = content.replace(
    /^(---\s*\n[\s\S]*?\nversion:\s*)(["']?)([^"'\n]+)(["']?)/m,
    `$1$2${nextVer}$4`,
  )
  if (bumped === content) return { text: content }
  return { text: bumped, bump: `${current} → ${nextVer}` }
}

for (const full of files) {
  const rel = relative(root, full)
  if (isAllowlisted(rel, map)) continue

  const text = readText(full)
  if (text === null) continue

  let next = text
  let total = 0
  const samples: string[] = []

  for (const { from, to } of map.replacements) {
    if (!next.includes(from)) continue
    const parts = next.split(from)
    const n = parts.length - 1
    if (n <= 0) continue
    total += n
    if (samples.length < 3) samples.push(`"${from}" → "${to}" ×${n}`)
    next = parts.join(to)
  }

  if (total === 0 || next === text) continue

  const { text: finalText, bump } = maybeBumpSkillVersion(rel, next)
  changes.push({ file: rel, count: total, samples, versionBump: bump })
  if (write) writeFileSync(full, finalText, 'utf-8')
}

if (changes.length === 0) {
  console.log('无需要替换的残留。')
  process.exit(0)
}

console.log(write ? '已写入：' : 'Dry-run（加 --write 落盘）：')
for (const c of changes) {
  const bump = c.versionBump ? `  [version ${c.versionBump}]` : ''
  console.log(`  ${c.file}  (${c.count})  ${c.samples.join('; ')}${bump}`)
}
console.log(`\n共 ${changes.length} 个文件，${changes.reduce((s, c) => s + c.count, 0)} 处替换`)
if (!write) {
  console.log('\n确认后执行: bun run sync:apply-renames -- --write')
}
