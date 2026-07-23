import { describe, expect, test } from 'bun:test'
import {
  allowsSkipProject,
  buildPickerSections,
  clampDiscoveryDepth,
  shouldHonorBrowseRequest,
  type PickerProject,
  type DiscoveredRepo,
} from '../project-context-picker-model.ts'

const projects: PickerProject[] = [
  { id: 'p1', name: 'Alpha', workingDirectory: '/repos/alpha', updatedAt: '2026-07-20T10:00:00.000Z' },
  { id: 'p2', name: 'Beta', workingDirectory: '/repos/beta', updatedAt: '2026-07-21T10:00:00.000Z' },
  { id: 'p3', name: 'Archived', workingDirectory: '/repos/old', updatedAt: '2026-07-01T10:00:00.000Z', archivedAt: '2026-07-10T00:00:00.000Z' },
]

describe('project-context-picker-model', () => {
  test('allowsSkipProject：会话可跳过，任务不可', () => {
    expect(allowsSkipProject('session')).toBe(true)
    expect(allowsSkipProject('task')).toBe(false)
  })

  test('clampDiscoveryDepth：默认 3，限制 1–5', () => {
    expect(clampDiscoveryDepth(undefined)).toBe(3)
    expect(clampDiscoveryDepth(0)).toBe(1)
    expect(clampDiscoveryDepth(9)).toBe(5)
    expect(clampDiscoveryDepth(2)).toBe(2)
  })

  test('session 分区含无项目；task 不含', () => {
    const session = buildPickerSections({
      mode: 'session',
      projects,
      recentProjectIds: ['p2'],
      discovered: [],
      scanRoots: ['/work'],
    })
    expect(session.actions.map((a) => a.id)).toContain('skip')
    expect(session.recents.map((p) => p.id)).toEqual(['p2'])
    expect(session.existing.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(session.discovery.needsScanRootGuide).toBe(false)

    const task = buildPickerSections({
      mode: 'task',
      projects,
      recentProjectIds: ['p2'],
      discovered: [],
      scanRoots: ['/work'],
    })
    expect(task.actions.map((a) => a.id)).not.toContain('skip')
  })

  test('无扫描根时发现区空并引导添加', () => {
    const sections = buildPickerSections({
      mode: 'session',
      projects,
      recentProjectIds: [],
      discovered: [{ path: '/x', name: 'x' }],
      scanRoots: [],
    })
    expect(sections.discovery.items).toEqual([])
    expect(sections.discovery.needsScanRootGuide).toBe(true)
  })

  test('发现项排除已绑定 workingDirectory 的项目路径', () => {
    const discovered: DiscoveredRepo[] = [
      { path: '/repos/alpha', name: 'alpha' },
      { path: '/repos/gamma', name: 'gamma' },
    ]
    const sections = buildPickerSections({
      mode: 'session',
      projects,
      recentProjectIds: [],
      discovered,
      scanRoots: ['/repos'],
    })
    expect(sections.discovery.items.map((item) => item.path)).toEqual(['/repos/gamma'])
  })

  test('shouldHonorBrowseRequest：挂载时不回放历史 token', () => {
    const mounted = shouldHonorBrowseRequest({ browseRequest: 3, baseline: null })
    expect(mounted.honor).toBe(false)
    expect(mounted.nextBaseline).toBe(3)

    const same = shouldHonorBrowseRequest({ browseRequest: 3, baseline: 3 })
    expect(same.honor).toBe(false)

    const bumped = shouldHonorBrowseRequest({ browseRequest: 4, baseline: 3 })
    expect(bumped.honor).toBe(true)
    expect(bumped.nextBaseline).toBe(4)

    const zero = shouldHonorBrowseRequest({ browseRequest: 0, baseline: 3 })
    expect(zero.honor).toBe(false)
    expect(zero.nextBaseline).toBe(0)
  })
})
