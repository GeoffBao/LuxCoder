/**
 * 有界 Git 仓库发现 — 不默认扫 $HOME
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface DiscoveredGitRepo {
  path: string
  name: string
}

export interface DiscoverGitReposInput {
  roots: string[]
  maxDepth?: number
}

export function clampDiscoveryDepth(depth: number | undefined): number {
  if (depth === undefined || Number.isNaN(depth)) return 3
  return Math.min(5, Math.max(1, Math.floor(depth)))
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

function hasGitMarker(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

/**
 * 在给定扫描根下按深度发现含 `.git` 的目录。
 * roots 为空时返回 []（调用方负责引导添加扫描目录）。
 */
export function discoverGitRepos(input: DiscoverGitReposInput): DiscoveredGitRepo[] {
  const maxDepth = clampDiscoveryDepth(input.maxDepth)
  const results: DiscoveredGitRepo[] = []
  const seen = new Set<string>()

  const visit = (dir: string, depth: number): void => {
    if (!isDirectory(dir)) return
    if (hasGitMarker(dir)) {
      if (!seen.has(dir)) {
        seen.add(dir)
        results.push({ path: dir, name: basename(dir) })
      }
      // 已是 repo root，不再向下扫
      return
    }
    if (depth >= maxDepth) return

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue
      visit(join(dir, entry), depth + 1)
    }
  }

  for (const root of input.roots) {
    const trimmed = root.trim()
    if (!trimmed) continue
    visit(trimmed, 0)
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}
