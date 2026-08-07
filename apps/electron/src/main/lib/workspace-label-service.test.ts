import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  WorkspaceLabelService,
  assertValidWorkspaceLabelIds,
  loadWorkspaceLabelConfig,
  workspaceLabelsConfigPath,
} from './workspace-label-service'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'myyoda-labels-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const LABEL_ID = '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72'

describe('WorkspaceLabelService', () => {
  test('missing config is an empty read-only projection and does not write on list', () => {
    const root = tempRoot()
    const service = new WorkspaceLabelService(root)
    expect(service.list()).toEqual([])
    expect(loadWorkspaceLabelConfig(root).kind).toBe('missing')
    expect(existsSync(workspaceLabelsConfigPath(root))).toBe(false)
  })

  test('creates an atomically persisted stable label in the selected Workspace only', () => {
    const rootA = tempRoot()
    const rootB = tempRoot()
    const service = new WorkspaceLabelService(rootA, { now: () => 10, generateId: () => LABEL_ID })
    expect(service.create({ name: 'Urgent', color: '#ff5500' })).toEqual({
      id: LABEL_ID,
      name: 'Urgent',
      color: '#ff5500',
      createdAt: 10,
      updatedAt: 10,
    })
    expect(new WorkspaceLabelService(rootA).list()).toHaveLength(1)
    expect(new WorkspaceLabelService(rootB).list()).toEqual([])
    expect(readdirSync(dirname(workspaceLabelsConfigPath(rootA))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('name uniqueness is case-insensitive across active and archived labels', () => {
    const root = tempRoot()
    let id = 0
    const service = new WorkspaceLabelService(root, {
      now: () => 10,
      generateId: () => id++ === 0 ? LABEL_ID : '118f47a8-6c26-7a13-9bf6-7c8d4f2e4c73',
    })
    const created = service.create({ name: 'Urgent' })
    service.archive(created.id)
    expect(() => service.create({ name: ' urgent ' })).toThrow('Label 名称已存在')
  })

  test('rename/color/archive preserve the stable id; default list hides archived', () => {
    const root = tempRoot()
    let now = 1
    const service = new WorkspaceLabelService(root, { now: () => now++, generateId: () => LABEL_ID })
    const created = service.create({ name: 'Idea', color: '#112233' })
    const renamed = service.update(created.id, { name: 'Research', color: null })
    expect(renamed).toEqual(expect.objectContaining({ id: LABEL_ID, name: 'Research', updatedAt: 2 }))
    expect(renamed.color).toBeUndefined()
    const archived = service.archive(created.id)
    expect(archived).toEqual(expect.objectContaining({ id: LABEL_ID, archivedAt: 3 }))
    expect(service.list()).toEqual([])
    expect(service.list({ includeArchived: true })).toEqual([archived])
  })

  test('assignment validation accepts active local labels and rejects archived, unknown, or cross-workspace IDs', () => {
    const rootA = tempRoot()
    const rootB = tempRoot()
    const active = new WorkspaceLabelService(rootA, { now: () => 10, generateId: () => LABEL_ID }).create({ name: 'Active' })
    const archived = new WorkspaceLabelService(rootA, {
      now: () => 20,
      generateId: () => '118f47a8-6c26-7a13-9bf6-7c8d4f2e4c73',
    }).create({ name: 'Archived' })
    new WorkspaceLabelService(rootA).archive(archived.id)
    const foreign = new WorkspaceLabelService(rootB, {
      now: () => 30,
      generateId: () => '218f47a8-6c26-7a13-9bf6-7c8d4f2e4c74',
    }).create({ name: 'Foreign' })

    expect(assertValidWorkspaceLabelIds(rootA, [active.id, active.id])).toEqual([active.id])
    expect(() => assertValidWorkspaceLabelIds(rootA, [archived.id])).toThrow(/归档/)
    expect(() => assertValidWorkspaceLabelIds(rootA, ['unknown'])).toThrow(/不存在/)
    expect(() => assertValidWorkspaceLabelIds(rootA, [foreign.id])).toThrow(/不存在/)
  })

  test('invalid or future config is never overwritten by a mutation', () => {
    const root = tempRoot()
    const path = workspaceLabelsConfigPath(root)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{ broken', 'utf8')
    const brokenBefore = readFileSync(path, 'utf8')
    expect(() => new WorkspaceLabelService(root).create({ name: 'Nope' })).toThrow('损坏，拒绝覆盖')
    expect(readFileSync(path, 'utf8')).toBe(brokenBefore)

    writeFileSync(path, JSON.stringify({ schemaVersion: 99, labels: [] }), 'utf8')
    expect(() => new WorkspaceLabelService(root).create({ name: 'Nope' })).toThrow('高于当前客户端支持范围')
    expect(JSON.parse(readFileSync(path, 'utf8')).schemaVersion).toBe(99)
  })
})
