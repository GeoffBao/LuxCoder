import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { ProjectConfig } from '@myyoda/shared/projects'
import {
  createProject,
  ensureProjectWorkdir,
  loadWorkspaceProjects,
  updateProject,
} from '../../../../../packages/shared/src/projects/storage.ts'
import {
  displayProjectPath,
  normalizeProjectPathForCompare,
} from '@myyoda/shared/utils'

export type EffectiveCwdStatus = 'managed' | 'external' | 'unavailable'

export interface EffectiveCwdResult {
  status: EffectiveCwdStatus
  cwd?: string
  displayPath?: string
}

export interface ProjectPathFs {
  exists: (path: string) => boolean
  realpath: (path: string) => string
  isDirectory: (path: string) => boolean
  mkdir: (path: string) => void
}

export const defaultProjectPathFs: ProjectPathFs = {
  exists: existsSync,
  realpath: (p) => realpathSync(p),
  isDirectory: (p) => statSync(p).isDirectory(),
  mkdir: (p) => { mkdirSync(p, { recursive: true }) },
}

export function canonicalizeForCompare(path: string, fs: ProjectPathFs = defaultProjectPathFs): string {
  const absolute = resolve(displayProjectPath(path))
  const real = fs.exists(absolute) ? fs.realpath(absolute) : absolute
  return normalizeProjectPathForCompare(real)
}

export function resolveEffectiveCwd(
  workspaceRoot: string,
  project: ProjectConfig,
  fs: ProjectPathFs = defaultProjectPathFs,
): EffectiveCwdResult {
  const external = project.workingDirectory?.trim()
  if (!external) {
    const cwd = ensureProjectWorkdir(workspaceRoot, project.slug)
    return { status: 'managed', cwd, displayPath: cwd }
  }
  const absolute = resolve(external)
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    return { status: 'unavailable', displayPath: external }
  }
  return { status: 'external', cwd: absolute, displayPath: external }
}

export function findProjectByWorkingDirectory(
  workspaceRoot: string,
  folderPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): ProjectConfig | null {
  const target = canonicalizeForCompare(folderPath, fs)
  for (const loaded of loadWorkspaceProjects(workspaceRoot)) {
    const wd = loaded.config.workingDirectory?.trim()
    if (!wd) continue
    if (canonicalizeForCompare(wd, fs) === target) return loaded.config
  }
  return null
}

export function openOrCreateProjectForPath(
  workspaceRoot: string,
  folderPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): { project: ProjectConfig; created: boolean } {
  const absolute = resolve(displayProjectPath(folderPath))
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    throw new Error(`目录不可访问: ${folderPath}`)
  }
  const existing = findProjectByWorkingDirectory(workspaceRoot, absolute, fs)
  if (existing) return { project: existing, created: false }
  const name = basename(absolute) || 'Project'
  const project = createProject(workspaceRoot, {
    name,
    workingDirectory: absolute,
  })
  ensureProjectWorkdir(workspaceRoot, project.slug)
  return { project, created: true }
}

export function relocateProjectWorkingDirectory(
  workspaceRoot: string,
  projectSlug: string,
  newPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): ProjectConfig {
  const absolute = resolve(displayProjectPath(newPath))
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    throw new Error(`目录不可访问: ${newPath}`)
  }
  const conflict = findProjectByWorkingDirectory(workspaceRoot, absolute, fs)
  if (conflict && conflict.slug !== projectSlug) {
    throw new Error('该路径已绑定其他 Project')
  }
  return updateProject(workspaceRoot, projectSlug, {
    workingDirectory: absolute,
  })
}

/**
 * 在本地项目原路径重建一个空目录。仅当路径确实缺失时才允许执行，
 * 避免误清空一个只是暂时不可访问（如权限问题）的真实目录。
 */
export function restoreProjectWorkingDirectory(
  workspaceRoot: string,
  projectSlug: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): ProjectConfig {
  const loaded = loadWorkspaceProjects(workspaceRoot).find((p) => p.config.slug === projectSlug)
  if (!loaded) throw new Error(`Project 不存在: ${projectSlug}`)
  const target = loaded.config.workingDirectory?.trim()
  if (!target) throw new Error('该 Project 未绑定本地目录，无需恢复')
  const absolute = resolve(displayProjectPath(target))
  if (fs.exists(absolute)) {
    throw new Error('目录仍然存在，无需恢复；如需切换目录请使用重新关联')
  }
  fs.mkdir(absolute)
  return loaded.config
}

/** Agent / Task 运行前校验：不可用主目录不得静默回退 */
export function assertRunnableCwd(result: EffectiveCwdResult): string {
  if (result.status === 'unavailable' || !result.cwd) {
    throw new Error('工作区主目录不可用，请重新定位后再运行 Agent')
  }
  return result.cwd
}
