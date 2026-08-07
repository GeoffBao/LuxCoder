import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSessionMeta, ProjectDeleteImpact, TaskDeleteImpact } from '@myyoda/shared'
import {
  getProjectWorkdirPath,
} from '@myyoda/shared/projects/storage'
import {
  listResumableRuns,
  listRunIds,
  listTaskSlugs,
  loadTaskRecord,
  loadTaskSpec,
} from '@myyoda/shared/tasks/storage'
import type { ProjectAsset, ProjectConfig } from '@myyoda/shared/projects'

function countProjectSessions(
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
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

  const activeRuns = listResumableRuns(workspaceRoot)
  const activeRunSlugs = new Set(activeRuns.map((run) => run.slug))
  let taskCount = 0
  let runCount = 0
  let activeRunCount = 0
  for (const slug of slugs) {
    const loaded = loadTaskSpec(workspaceRoot, slug)
    if (!loaded?.spec || loaded.spec.project !== projectId) continue
    taskCount += 1
    runCount += listRunIds(workspaceRoot, slug).length
    const taskActiveRunCount = activeRuns.filter((run) => run.slug === slug).length
    activeRunCount += taskActiveRunCount
    if (activeRunSlugs.has(slug)) activeRunTaskSlugs.push(slug)
  }

  if (taskCount > 0) {
    blockers.push(`${taskCount} 个关联 Task 仍引用该 Project；请先移动或归档这些 Task`)
  }
  if (activeRunTaskSlugs.length > 0) {
    blockers.push(`${activeRunTaskSlugs.length} 个 Task 仍有活跃 Run；必须先停止或完成运行`)
  }

  const sessionCount = countProjectSessions(projectId, sessions)
  if (sessionCount > 0) {
    blockers.push(`${sessionCount} 个关联会话仍引用该 Project；请先移动这些会话`)
  }
  const hasManagedWorkdir = !project.workingDirectory?.trim()
    && isDirectory(getProjectWorkdirPath(workspaceRoot, project.slug))

  return {
    taskCount,
    runCount,
    activeRunCount,
    activeRunTaskSlugs,
    sessionCount,
    assetCount: countProjectAssets(workspaceRoot, project.slug),
    hasKnowledge: hasProjectKnowledge(workspaceRoot, project.slug),
    hasManagedWorkdir,
    blockers,
    canPurge: taskCount === 0 && sessionCount === 0 && activeRunTaskSlugs.length === 0,
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
  const record = loadTaskRecord(workspaceRoot, taskSlug)
  const orchestratorSessionId = record.kind === 'valid' ? record.record.orchestratorSessionId : undefined
  const taskSessions = sessions.filter(
    (session) => session.taskSlug === taskSlug || session.id === orchestratorSessionId,
  )

  const runCount = listRunIds(workspaceRoot, taskSlug).length
  const activeRunCount = listResumableRuns(workspaceRoot)
    .filter((run) => run.slug === taskSlug)
    .length

  if (runCount > 0) {
    blockers.push(`${runCount} 个 Run 记录将被永久删除`)
  }
  if (taskSessions.length > 0) {
    blockers.push(`${taskSessions.length} 个关联会话的 taskSlug/taskRunId 引用将失效（会话本身不会被删除）`)
  }

  return {
    runCount,
    activeRunCount,
    sessionCount: taskSessions.length,
    blockers,
    canPurge: true, // User can always choose to purge with warnings
  }
}
