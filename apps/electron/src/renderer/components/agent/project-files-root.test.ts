import { describe, expect, test } from 'bun:test'
import { resolveProjectFilesRoot } from './project-files-root'

describe('resolveProjectFilesRoot', () => {
  test('有 worktree 时优先使用会话 worktree', () => {
    expect(resolveProjectFilesRoot({
      worktreePath: '/tmp/worktree',
      projectWorkingDirectory: '/tmp/project',
    })).toBe('/tmp/worktree')
  })

  test('没有 worktree 时使用绑定 Project 的工作目录', () => {
    expect(resolveProjectFilesRoot({
      worktreePath: null,
      projectWorkingDirectory: '/tmp/project',
    })).toBe('/tmp/project')
  })

  test('没有绑定 Project 时不把 Workspace Files 冒充为 Project 文件', () => {
    expect(resolveProjectFilesRoot({
      worktreePath: null,
      projectWorkingDirectory: null,
    })).toBeNull()
  })
})
