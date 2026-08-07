import { describe, expect, test } from 'bun:test'
import type { GitBranchInfo } from '@myyoda/shared'
import {
  filterGitBranches,
  formatGitBranchSubtitle,
  getInitialGitExecutionMode,
  sortGitBranchesForPicker,
} from '../git-context-picker-model'

const branches: GitBranchInfo[] = [
  { name: 'feature/zeta', ref: 'refs/heads/feature/zeta', local: true, current: false, head: 'bbb' },
  { name: 'main', ref: 'refs/heads/main', local: true, current: true, head: 'aaa' },
  { name: 'feature/alpha', ref: 'refs/heads/feature/alpha', local: true, current: false, head: 'ccc', checkedOutPath: '/repo/.worktrees/alpha' },
]

describe('git-context-picker-model', () => {
  test('Given mixed branches When sorting Then current branch stays first and names sort alphabetically', () => {
    expect(sortGitBranchesForPicker(branches).map((branch) => branch.name)).toEqual([
      'main',
      'feature/alpha',
      'feature/zeta',
    ])
  })

  test('Given search query When filtering branches Then matches case-insensitively by name', () => {
    expect(filterGitBranches(branches, 'ALP').map((branch) => branch.name)).toEqual(['feature/alpha'])
  })

  test('Given branch checked out in another worktree When formatting subtitle Then includes occupied path', () => {
    expect(formatGitBranchSubtitle(branches[2]!)).toContain('已在 /repo/.worktrees/alpha checkout')
  })

  test('Given no remembered value When initializing mode Then defaults to Local', () => {
    expect(getInitialGitExecutionMode(undefined)).toBe('local')
  })

  test('Given remembered Worktree value When initializing mode Then restores Worktree', () => {
    expect(getInitialGitExecutionMode('worktree')).toBe('worktree')
  })
})
