#!/usr/bin/env bun
/**
 * Proma upstream 同步后门禁。
 *
 * 检查：
 * 1. rename 残留（@proma / ~/.proma / Codex-agent-sdk 等）
 * 2. SDK 版本一致性（deps / optionalDeps / overrides / electron-builder / esbuild external）
 * 3. 当前平台 SDK 子包 symlink 是否存在
 * 4. default-skills version frontmatter；可选对比 upstream
 *
 *   bun run sync:check
 *   bun run sync:check -- --skills-upstream
 *   bun run sync:check -- --strict-docs   # 文档类残留也当 error
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import { $ } from 'bun'
import {
  compareSemver,
  fileExists,
  isAllowlisted,
  isWarnOnly,
  loadRenameMap,
  parseSkillVersionFromContent,
  printFindings,
  readText,
  repoRoot,
  type Finding,
  walkFiles,
} from './shared.ts'

const args = new Set(process.argv.slice(2))
const skillsUpstream = args.has('--skills-upstream')
const strictDocs = args.has('--strict-docs')

const map = loadRenameMap()
const root = repoRoot()
const findings: Finding[] = []

function add(f: Finding): void {
  findings.push(f)
}

// ── 1. rename 残留 ──────────────────────────────────────────────

const compiled = map.forbiddenPatterns.map((p) => ({
  ...p,
  re: new RegExp(p.regex, 'g'),
}))

for (const full of walkFiles(root, map)) {
  const rel = relative(root, full)
  if (isAllowlisted(rel, map)) continue

  const text = readText(full)
  if (text === null) continue

  const lines = text.split('\n')
  for (const pattern of compiled) {
    pattern.re.lastIndex = 0
    for (let i = 0; i < lines.length; i++) {
      pattern.re.lastIndex = 0
      if (!pattern.re.test(lines[i]!)) continue
      const warnDoc = isWarnOnly(rel, map) && !strictDocs
      add({
        severity: warnDoc ? 'warn' : 'error',
        check: `rename/${pattern.id}`,
        file: rel,
        line: i + 1,
        message: pattern.message,
      })
    }
  }
}

// ── 2. SDK 版本一致性 ───────────────────────────────────────────

interface PkgJson {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  overrides?: Record<string, string>
  scripts?: Record<string, string>
}

function readJson(path: string): PkgJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PkgJson
  } catch {
    return null
  }
}

const electronPkgPath = join(root, 'apps/electron/package.json')
const rootPkgPath = join(root, 'package.json')
const electronPkg = readJson(electronPkgPath)
const rootPkg = readJson(rootPkgPath)

const sdkMain = '@anthropic-ai/claude-agent-sdk'
const pinned = electronPkg?.dependencies?.[sdkMain]

if (!pinned) {
  add({
    severity: 'error',
    check: 'sdk/pin',
    file: 'apps/electron/package.json',
    message: `缺少 dependencies["${sdkMain}"]`,
  })
} else {
  const opt = electronPkg?.optionalDependencies ?? {}
  for (const plat of map.sdkPlatformPackages) {
    const v = opt[plat]
    if (!v) {
      add({
        severity: 'error',
        check: 'sdk/optionalDeps',
        file: 'apps/electron/package.json',
        message: `optionalDependencies 缺少 ${plat}`,
      })
    } else if (v !== pinned) {
      add({
        severity: 'error',
        check: 'sdk/optionalDeps',
        file: 'apps/electron/package.json',
        message: `${plat}=${v} 与主包 ${pinned} 不一致`,
      })
    }
  }

  const overrides = rootPkg?.overrides ?? {}
  const overrideKeys = [sdkMain, ...map.sdkPlatformPackages]
  for (const key of overrideKeys) {
    const v = overrides[key]
    if (!v) {
      add({
        severity: 'warn',
        check: 'sdk/overrides',
        file: 'package.json',
        message: `overrides 未钉住 ${key}（建议与 ${pinned} 对齐）`,
      })
    } else if (v !== pinned) {
      add({
        severity: 'error',
        check: 'sdk/overrides',
        file: 'package.json',
        message: `overrides["${key}"]=${v} 与主包 ${pinned} 不一致`,
      })
    }
  }

  // esbuild external
  const scripts = electronPkg?.scripts ?? {}
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!name.startsWith('build:main') && !name.startsWith('watch:main')) continue
    if (cmd.includes('Codex-agent-sdk')) {
      add({
        severity: 'error',
        check: 'sdk/esbuild',
        file: 'apps/electron/package.json',
        message: `${name} 仍 external 了 Codex-agent-sdk`,
      })
    }
    if (!cmd.includes(`--external:${sdkMain}`) && !cmd.includes('--external:@anthropic-ai/claude-agent-sdk')) {
      add({
        severity: 'error',
        check: 'sdk/esbuild',
        file: 'apps/electron/package.json',
        message: `${name} 未 --external:@anthropic-ai/claude-agent-sdk`,
      })
    }
  }

  // electron-builder.yml files
  const builderPath = join(root, 'apps/electron/electron-builder.yml')
  if (!existsSync(builderPath)) {
    add({
      severity: 'error',
      check: 'sdk/builder',
      file: 'apps/electron/electron-builder.yml',
      message: '找不到 electron-builder.yml',
    })
  } else {
    const yml = readFileSync(builderPath, 'utf-8')
    const requiredGlobs = [
      'node_modules/@anthropic-ai/claude-agent-sdk/**/*',
      ...map.sdkPlatformPackages.map((p) => `node_modules/${p}/**/*`),
    ]
    for (const g of requiredGlobs) {
      if (!yml.includes(g)) {
        add({
          severity: 'error',
          check: 'sdk/builder',
          file: 'apps/electron/electron-builder.yml',
          message: `files 缺少 ${g}`,
        })
      }
    }
    if (yml.includes('Codex-agent-sdk')) {
      add({
        severity: 'error',
        check: 'sdk/builder',
        file: 'apps/electron/electron-builder.yml',
        message: '仍引用 Codex-agent-sdk',
      })
    }
    // 旧 @proma 排除应变为 @luxcoder
    if (yml.includes('!node_modules/@proma/**')) {
      add({
        severity: 'error',
        check: 'sdk/builder',
        file: 'apps/electron/electron-builder.yml',
        message: '仍排除 @proma/**，应改为 @luxcoder/**',
      })
    }
  }

  // 文档里的 SDK 版本号（warn）
  for (const doc of ['CLAUDE.md', 'AGENTS.md']) {
    const path = join(root, doc)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf-8')
    const mentions = [...text.matchAll(/claude-agent-sdk@(\d+\.\d+\.\d+)/g)].map((m) => m[1]!)
    const tableMentions = [...text.matchAll(/claude-agent-sdk\s*\|\s*(\d+\.\d+\.\d+)/g)].map(
      (m) => m[1]!,
    )
    const versions = [...new Set([...mentions, ...tableMentions])]
    for (const v of versions) {
      if (v !== pinned) {
        add({
          severity: 'warn',
          check: 'sdk/docs',
          file: doc,
          message: `文档写 SDK ${v}，package.json 钉的是 ${pinned}`,
        })
      }
    }
    if (/Codex-agent-sdk/.test(text)) {
      add({
        severity: strictDocs ? 'error' : 'warn',
        check: 'sdk/docs',
        file: doc,
        message: '文档残留 Codex-agent-sdk 错写',
      })
    }
  }

  // 当前平台 symlink
  const plat =
    process.platform === 'darwin'
      ? process.arch === 'arm64'
        ? 'darwin-arm64'
        : 'darwin-x64'
      : process.platform === 'win32'
        ? process.arch === 'arm64'
          ? 'win32-arm64'
          : 'win32-x64'
        : null

  if (plat) {
    const pkgName = `@anthropic-ai/claude-agent-sdk-${plat}`
    const linkPath = join(root, 'apps/electron/node_modules/@anthropic-ai', `claude-agent-sdk-${plat}`)
    if (!fileExists(linkPath)) {
      add({
        severity: 'warn',
        check: 'sdk/symlink',
        file: `apps/electron/node_modules/@anthropic-ai/claude-agent-sdk-${plat}`,
        message: `${pkgName} 未安装/未链接，打包后 Agent 可能找不到 binary（先 bun install）`,
      })
    } else {
      try {
        realpathSync(linkPath)
      } catch {
        add({
          severity: 'error',
          check: 'sdk/symlink',
          file: relative(root, linkPath),
          message: `${pkgName} symlink 损坏`,
        })
      }
    }
  }
}

