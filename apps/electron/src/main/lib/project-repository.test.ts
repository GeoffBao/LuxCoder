import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectRepository } from './project-repository'

const tempRoots: string[] = []

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxagents-main-project-repo-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function createRepository(workspaceRoots: Record<string, string>): ProjectRepository {
  return new ProjectRepository({
    resolveWorkspaceRoot(workspaceId) {
      const root = workspaceRoots[workspaceId]
      if (!root) {
        throw new Error(`未知工作区: ${workspaceId}`)
      }
      return root
    },
  })
}

describe('ProjectRepository', () => {
  test('按 workspaceId 隔离项目列表和读取结果', () => {
    const workspaceAlpha = createTempWorkspaceRoot()
    const workspaceBeta = createTempWorkspaceRoot()
    const repository = createRepository({
      'ws-alpha': workspaceAlpha,
      'ws-beta': workspaceBeta,
    })

    const alpha = repository.createProject('ws-alpha', { name: 'Same Name' })
    const beta = repository.createProject('ws-beta', { name: 'Same Name' })

    expect(alpha.slug).toBe('same-name')
    expect(beta.slug).toBe('same-name')
    expect(repository.listProjects('ws-alpha').map((project) => project.config.slug)).toEqual(['same-name'])
    expect(repository.listProjects('ws-beta').map((project) => project.config.slug)).toEqual(['same-name'])
    expect(repository.getProject('ws-alpha', alpha.slug)?.workspaceRootPath).toBe(workspaceAlpha)
    expect(repository.getProject('ws-beta', beta.slug)?.workspaceRootPath).toBe(workspaceBeta)
  })

  test('拒绝非法 project slug 输入', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })

    expect(() => repository.getProject('ws-alpha', '../escape')).toThrow(/slug/i)
    expect(() => repository.updateProject('ws-alpha', '../escape', { name: 'bad' })).toThrow(/slug/i)
    expect(() => repository.deleteProject('ws-alpha', '../escape')).toThrow(/slug/i)
  })

  test('通过 Shared storage 读写项目、资产和 Memory', () => {
    const repository = createRepository({ 'ws-alpha': createTempWorkspaceRoot() })

    const created = repository.createProject('ws-alpha', {
      name: 'Proma',
      description: 'bounded slice',
    })

    repository.writeProjectMemory('ws-alpha', created.slug, '# MEMORY\n- note')
    const asset = repository.uploadProjectAsset('ws-alpha', created.slug, {
      filename: 'brief.md',
      text: 'task brief',
    })
    const updated = repository.updateProject('ws-alpha', created.slug, {
      description: 'updated',
    })

    expect(repository.readProjectMemory('ws-alpha', created.slug)).toBe('# MEMORY\n- note')
    expect(repository.listProjectAssets('ws-alpha', created.slug)).toEqual([
      expect.objectContaining({
        filename: 'brief.md',
        absolutePath: asset.absolutePath,
      }),
    ])
    expect(updated.description).toBe('updated')

    repository.deleteProject('ws-alpha', created.slug)
    expect(repository.getProject('ws-alpha', created.slug)).toBeNull()
  })
})
