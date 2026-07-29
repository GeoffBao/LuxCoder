import { describe, expect, test } from 'bun:test'
import { buildGitWorktreePromptSection } from './agent-git-worktree-policy'

describe('buildGitWorktreePromptSection', () => {
  test('要求 Agent 默认把 worktree 创建在仓库内的隐藏目录', () => {
    const prompt = buildGitWorktreePromptSection()

    expect(prompt).toContain('<repo-root>/.worktrees/<branch-or-task-slug>')
    expect(prompt).toContain('不要默认创建与仓库同级的 `<repo-name>-worktrees`')
    expect(prompt).toContain('项目指令、已有配置或用户明确指定')
  })
})
