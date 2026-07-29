import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export type TaskWorkingDirectorySource = 'task' | 'project' | 'workspace'

export type TaskWorkingDirectoryBlockedReason =
  | 'missing-cwd'
  | 'invalid-task-cwd'
  | 'missing-project'
  | 'invalid-project-cwd'
  | 'invalid-workspace-cwd'

export type TaskWorkingDirectoryResult =
  | { status: 'resolved'; cwd: string; source: TaskWorkingDirectorySource }
  | { status: 'blocked'; reason: TaskWorkingDirectoryBlockedReason; attemptedPath?: string }

export type ProjectWorkingDirectoryResult =
  | { status: 'resolved'; cwd: string }
  | { status: 'unavailable'; attemptedPath?: string }

export interface TaskWorkingDirectoryFs {
  exists(path: string): boolean
  isDirectory(path: string): boolean
  canReadWrite(path: string): boolean
  realpath(path: string): string
}

export const defaultTaskWorkingDirectoryFs: TaskWorkingDirectoryFs = {
  exists: existsSync,
  isDirectory: (path) => statSync(path).isDirectory(),
  canReadWrite: (path) => {
    try {
      accessSync(path, constants.R_OK | constants.W_OK)
      return true
    } catch {
      return false
    }
  },
  realpath: realpathSync,
}

export interface ResolveTaskWorkingDirectoryInput {
  explicitCwd?: string
  projectId?: string
  workspaceDefaultCwd?: string
  resolveProjectCwd?: (projectId: string) => ProjectWorkingDirectoryResult | null
  fs?: TaskWorkingDirectoryFs
}

function validateCandidate(
  rawPath: string,
  source: TaskWorkingDirectorySource,
  fs: TaskWorkingDirectoryFs,
): TaskWorkingDirectoryResult {
  const attemptedPath = rawPath.trim()
  const absolute = resolve(attemptedPath)
  const reason: Exclude<TaskWorkingDirectoryBlockedReason, 'missing-cwd' | 'missing-project'> =
    source === 'task'
      ? 'invalid-task-cwd'
      : source === 'project'
        ? 'invalid-project-cwd'
        : 'invalid-workspace-cwd'

  try {
    if (!fs.exists(absolute) || !fs.isDirectory(absolute) || !fs.canReadWrite(absolute)) {
      return { status: 'blocked', reason, attemptedPath }
    }
    return { status: 'resolved', cwd: fs.realpath(absolute), source }
  } catch {
    return { status: 'blocked', reason, attemptedPath }
  }
}

/**
 * 唯一 Task cwd resolver。
 *
 * 配置过但失效的高优先级路径会阻止运行，绝不静默降级到下一级。
 */
export function resolveTaskWorkingDirectory(input: ResolveTaskWorkingDirectoryInput): TaskWorkingDirectoryResult {
  const fs = input.fs ?? defaultTaskWorkingDirectoryFs
  const explicitCwd = input.explicitCwd?.trim()
  if (explicitCwd) return validateCandidate(explicitCwd, 'task', fs)

  const projectId = input.projectId?.trim()
  if (projectId) {
    const project = input.resolveProjectCwd?.(projectId) ?? null
    if (!project) return { status: 'blocked', reason: 'missing-project' }
    if (project.status === 'unavailable') {
      return {
        status: 'blocked',
        reason: 'invalid-project-cwd',
        ...(project.attemptedPath ? { attemptedPath: project.attemptedPath } : {}),
      }
    }
    return validateCandidate(project.cwd, 'project', fs)
  }

  const workspaceDefaultCwd = input.workspaceDefaultCwd?.trim()
  if (workspaceDefaultCwd) return validateCandidate(workspaceDefaultCwd, 'workspace', fs)

  return { status: 'blocked', reason: 'missing-cwd' }
}

export function describeTaskWorkingDirectoryBlock(result: Extract<TaskWorkingDirectoryResult, { status: 'blocked' }>): string {
  switch (result.reason) {
    case 'missing-cwd':
      return '任务没有可用工作目录，请设置任务目录、绑定 Project 或配置 Workspace 默认目录'
    case 'invalid-task-cwd':
      return `任务工作目录不可用${result.attemptedPath ? `: ${result.attemptedPath}` : ''}`
    case 'missing-project':
      return '任务绑定的 Project 不存在，请重新绑定或转为 Workspace Task'
    case 'invalid-project-cwd':
      return `Project 工作目录不可用${result.attemptedPath ? `: ${result.attemptedPath}` : ''}`
    case 'invalid-workspace-cwd':
      return `Workspace 默认工作目录不可用${result.attemptedPath ? `: ${result.attemptedPath}` : ''}`
  }
}
