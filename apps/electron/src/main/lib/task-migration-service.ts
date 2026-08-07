import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import type { AgentSessionMeta } from '@myyoda/shared'
import {
  listTaskSlugs,
  loadTaskRecord,
  saveTaskRecord,
  taskYamlPath,
} from '@myyoda/shared/tasks/storage'
import type { TaskWorkflow } from '@myyoda/shared/tasks/task-record'

export interface BackfillLegacyTaskRecordsInput {
  workspaceId: string
  workspaceRoot: string
  sessions: readonly AgentSessionMeta[]
  now?: () => number
  generateTaskId?: () => string
  includeLegacyUnscopedSessions?: boolean
}

export interface TaskMigrationItem {
  taskSlug: string
  status: 'migrated' | 'skipped' | 'conflicted'
  taskId?: string
  reason?: string
  candidateSessionIds?: string[]
}

export interface TaskMigrationResult {
  migrated: TaskMigrationItem[]
  skipped: TaskMigrationItem[]
  conflicted: TaskMigrationItem[]
}

function workflowFromSession(session: AgentSessionMeta | undefined): TaskWorkflow {
  if (!session) return 'todo'
  if (session.kanbanColumn === 'done' || session.sessionStatus === 'done') return 'done'
  if (session.sessionStatus === 'needs-review') return 'needs-review'
  if (
    session.kanbanColumn === 'in-progress'
    || session.sessionStatus === 'running'
    || session.sessionStatus === 'in-progress'
  ) {
    return 'in-progress'
  }
  return 'todo'
}

function isOrchestratorCandidate(
  session: AgentSessionMeta,
  taskSlug: string,
  workspaceId: string,
  includeLegacyUnscopedSessions: boolean,
): boolean {
  const workspaceMatches = session.workspaceId === workspaceId
    || (includeLegacyUnscopedSessions && session.workspaceId === undefined)
  return workspaceMatches
    && session.taskSlug === taskSlug
    && !session.parentSessionId
    && !session.taskNodeId
}

function fallbackTimes(workspaceRoot: string, taskSlug: string, now: () => number): { createdAt: number; updatedAt: number } {
  try {
    const stat = statSync(taskYamlPath(workspaceRoot, taskSlug))
    const createdAt = Math.trunc(stat.birthtimeMs || stat.ctimeMs || now())
    return {
      createdAt,
      updatedAt: Math.max(createdAt, Math.trunc(stat.mtimeMs || createdAt)),
    }
  } catch {
    const timestamp = now()
    return { createdAt: timestamp, updatedAt: timestamp }
  }
}

/**
 * 为旧 tasks/<slug>/task.yaml 补充独立 task.json。
 *
 * 该迁移不移动/改写 task.yaml 与 runs；已存在、损坏或高版本 task.json 均不会被覆盖。
 */
export function backfillLegacyTaskRecords(input: BackfillLegacyTaskRecordsInput): TaskMigrationResult {
  const now = input.now ?? Date.now
  const generateTaskId = input.generateTaskId ?? randomUUID
  const result: TaskMigrationResult = { migrated: [], skipped: [], conflicted: [] }

  for (const taskSlug of listTaskSlugs(input.workspaceRoot)) {
    const existing = loadTaskRecord(input.workspaceRoot, taskSlug)
    if (existing.kind === 'valid') {
      result.skipped.push({
        taskSlug,
        status: 'skipped',
        taskId: existing.record.taskId,
        reason: 'task.json 已存在',
      })
      continue
    }
    if (existing.kind !== 'missing') {
      result.conflicted.push({
        taskSlug,
        status: 'conflicted',
        reason: existing.kind === 'unsupported'
          ? `task.json 版本 ${existing.schemaVersion} 高于当前支持范围`
          : existing.message,
      })
      continue
    }

    const candidates = input.sessions
      .filter((session) => isOrchestratorCandidate(
        session,
        taskSlug,
        input.workspaceId,
        input.includeLegacyUnscopedSessions ?? false,
      ))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    const uniqueCandidate = candidates.length === 1 ? candidates[0] : undefined
    const times = uniqueCandidate
      ? { createdAt: uniqueCandidate.createdAt, updatedAt: uniqueCandidate.updatedAt }
      : fallbackTimes(input.workspaceRoot, taskSlug, now)
    const taskId = generateTaskId()

    saveTaskRecord(input.workspaceRoot, {
      schemaVersion: 1,
      taskId,
      slug: taskSlug,
      revision: 1,
      workflow: workflowFromSession(uniqueCandidate),
      labelIds: [],
      ...(uniqueCandidate ? { orchestratorSessionId: uniqueCandidate.id } : {}),
      ...times,
    })

    if (candidates.length > 1) {
      result.conflicted.push({
        taskSlug,
        status: 'conflicted',
        taskId,
        reason: '发现多个 orchestrator Session 候选，已保留空 link 等待人工处理',
        candidateSessionIds: candidates.map((session) => session.id),
      })
    } else {
      result.migrated.push({ taskSlug, status: 'migrated', taskId })
    }
  }

  return result
}
