import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import type {
  AgentSessionMeta,
  GitBranchInfo,
  ListGitBranchesInput,
  PrepareSessionGitContextInput,
  PrepareSessionGitContextResult,
  SessionGitContext,
} from '@luxcoder/shared'

interface PrepareOptions {
  updateSessionMeta?: (sessionId: string, updates: Partial<AgentSessionMeta>) => AgentSessionMeta
}

function runGit(repoPath: string, args: string[]): string {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: repoPath,
      encoding: 'utf-8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '').trim()
      : ''
    const message = stderr || (error instanceof Error ? error.message : String(error))
    throw new Error(message)
  }
}

function runGitOrNull(repoPath: string, args: string[]): string | null {
  try {
    return runGit(repoPath, args)
  } catch {
    return null
  }
}

function getRepoRoot(repoPath: string): string {
  const root = runGit(repoPath, ['rev-parse', '--show-toplevel'])
  return resolve(root)
}

function getCurrentBranch(repoPath: string): string {
  return runGitOrNull(repoPath, ['branch', '--show-current']) ?? ''
}

function hasDirtyChanges(repoPath: string): boolean {
  return runGit(repoPath, ['status', '--porcelain']).length > 0
}

function ensureValidBranchName(repoPath: string, branchName: string): void {
  if (!branchName.trim()) throw new Error('分支名不能为空')
  runGit(repoPath, ['check-ref-format', '--branch', branchName])
}

function parseWorktreeBranches(repoPath: string): Map<string, string> {
  const output = runGitOrNull(repoPath, ['worktree', 'list', '--porcelain']) ?? ''
  const map = new Map<string, string>()
  let currentPath = ''
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = resolve(line.slice('worktree '.length))
      continue
    }
    if (line.startsWith('branch refs/heads/')) {
      const branch = line.slice('branch refs/heads/'.length)
      map.set(branch, currentPath)
    }
  }
  return map
}

export function listGitBranchesForSession(input: ListGitBranchesInput): GitBranchInfo[] {
  const repoRoot = getRepoRoot(input.repoPath)
  const currentBranch = getCurrentBranch(repoRoot)
  const occupiedByBranch = parseWorktreeBranches(repoRoot)
  const format = '%(refname)%00%(refname:short)%00%(objectname:short)%00%(upstream:short)'
  const refs = ['refs/heads']
  if (input.includeRemote) refs.push('refs/remotes')
  const output = runGit(repoRoot, ['for-each-ref', `--format=${format}`, ...refs])

  return output
    .split('\n')
    .filter(Boolean)
    .map((line): GitBranchInfo => {
      const [ref = '', shortName = '', head = '', upstream = ''] = line.split('\0')
      const local = ref.startsWith('refs/heads/')
      const name = local ? shortName : shortName.replace(/^origin\//, '')
      return {
        name,
        ref,
        local,
        current: local && shortName === currentBranch,
        upstream: upstream || undefined,
        head: head || undefined,
        checkedOutPath: local ? occupiedByBranch.get(shortName) : undefined,
      }
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      if (a.local !== b.local) return a.local ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'session-worktree'
}

function worktreePathFor(repoRoot: string, input: PrepareSessionGitContextInput): string {
  const slug = slugify(input.slug ?? input.newBranchName ?? `${input.sessionId}-${input.branch}`)
  const root = resolve(repoRoot)
  const target = resolve(root, '.worktrees', slug)
  const allowedPrefix = `${resolve(root, '.worktrees')}${sep}`
  if (!target.startsWith(allowedPrefix)) {
    throw new Error('Worktree 路径非法')
  }
  return target
}

function persistContext(
  input: PrepareSessionGitContextInput,
  context: SessionGitContext,
  options?: PrepareOptions,
): void {
  options?.updateSessionMeta?.(input.sessionId, {
    workingDirectory: context.workingDirectory,
    gitRepoPath: context.repoPath,
    gitBranch: context.branch,
    gitExecutionMode: context.executionMode,
    gitWorktreePath: context.worktreePath,
    gitBaseRef: context.baseRef,
  })
}

function prepareLocalContext(
  repoRoot: string,
  input: PrepareSessionGitContextInput,
  options?: PrepareOptions,
): PrepareSessionGitContextResult {
  const targetBranch = input.newBranchName ?? input.branch
  if (input.newBranchName) ensureValidBranchName(repoRoot, input.newBranchName)
  const currentBranch = getCurrentBranch(repoRoot)
  if (currentBranch !== targetBranch && hasDirtyChanges(repoRoot)) {
    throw new Error('工作区存在未提交改动，已阻止 Local 分支切换')
  }
  const occupiedPath = parseWorktreeBranches(repoRoot).get(targetBranch)
  if (occupiedPath && resolve(occupiedPath) !== repoRoot) {
    throw new Error(`分支 ${targetBranch} 已被其他 worktree checkout: ${occupiedPath}`)
  }
  if (input.newBranchName) {
    runGit(repoRoot, ['switch', '-c', input.newBranchName, input.branch])
  } else if (currentBranch !== targetBranch) {
    runGit(repoRoot, ['switch', targetBranch])
  }

  const context: SessionGitContext = {
    repoPath: repoRoot,
    branch: targetBranch,
    executionMode: 'local',
    workingDirectory: repoRoot,
    baseRef: input.branch,
  }
  persistContext(input, context, options)
  return { context, createdWorktree: false }
}

function prepareWorktreeContext(
  repoRoot: string,
  input: PrepareSessionGitContextInput,
  options?: PrepareOptions,
): PrepareSessionGitContextResult {
  const worktreePath = worktreePathFor(repoRoot, input)
  const branch = input.newBranchName ?? input.branch
  let createdWorktree = false

  if (!existsSync(worktreePath)) {
    mkdirSync(join(repoRoot, '.worktrees'), { recursive: true })
    if (input.newBranchName) {
      ensureValidBranchName(repoRoot, input.newBranchName)
      runGit(repoRoot, ['worktree', 'add', '-b', input.newBranchName, worktreePath, input.branch])
    } else {
      runGit(repoRoot, ['worktree', 'add', '--detach', worktreePath, input.branch])
    }
    createdWorktree = true
  }

  const context: SessionGitContext = {
    repoPath: repoRoot,
    branch,
    executionMode: 'worktree',
    workingDirectory: worktreePath,
    worktreePath,
    baseRef: input.branch,
  }

  try {
    persistContext(input, context, options)
  } catch (error) {
    if (createdWorktree) {
      try {
        runGit(repoRoot, ['worktree', 'remove', '--force', worktreePath])
      } catch {
        rmSync(worktreePath, { recursive: true, force: true })
      }
    }
    throw error
  }

  return { context, createdWorktree }
}

export function prepareSessionGitContext(
  input: PrepareSessionGitContextInput,
  options?: PrepareOptions,
): PrepareSessionGitContextResult {
  const repoRoot = getRepoRoot(input.repoPath)
  if (input.executionMode === 'local') {
    return prepareLocalContext(repoRoot, input, options)
  }
  return prepareWorktreeContext(repoRoot, input, options)
}

export function describeSessionGitContext(context: SessionGitContext): string {
  const location = context.executionMode === 'worktree'
    ? `Worktree ${basename(context.workingDirectory)}`
    : 'Local'
  return `${location} · ${context.branch}`
}
