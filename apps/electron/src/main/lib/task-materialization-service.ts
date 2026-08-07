import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@myyoda/shared'
import type { TaskSpec } from '@myyoda/shared/tasks/schema'
import {
  ensureUniqueTaskSlug,
  saveTaskRecord,
  saveTaskSpec,
  taskDir,
  tasksRoot,
} from '@myyoda/shared/tasks/storage'
import type { AgentSessionMetaUpdates } from './agent-session-manager'
import type { CreateSessionOptions } from './task-runner'

export type TaskMaterializationMode =
  | { kind: 'create'; sessionOptions: CreateSessionOptions }
  | { kind: 'attach' | 'adopt'; sessionId: string; sessionPatch: AgentSessionMetaUpdates }

export interface MaterializeTaskTransactionInput {
  workspaceRoot: string
  workspaceId: string
  spec: TaskSpec
  mode: TaskMaterializationMode
}

export interface TaskMaterializationDependencies {
  createSession(workspaceId: string, options: CreateSessionOptions): Promise<AgentSessionMeta>
  getSession(sessionId: string): AgentSessionMeta | undefined
  updateSession(sessionId: string, patch: AgentSessionMetaUpdates): AgentSessionMeta | Promise<AgentSessionMeta>
  deleteSession(sessionId: string): void
  generateTaskId?: () => string
  generateTransactionId?: () => string
  now?: () => number
  commitTaskDirectory?: (source: string, target: string) => void
}

interface MaterializationJournal {
  schemaVersion: 1
  transactionId: string
  phase: 'prepared' | 'session-linked'
  workspaceId: string
  taskSlug: string
  taskId: string
  mode: TaskMaterializationMode['kind']
  sessionId?: string
  stagedWorkspaceRoot: string
  createdAt: number
}

export interface MaterializationRecoveryResult {
  transactionId: string
  taskSlug: string
  status: 'recovered' | 'already-committed' | 'recovery-required'
  message?: string
}

function transactionRoot(workspaceRoot: string): string {
  return join(tasksRoot(workspaceRoot), '.transactions')
}

function stagingWorkspaceRoot(workspaceRoot: string, transactionId: string): string {
  return join(tasksRoot(workspaceRoot), '.staging', transactionId)
}

