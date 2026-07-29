import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { listTaskSlugs, loadTaskSpec } from '@luxcoder/shared/tasks/storage'
import type { ProjectAsset, ProjectConfig } from '@luxcoder/shared/projects'

export interface ProjectDeleteImpact {
  taskCount: number
  /** Tasks with active (unresolved) runs that would be orphaned */
  activeRunTaskSlugs: string[]
  sessionCount: number
  assetCount: number
  hasKnowledge: boolean
  /** Whether the project workdir is actively managed */
  hasManagedWorkdir: boolean
  /** Blockers that prevent purge (active runs, etc.) */
  blockers: string[]
  canPurge: boolean
}

export interface TaskDeleteImpact {
  runCount: number
  activeRunCount: number
  sessionCount: number
  canPurge: boolean
  blockers: string[]
}

function countProjectSessions(
  workspaceRoot: string,
  projectId: string,
  sessions: readonly AgentSessionMeta[],
): number {
  return sessions.filter((s) => s.projectId === projectId && !s.taskDraft).length
}

function countProjectAssets(workspaceRoot: string, slug: string): number {
  const dir = join(workspaceRoot, 'projects', slug, 'assets')
  if (!existsSync(dir)) return 0
  try {
    return readdirSync(dir).filter((name) => name !== '.gitkeep').length
  } catch {
    return 0
  }
}

function hasProjectKnowledge(workspaceRoot: string, slug: string): boolean {
  return existsSync(join(workspaceRoot, 'projects', slug, 'MEMORY.md'))
}

/**
 * Analyze the impact of deleting/archiving a project.
 * Does NOT perform any mutations.
 */
export function analyzeProjectDeleteImpact(
  workspaceRoot: string,
  project: ProjectConfig,
  sessions: readonly AgentSessionMeta[],
  allSlugs?: string[],
): ProjectDeleteImpact {
  const slugs = allSlugs ?? listTaskSlugs(workspaceRoot)
  const projectId = project.id
  const blockers: string[] = []
  const activeRunTaskSlugs: string[] = []

  let taskCount = 0
  for (const slug of slugs) {
    const loaded = loadTaskSpec(workspaceRoot, slug)
    if (!loaded?.spec || loaded.spec.project !== projectId) continue
    taskCount += 1
    // Check for active runs
    const runsDir = join(workspaceRoot, 'tasks', slug, 'runs')
    if (existsSync(runsDir)) {
      try {
        const runIds = readdirSync(runsDir)
        if (runIds.length > 0) activeRunTaskSlugs.push(slug)
      } catch { /* ignore */ }
    }
  }

  if (activeRunTaskSlugs.length > 0) {
    blockers.push(`${activeRunTaskSlugs.length} 个 Task 仍有 Run 记录（归档后仍可查看，但永久删除会失去历史）`)
  }

  const sessionCount = countProjectSessions(workspaceRoot, projectId, sessions)
  const hasManagedWorkdir = Boolean(project.workingDirectory)

  return {
    taskCount,
    activeRunTaskSlugs,
    sessionCount,
    assetCount: countProjectAssets(workspaceRoot, project.slug),
    hasKnowledge: hasProjectKnowledge(workspaceRoot, project.slug),
    hasManagedWorkdir,
    blockers,
    canPurge: activeRunTaskSlugs.length === 0,
  }
}

/**
 * Analyze the impact of permanently deleting a single Task.
 */
export function analyzeTaskDeleteImpact(
  workspaceRoot: string,
  taskSlug: string,
  sessions: readonly AgentSessionMeta[],
): TaskDeleteImpact {
  const blockers: string[] = []
  const taskSessions = sessions.filter(
    (s) => s.taskSlug === taskSlug || s.id === sessions.find((t) => t.taskSlug === taskSlug)?.id,
  )

  let runCount = 0
  const runsDir = join(workspaceRoot, 'tasks', taskSlug, 'runs')
  if (existsSync(runsDir)) {
    try {
      runCount = readdirSync(runsDir).length
    } catch { /* ignore */ }
  }

  if (runCount > 0) {
    blockers.push(`${runCount} 个 Run 记录将被永久删除`)
  }
  if (taskSessions.length > 0) {
    blockers.push(`${taskSessions.length} 个关联会话的 taskSlug/taskRunId 引用将失效（会话本身不会被删除）`)
  }

  return {
    runCount,
    activeRunCount: 0, // Requires live runner state; v1 only counts directory entries
    sessionCount: taskSessions.length,
    blockers,
    canPurge: true, // User can always choose to purge with warnings
  }
}
