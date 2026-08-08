import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { AgentSessionMeta } from '@yoda/shared'
import { listGitBranchesForSession, prepareSessionGitContext } from './git-session-context-service'

const roots: string[] = []

function sh(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'yoda-git-session-context-'))
  roots.push(root)
  sh(root, ['init', '-b', 'main'])
  sh(root, ['config', 'user.email', 'test@example.com'])
  sh(root, ['config', 'user.name', 'Test User'])
  writeFileSync(join(root, 'README.md'), '# Test\n', 'utf-8')
  sh(root, ['add', 'README.md'])
  sh(root, ['commit', '-m', 'initial'])
  sh(root, ['branch', 'feature/alpha'])
  return root
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!
    rmSync(root, { recursive: true, force: true })
  }
})

describe('git-session-context-service', () => {
  test('Given repo branches and a checked-out worktree When listing branches Then marks current and occupied branches', () => {
    const repo = makeRepo()
    const repoRoot = sh(repo, ['rev-parse', '--show-toplevel'])
    const occupied = join(repoRoot, '.worktrees', 'alpha')
    sh(repo, ['worktree', 'add', occupied, 'feature/alpha'])

    const branches = listGitBranchesForSession({ repoPath: repo })

    expect(branches.find((branch) => branch.name === 'main')).toMatchObject({
      local: true,
      current: true,
    })
    expect(branches.find((branch) => branch.name === 'feature/alpha')).toMatchObject({
      local: true,
      current: false,
      checkedOutPath: occupied,
    })
  })

  test('Given Worktree mode When preparing session context Then creates detached worktree under repo .worktrees and persists meta', () => {
    const repo = makeRepo()
    const updates: Partial<AgentSessionMeta>[] = []

    const result = prepareSessionGitContext({
      sessionId: 'session-1',
      repoPath: repo,
      executionMode: 'worktree',
      branch: 'main',
      slug: 'session-one',
    }, {
      updateSessionMeta: (_sessionId, update) => {
        updates.push(update)
        return { id: 'session-1', title: 'session', createdAt: 1, updatedAt: 2, ...update } as AgentSessionMeta
      },
    })

    const repoRoot = sh(repo, ['rev-parse', '--show-toplevel'])
    const expectedWorktree = join(repoRoot, '.worktrees', 'session-one')
    expect(result.createdWorktree).toBe(true)
    expect(result.context).toMatchObject({
      repoPath: repoRoot,
      branch: 'main',
      executionMode: 'worktree',
      workingDirectory: expectedWorktree,
      worktreePath: expectedWorktree,
      baseRef: 'main',
    })
    expect(existsSync(expectedWorktree)).toBe(true)
    expect(sh(expectedWorktree, ['branch', '--show-current'])).toBe('')
    expect(updates.at(-1)).toMatchObject({
      workingDirectory: expectedWorktree,
      gitRepoPath: repoRoot,
      gitBranch: 'main',
      gitExecutionMode: 'worktree',
      gitWorktreePath: expectedWorktree,
      gitBaseRef: 'main',
    })
  })

  test('Given Local mode with dirty working tree When switching branch Then refuses without changing session meta', () => {
    const repo = makeRepo()
    writeFileSync(join(repo, 'dirty.txt'), 'dirty\n', 'utf-8')
    const updates: Partial<AgentSessionMeta>[] = []

    expect(() => prepareSessionGitContext({
      sessionId: 'session-2',
      repoPath: repo,
      executionMode: 'local',
      branch: 'feature/alpha',
    }, {
      updateSessionMeta: (_sessionId, update) => {
        updates.push(update)
        return { id: 'session-2', title: 'session', createdAt: 1, updatedAt: 2, ...update } as AgentSessionMeta
      },
    })).toThrow('工作区存在未提交改动')

    expect(sh(repo, ['branch', '--show-current'])).toBe('main')
    expect(updates).toHaveLength(0)
  })
})
