import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveTaskSpec } from '@luxcoder/shared/tasks/storage'
import type { TaskSpec } from '@luxcoder/shared/tasks/schema'
import type { ProjectConfig } from '@luxcoder/shared/projects'
import { analyzeProjectDeleteImpact, analyzeTaskDeleteImpact } from './project-impact-service'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxcoder-impact-'))
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

  test('project with tasks and runs reports blockers', () => {
    const root = tempRoot()
    const project: ProjectConfig = { id: 'proj2', slug: 'proj2', name: 'P2', createdAt: 1, updatedAt: 1 }
    saveTaskSpec(root, buildSpec('task-a', 'proj2'))
    // Create a fake run directory
    mkdirSync(join(root, 'tasks', 'task-a', 'runs', 'run-1'), { recursive: true })

    const impact = analyzeProjectDeleteImpact(root, project, [])
    expect(impact.taskCount).toBe(1)
    expect(impact.activeRunTaskSlugs).toHaveLength(1)
    expect(impact.canPurge).toBe(false)
  })

  test('task delete impact counts runs and sessions', () => {
    const root = tempRoot()
    saveTaskSpec(root, buildSpec('task-x'))
    mkdirSync(join(root, 'tasks', 'task-x', 'runs', 'run-1'), { recursive: true })
    mkdirSync(join(root, 'tasks', 'task-x', 'runs', 'run-2'), { recursive: true })

    const impact = analyzeTaskDeleteImpact(root, 'task-x', [
      { id: 's1', title: 'S1', taskSlug: 'task-x', taskRunId: 'run-1', createdAt: 1, updatedAt: 1 },
    ])
    expect(impact.runCount).toBe(2)
    expect(impact.sessionCount).toBe(1)
    expect(impact.blockers.length).toBeGreaterThan(0)
  })
})