// ── 3. default-skills version ───────────────────────────────────

const skillsRoot = join(root, 'apps/electron/default-skills')
if (existsSync(skillsRoot)) {
  const skillDirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((d) => d.isDirectory())

  for (const dir of skillDirs) {
    const skillMd = join(skillsRoot, dir.name, 'SKILL.md')
    const rel = relative(root, skillMd)
    if (!existsSync(skillMd)) {
      add({
        severity: 'error',
        check: 'skills/missing',
        file: relative(root, join(skillsRoot, dir.name)),
        message: '缺少 SKILL.md',
      })
      continue
    }

    const content = readFileSync(skillMd, 'utf-8')
    const version = parseSkillVersionFromContent(content)
    if (version === '0.0.0') {
      add({
        severity: 'error',
        check: 'skills/version',
        file: rel,
        message: 'frontmatter 缺少 version（老用户升级契约会失效）',
      })
    }

    if (!skillsUpstream) continue
    if (map.luxOnlySkills.includes(dir.name)) continue

    // 对比 upstream/main 同名 skill version
    try {
      const upPath = `apps/electron/default-skills/${dir.name}/SKILL.md`
      const result = await $`git show upstream/main:${upPath}`.quiet().nothrow()
      if (result.exitCode !== 0) continue
      const upContent = result.stdout.toString('utf-8')
      const upVersion = parseSkillVersionFromContent(upContent)
      if (compareSemver(upVersion, version) > 0) {
        add({
          severity: 'warn',
          check: 'skills/upstream',
          file: rel,
          message: `upstream version ${upVersion} > local ${version}，同步内容后记得 bump version`,
        })
      } else if (
        compareSemver(upVersion, version) === 0 &&
        normalizeSkillBody(upContent) !== normalizeSkillBody(content)
      ) {
        add({
          severity: 'warn',
          check: 'skills/upstream',
          file: rel,
          message: `与 upstream 内容不同但 version 同为 ${version}；若已合入上游改动必须 bump version`,
        })
      }
    } catch {
      // upstream 不可用时跳过
    }
  }
} else {
  add({
    severity: 'error',
    check: 'skills/root',
    message: '找不到 apps/electron/default-skills/',
  })
}

/** 去掉 frontmatter 与空白后比较正文，减少品牌替换噪声误报 */
function normalizeSkillBody(content: string): string {
  let text = content
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*/, '')
  // 忽略已知品牌差异
  text = text
    .replace(/~\/\.proma/g, '~/.luxcoder')
    .replace(/~\/\.luxcoder/g, '~/.luxcoder')
    .replace(/@proma\//g, '@luxcoder/')
    .replace(/Proma/g, 'LuxCoder')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

// ── 输出 ────────────────────────────────────────────────────────

printFindings(findings)
const errors = findings.filter((f) => f.severity === 'error')
if (errors.length > 0) {
  console.log('失败。先 bun run sync:apply-renames -- --write，再修剩余项。')
  process.exit(1)
}
console.log('通过。')
if (!skillsUpstream) {
  console.log('提示: 加 --skills-upstream 可对比 upstream/main 的 skill version')
}
