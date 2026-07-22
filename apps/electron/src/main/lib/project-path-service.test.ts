import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProject, getProjectWorkdirPath } from '../../../../../packages/shared/src/projects/storage.ts'
import {
  resolveEffectiveCwd,
  findProjectByWorkingDirectory,
  openOrCreateProjectForPath,
  type ProjectPathFs,
} from './project-path-service.ts'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lux-path-svc-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function accessibleFs(extra?: Partial<ProjectPathFs>): ProjectPathFs {
  return {
    exists: (p) => existsSync(p),
    realpath: (p) => p, // 测试用：跳过真实 symlink
    isDirectory: () => true,
    ...extra,
  }
}

describe('project-path-service', () => {
  test('无外部目录时 effectiveCwd = 托管 workdir，并按需创建', () => {
    const ws = tempRoot()
    const project = createProject(ws, { name: 'Solo' })
    const result = resolveEffectiveCwd(ws, project, accessibleFs())
    expect(result.status).toBe('managed')
    expect(result.cwd).toBe(getProjectWorkdirPath(ws, project.slug))
    expect(existsSync(result.cwd!)).toBe(true)
  })

  test('外部目录可访问时使用 workingDirectory，不回退托管目录', () => {
    const ws = tempRoot()
    const external = join(tempRoot(), 'repo')
    mkdirSync(external)
    const project = createProject(ws, { name: 'Ext', workingDirectory: external })
    const result = resolveEffectiveCwd(ws, project, accessibleFs())
    expect(result.status).toBe('external')
    expect(result.cwd).toBe(external)
  })

  test('外部目录不可访问时 status=unavailable，cwd 为空，不静默回退', () => {
    const ws = tempRoot()
    const project = createProject(ws, {
      name: 'Gone',
      workingDirectory: join(ws, 'missing-repo'),
    })
    const result = resolveEffectiveCwd(ws, project, accessibleFs({
      exists: () => false,
    }))
    expect(result.status).toBe('unavailable')
    expect(result.cwd).toBeUndefined()
  })

  test('同 Workspace 内按规范化路径复用 Project；不同路径同名则新 slug', () => {
    const ws = tempRoot()
    const pathA = join(tempRoot(), 'App')
    mkdirSync(pathA)
    const first = openOrCreateProjectForPath(ws, pathA, accessibleFs())
    const second = openOrCreateProjectForPath(ws, pathA, accessibleFs())
    expect(second.project.id).toBe(first.project.id)
    expect(second.created).toBe(false)

    const pathB = join(tempRoot(), 'App') // 同名不同路径
    mkdirSync(pathB)
    const third = openOrCreateProjectForPath(ws, pathB, accessibleFs())
    expect(third.project.id).not.toBe(first.project.id)
    expect(third.project.slug).not.toBe(first.project.slug)
  })

  test('findProjectByWorkingDirectory 使用比较规范化路径', () => {
    const ws = tempRoot()
    const external = join(tempRoot(), 'repo')
    mkdirSync(external)
    const project = createProject(ws, { name: 'R', workingDirectory: external + '/' })
    const found = findProjectByWorkingDirectory(ws, external, accessibleFs())
    expect(found?.id).toBe(project.id)
  })
})
