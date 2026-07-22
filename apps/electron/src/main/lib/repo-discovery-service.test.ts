import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clampDiscoveryDepth, discoverGitRepos } from './repo-discovery-service.ts'

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'lux-repo-discover-'))
}

function touchGit(dir: string): void {
  mkdirSync(join(dir, '.git'))
}

describe('repo-discovery-service', () => {
  test('clampDiscoveryDepth 与选择器一致', () => {
    expect(clampDiscoveryDepth(undefined)).toBe(3)
    expect(clampDiscoveryDepth(1)).toBe(1)
    expect(clampDiscoveryDepth(5)).toBe(5)
    expect(clampDiscoveryDepth(99)).toBe(5)
  })

  test('空 roots 返回空列表，不扫 HOME', () => {
    expect(discoverGitRepos({ roots: [], maxDepth: 3 })).toEqual([])
  })

  test('识别含 .git 的目录为 repo root，并遵守深度', () => {
    const root = makeTempRoot()
    const shallow = join(root, 'app')
    const nested = join(root, 'a', 'b', 'c', 'deep')
    mkdirSync(shallow, { recursive: true })
    mkdirSync(nested, { recursive: true })
    touchGit(shallow)
    touchGit(nested)
    // 非 git 目录不应出现
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs', 'readme.md'), 'x')

    const found = discoverGitRepos({ roots: [root], maxDepth: 2 })
    const paths = found.map((item) => item.path).sort()
    expect(paths).toContain(shallow)
    expect(paths).not.toContain(nested)
    expect(found.find((item) => item.path === shallow)?.name).toBe('app')
  })

  test('root 自身是 git repo 时收录自身', () => {
    const root = makeTempRoot()
    touchGit(root)
    const found = discoverGitRepos({ roots: [root], maxDepth: 1 })
    expect(found).toEqual([{ path: root, name: root.split('/').pop() || root }])
  })
})
