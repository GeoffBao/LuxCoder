import type { GitBranchInfo, GitExecutionMode } from '@myyoda/shared'

export function sortGitBranchesForPicker(branches: readonly GitBranchInfo[]): GitBranchInfo[] {
  return [...branches].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    if (a.local !== b.local) return a.local ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function filterGitBranches(branches: readonly GitBranchInfo[], query: string): GitBranchInfo[] {
  const normalizedQuery = query.trim().toLowerCase()
  const sorted = sortGitBranchesForPicker(branches)
  if (!normalizedQuery) return sorted
  return sorted.filter((branch) => branch.name.toLowerCase().includes(normalizedQuery))
}

export function formatGitBranchSubtitle(branch: GitBranchInfo): string {
  if (branch.checkedOutPath) return `已在 ${branch.checkedOutPath} checkout`
  if (branch.current) return '当前分支'
  if (branch.upstream) return `跟踪 ${branch.upstream}`
  return branch.local ? '本地分支' : '远端分支'
}

export function getInitialGitExecutionMode(rememberedMode: string | undefined): GitExecutionMode {
  return rememberedMode === 'worktree' ? 'worktree' : 'local'
}

export function canCheckoutBranchInLocal(branch: GitBranchInfo): boolean {
  return !branch.checkedOutPath || branch.current
}

export function getProjectGitModeStorageKey(projectId: string): string {
  return `myyoda:project:${projectId}:gitExecutionMode`
}

/** 会话头部 Git 上下文常驻小徽标文案；无 gitBranch 时返回 null（会话未绑定 Git 上下文） */
export function formatSessionGitBadge(meta: {
  gitBranch?: string
  gitExecutionMode?: GitExecutionMode
  gitWorktreePath?: string
}): string | null {
  if (!meta.gitBranch) return null
  if (meta.gitExecutionMode === 'worktree') {
    const segments = (meta.gitWorktreePath ?? '').split(/[\\/]/).filter(Boolean)
    const name = segments[segments.length - 1]
    return `Worktree${name ? ` ${name}` : ''} · ${meta.gitBranch}`
  }
  return `Local · ${meta.gitBranch}`
}