function journalPath(workspaceRoot: string, transactionId: string): string {
  return join(transactionRoot(workspaceRoot), `${transactionId}.json`)
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

function writeJournal(workspaceRoot: string, journal: MaterializationJournal): void {
  atomicWriteJson(journalPath(workspaceRoot, journal.transactionId), journal)
}

function cleanupTransaction(workspaceRoot: string, transactionId: string): void {
  rmSync(journalPath(workspaceRoot, transactionId), { force: true })
  rmSync(stagingWorkspaceRoot(workspaceRoot, transactionId), { recursive: true, force: true })
}

function restoreSessionPatch(session: AgentSessionMeta): AgentSessionMetaUpdates {
  return {
    taskSlug: session.taskSlug,
    projectId: session.projectId,
    workingDirectory: session.workingDirectory,
    modelId: session.modelId,
    channelId: session.channelId,
    permissionMode: session.permissionMode,
    taskDraft: session.taskDraft,
    sessionStatus: session.sessionStatus,
  }
}

/** Create/attach/adopt 共用的可恢复 Task 物化事务。 */
export async function materializeTaskTransaction(
  input: MaterializeTaskTransactionInput,
  deps: TaskMaterializationDependencies,
): Promise<{ slug: string; taskId: string; orchestratorSessionId: string }> {
  const generateTaskId = deps.generateTaskId ?? randomUUID
  const generateTransactionId = deps.generateTransactionId ?? randomUUID
  const now = deps.now ?? Date.now
  const commit = deps.commitTaskDirectory ?? renameSync
  const uniqueSlug = ensureUniqueTaskSlug(input.workspaceRoot, input.spec.id)
  const finalSpec = uniqueSlug === input.spec.id ? input.spec : { ...input.spec, id: uniqueSlug }
  const transactionId = generateTransactionId()
  const taskId = generateTaskId()
  const stageRoot = stagingWorkspaceRoot(input.workspaceRoot, transactionId)
  const initialJournal: MaterializationJournal = {
    schemaVersion: 1,
    transactionId,
    phase: 'prepared',
    workspaceId: input.workspaceId,
    taskSlug: uniqueSlug,
    taskId,
    mode: input.mode.kind,
    stagedWorkspaceRoot: stageRoot,
    createdAt: now(),
  }

  saveTaskSpec(stageRoot, finalSpec)
  saveTaskRecord(stageRoot, {
    schemaVersion: 1,
    taskId,
    slug: uniqueSlug,
    revision: 1,
    workflow: 'todo',
    labelIds: [],
    createdAt: initialJournal.createdAt,
    updatedAt: initialJournal.createdAt,
  })
  writeJournal(input.workspaceRoot, initialJournal)

  let sessionId: string | undefined
  let createdSession = false
  let originalSession: AgentSessionMeta | undefined
  try {
    if (input.mode.kind === 'create') {
      const created = await deps.createSession(input.workspaceId, {
        ...input.mode.sessionOptions,
        name: finalSpec.title,
        projectId: finalSpec.project,
        taskSlug: uniqueSlug,
      })
      sessionId = created.id
      createdSession = true
    } else {
      originalSession = deps.getSession(input.mode.sessionId)
      if (!originalSession) throw new Error(`Agent 会话不存在: ${input.mode.sessionId}`)
      sessionId = input.mode.sessionId
      await deps.updateSession(sessionId, {
        ...input.mode.sessionPatch,
        taskSlug: uniqueSlug,
      })
    }

    saveTaskRecord(stageRoot, {
      schemaVersion: 1,
      taskId,
      slug: uniqueSlug,
      revision: 1,
      workflow: 'todo',
      labelIds: [],
      orchestratorSessionId: sessionId,
      createdAt: initialJournal.createdAt,
      updatedAt: now(),
    })
    const linkedJournal: MaterializationJournal = { ...initialJournal, phase: 'session-linked', sessionId }
    writeJournal(input.workspaceRoot, linkedJournal)

    const target = taskDir(input.workspaceRoot, uniqueSlug)
    if (existsSync(target)) throw new Error(`Task 目录已存在，拒绝覆盖: ${uniqueSlug}`)
    commit(taskDir(stageRoot, uniqueSlug), target)
    cleanupTransaction(input.workspaceRoot, transactionId)
    return { slug: uniqueSlug, taskId, orchestratorSessionId: sessionId }
  } catch (error) {
    let compensationFailed = false
    try {
      if (createdSession && sessionId) deps.deleteSession(sessionId)
      else if (originalSession && sessionId) await deps.updateSession(sessionId, restoreSessionPatch(originalSession))
    } catch {
      compensationFailed = true
    }
    if (!compensationFailed) cleanupTransaction(input.workspaceRoot, transactionId)
    throw error
  }
}

/** 启动时完成已经 session-linked 的原子提交；不猜测缺少 staging/session 的事务。 */
export function recoverTaskMaterializations(
  workspaceRoot: string,
  deps: Pick<TaskMaterializationDependencies, 'commitTaskDirectory'>,
): MaterializationRecoveryResult[] {
  const root = transactionRoot(workspaceRoot)
  if (!existsSync(root)) return []
  const commit = deps.commitTaskDirectory ?? renameSync
  const results: MaterializationRecoveryResult[] = []
  for (const file of readdirSync(root).filter((name) => name.endsWith('.json'))) {
    const path = join(root, file)
    try {
      const journal = JSON.parse(readFileSync(path, 'utf8')) as MaterializationJournal
      const source = taskDir(journal.stagedWorkspaceRoot, journal.taskSlug)
      const target = taskDir(workspaceRoot, journal.taskSlug)
      if (existsSync(target)) {
        cleanupTransaction(workspaceRoot, journal.transactionId)
        results.push({ transactionId: journal.transactionId, taskSlug: journal.taskSlug, status: 'already-committed' })
      } else if (journal.phase === 'session-linked' && existsSync(source)) {
        commit(source, target)
        cleanupTransaction(workspaceRoot, journal.transactionId)
        results.push({ transactionId: journal.transactionId, taskSlug: journal.taskSlug, status: 'recovered' })
      } else {
        results.push({
          transactionId: journal.transactionId,
          taskSlug: journal.taskSlug,
          status: 'recovery-required',
          message: '事务缺少已绑定 Session 或 staging Task，未自动猜测',
        })
      }
    } catch (error) {
      results.push({
        transactionId: file.replace(/\.json$/, ''),
        taskSlug: 'unknown',
        status: 'recovery-required',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
