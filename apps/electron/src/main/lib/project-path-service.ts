import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { ProjectConfig } from '@luxcoder/shared/projects'
import {
  createProject,
  ensureProjectWorkdir,
  loadWorkspaceProjects,
  updateProject,
} from '../../../../../packages/shared/src/projects/storage.ts'
import {
  displayProjectPath,
  normalizeProjectPathForCompare,
} from '@luxcoder/shared/utils'

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
}

export const defaultProjectPathFs: ProjectPathFs = {
  exists: existsSync,
  realpath: (p) => realpathSync(p),
  isDirectory: (p) => statSync(p).isDirectory(),
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

/** Agent / Task 运行前校验：不可用主目录不得静默回退 */
export function assertRunnableCwd(result: EffectiveCwdResult): string {
  if (result.status === 'unavailable' || !result.cwd) {
    throw new Error('项目主目录不可用，请重新定位后再运行 Agent')
  }
  return result.cwd
}
