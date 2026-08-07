import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendRunLog, saveTaskRecord, saveTaskSpec } from '@myyoda/shared/tasks/storage'
import type { TaskSpec } from '@myyoda/shared/tasks/schema'
import type { ProjectConfig } from '@myyoda/shared/projects'
import { analyzeProjectDeleteImpact, analyzeTaskDeleteImpact } from './project-impact-service'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'myyoda-impact-'))
  roots.push(root)
  return root
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function buildSpec(id: string, project?: string): TaskSpec {
  return {
    id,
    title: `Task ${id}`,
    goal: 'Test',
    runner: 'conduct',
    nodes: [{ id: 'n1', kind: 'session', prompt: 'x' }],
    ...(project ? { project } : {}),
  }
}

describe('project-impact-service', () => {
  test('idle project with no tasks reports clean purge', () => {
    const root = tempRoot()
    const project: ProjectConfig = {
      id: 'proj1',
      slug: 'proj1',
      name: 'Proj 1',
      createdAt: 1,
      updatedAt: 1,
    }
    const impact = analyzeProjectDeleteImpact(root, project, [], [])
    expect(impact).toEqual(expect.objectContaining({
      taskCount: 0,
      sessionCount: 0,
      canPurge: true,
    }))
  })

  test('historical run directories are not active, but referenced Tasks still block Project purge', () => {
    const root = tempRoot()
    const project: ProjectConfig = { id: 'proj2', slug: 'proj2', name: 'P2', createdAt: 1, updatedAt: 1 }
    saveTaskSpec(root, buildSpec('task-a', 'proj2'))
    mkdirSync(join(root, 'tasks', 'task-a', 'runs', 'run-1'), { recursive: true })

    const impact = analyzeProjectDeleteImpact(root, project, [])
    expect(impact.taskCount).toBe(1)
    expect(impact.runCount).toBe(1)
    expect(impact.activeRunCount).toBe(0)
    expect(impact.activeRunTaskSlugs).toEqual([])
    expect(impact.canPurge).toBe(false)
    expect(impact.blockers.join(' ')).toMatch(/关联 Task/)
  })

  test('resumable runs are reported as active blockers separately from history', () => {
    const root = tempRoot()
    const project: ProjectConfig = { id: 'proj2', slug: 'proj2', name: 'P2', createdAt: 1, updatedAt: 1 }
    saveTaskSpec(root, buildSpec('task-a', 'proj2'))
    appendRunLog(root, 'task-a', 'run-active', {
      t: '2026-07-29T00:00:00.000Z',
      kind: 'run-started',
      taskId: 'task-a',
      runId: 'run-active',
    })

    const impact = analyzeProjectDeleteImpact(root, project, [])
    expect(impact.runCount).toBe(1)
    expect(impact.activeRunCount).toBe(1)
    expect(impact.activeRunTaskSlugs).toEqual(['task-a'])
    expect(impact.canPurge).toBe(false)
  })

  test('only the internal project workdir is managed; configured external cwd is not', () => {
    const root = tempRoot()
    const managed = analyzeProjectDeleteImpact(root, {
      id: 'managed', slug: 'managed', name: 'Managed', createdAt: 1, updatedAt: 1,
    }, [], [])
    const external = analyzeProjectDeleteImpact(root, {
      id: 'external', slug: 'external', name: 'External', workingDirectory: '/tmp/external', createdAt: 1, updatedAt: 1,
    }, [], [])

    expect(managed.hasManagedWorkdir).toBe(false)
    expect(external.hasManagedWorkdir).toBe(false)

    mkdirSync(join(root, 'projects', 'managed'), { recursive: true })
    writeFileSync(join(root, 'projects', 'managed', 'workdir'), 'not a directory')
    expect(analyzeProjectDeleteImpact(root, {
      id: 'managed', slug: 'managed', name: 'Managed', createdAt: 1, updatedAt: 1,
    }, [], []).hasManagedWorkdir).toBe(false)
  })

  test('task delete impact counts runs and sessions', () => {
    const root = tempRoot()
    saveTaskSpec(root, buildSpec('task-x'))
    mkdirSync(join(root, 'tasks', 'task-x', 'runs', 'run-1'), { recursive: true })
    mkdirSync(join(root, 'tasks', 'task-x', 'runs', 'run-2'), { recursive: true })

    saveTaskRecord(root, {
      schemaVersion: 1,
      taskId: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
      slug: 'task-x',
      revision: 1,
      workflow: 'todo',
      labelIds: [],
      orchestratorSessionId: 'orchestrator-x',
      createdAt: 1,
      updatedAt: 1,
    })
    const impact = analyzeTaskDeleteImpact(root, 'task-x', [
      { id: 'orchestrator-x', title: 'Orchestrator', createdAt: 1, updatedAt: 1 },
      { id: 's1', title: 'S1', taskSlug: 'task-x', taskRunId: 'run-1', createdAt: 1, updatedAt: 1 },
      { id: 'unrelated', title: 'Other', taskSlug: 'other-task', createdAt: 1, updatedAt: 1 },
    ])
    expect(impact.runCount).toBe(2)
    expect(impact.sessionCount).toBe(2)
    expect(impact.blockers.length).toBeGreaterThan(0)
  })
})
