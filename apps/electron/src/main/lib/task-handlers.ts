/**
 * Projects、Tasks 与 Session Kanban IPC handler 注册。
 *
 * 这里是 Electron 主进程与本地文件存储、TaskRunner、Agent 编排器之间的薄桥接层。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { basename } from 'node:path'
import {
  PROJECT_IPC_CHANNELS,
  SESSION_COMMAND_CHANNEL,
  TASK_IPC_CHANNELS,
  TEAMBITION_IPC_CHANNELS,
} from '@luxagents/shared/channels'
import type {
  CreateProjectInput,
  AgentSessionMeta,
  ProjectsChangedEventPayload,
  SessionKanbanCommand,
  TaskContractIssue,
  TaskGeneratedEventPayload,
  UpdateProjectInput,
  UploadProjectAssetInput,
  WorkPhase,
} from '@luxagents/shared'
import {
  createProject,
  deleteProject,
  deleteProjectAsset,
  listProjectAssets,
  loadProject,
  loadProjectById,
  loadWorkspaceProjects,
  readProjectMemory,
  updateProject,
  uploadProjectAsset,
  writeProjectMemory,
} from '@luxagents/shared/projects/storage'
import {
  buildGeneratorPrompt,
  buildRepairPrompt,
} from '@luxagents/shared/tasks'
import {
  listTaskSlugs,
  loadTaskSpec,
  parseTaskYaml,
  readRunLog,
  readRunSpecSnapshot,
  listRunIds,
  saveTaskSpec,
} from '@luxagents/shared/tasks/storage'
import { createLuxAgentsConductorSessionHost, type LuxAgentsConductorSessionHost } from './conductor-session-host'
import { getAgentSessionMeta, updateAgentSessionMeta } from './agent-session-manager'
import { TaskRunner, type RunOptions } from './task-runner'

const GENERATE_TIMEOUT_MS = 180_000

let handlersRegistered = false
let mainWindow: BrowserWindow | null = null
let sessionHostPromise: Promise<LuxAgentsConductorSessionHost> | undefined

const runners = new Map<string, TaskRunner>()

export interface TaskRunnerController {
  pause(slug: string, runId: string): void
  stop(slug: string, runId: string): Promise<void>
}

type TaskRunnerResolver = (workspaceRoot: string, workspaceId: string) => Promise<TaskRunnerController>

export async function pauseTaskRun(
  resolveRunner: TaskRunnerResolver,
  workspaceRoot: string,
  workspaceId: string,
  slug: string,
  runId: string,
): Promise<void> {
  (await resolveRunner(workspaceRoot, workspaceId)).pause(slug, runId)
}

export async function stopTaskRun(
  resolveRunner: TaskRunnerResolver,
  workspaceRoot: string,
  workspaceId: string,
  slug: string,
  runId: string,
): Promise<void> {
  await (await resolveRunner(workspaceRoot, workspaceId)).stop(slug, runId)
}

function getSessionHost(): Promise<LuxAgentsConductorSessionHost> {
  sessionHostPromise ??= createLuxAgentsConductorSessionHost()
  return sessionHostPromise
}

async function getRunnerFor(workspaceRoot: string, workspaceId: string): Promise<TaskRunner> {
  const existing = runners.get(workspaceId)
  if (existing) return existing

  const runner = new TaskRunner({
    host: await getSessionHost(),
    workspaceId,
    workspaceRoot,
  })
  runners.set(workspaceId, runner)
  return runner
}

function workspaceIdFor(workspaceRoot: string): string {
  return basename(workspaceRoot)
}

function loadProjectOrThrow(workspaceRoot: string, slug: string): NonNullable<ReturnType<typeof loadProject>> {
  const project = loadProject(workspaceRoot, slug)
  if (!project) throw new Error(`项目创建或更新后无法重新加载: ${slug}`)
  return project
}

function sendToMainWindow(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function broadcastProjectsChanged(workspaceRoot: string, workspaceId: string): void {
  const payload: ProjectsChangedEventPayload = {
    kind: 'projects:changed',
    workspaceId,
    projects: loadWorkspaceProjects(workspaceRoot),
  }
  sendToMainWindow(PROJECT_IPC_CHANNELS.CHANGED, payload)
}

function toTaskIssues(errors: Array<{ path?: string; message: string }> | undefined): TaskContractIssue[] {
  return (errors ?? []).map((error) => ({
    ...(error.path ? { path: error.path } : {}),
    message: error.message,
  }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface AdoptableTaskSpec {
  id: string
  project?: string
}

/** 生成草稿转正时清除隐藏标记，并把尚未运行的任务放回待办状态。 */
export function buildAdoptedTaskSessionPatch(
  spec: AdoptableTaskSpec,
): Pick<AgentSessionMeta, 'taskSlug' | 'projectId' | 'taskDraft' | 'sessionStatus'> {
  return {
    taskSlug: spec.id,
    ...(spec.project ? { projectId: spec.project } : {}),
    taskDraft: undefined,
    sessionStatus: 'todo',
  }
}

type AgentSessionMetaUpdater = (
  sessionId: string,
  updates: Pick<AgentSessionMeta, 'kanbanColumn'>,
) => AgentSessionMeta

/** 将看板列持久化，并把更新后的会话返回给渲染进程。 */
export function setSessionKanbanColumn(
  sessionId: string,
  column: string | null,
  updateSession: AgentSessionMetaUpdater = updateAgentSessionMeta,
): AgentSessionMeta {
  return updateSession(sessionId, { kanbanColumn: column ?? undefined })
}

/** 保持 validate 与 tasks.get 使用相同的完整验证结果形状。 */
export function buildTaskValidationPayload(result: ReturnType<typeof parseTaskYaml>): ReturnType<typeof parseTaskYaml> {
  return {
    valid: result.valid,
    errors: result.errors ?? [],
    warnings: result.warnings ?? [],
    ...(result.spec ? { spec: result.spec } : {}),
  }
}

/** 通过 Host 的完成事件等待一轮生成，避免悬挂监听器和未等待的 Agent 请求。 */
async function sendGenerationPrompt(
  host: LuxAgentsConductorSessionHost,
  sessionId: string,
  prompt: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = host.onSessionComplete((event) => {
      if (event.sessionId !== sessionId || settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      unsubscribe()
      if (event.reason === 'error') {
        reject(new Error('Agent 生成 task.yaml 失败'))
        return
      }
      resolve(event.finalText ?? host.getSessionFinalText(sessionId) ?? '')
    })

    timeout = setTimeout(() => {
      if (settled) return
      settled = true
      unsubscribe()
      void host.cancelProcessing(sessionId, true)
      reject(new Error('Agent 生成 task.yaml 超时'))
    }, GENERATE_TIMEOUT_MS)

    void host.sendMessage(sessionId, prompt).catch((error: unknown) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      unsubscribe()
      reject(error)
    })
  })
}

const WORK_PHASES: ReadonlySet<WorkPhase> = new Set<WorkPhase>([
  'pending',
  'designing',
  'tb-reviewing',
  'coding',
  'gerrit-reviewing',
  'pending-writeup',
  'completed',
  'cancelled',
  'on-hold',
])

function parseWorkPhase(value: string): WorkPhase {
  if (WORK_PHASES.has(value as WorkPhase)) return value as WorkPhase
  throw new Error(`未知 Teambition 状态: ${value}`)
}

/**
 * 注册所有 Projects、Tasks、Session 与 Teambition IPC handlers。
 * 重建窗口时只更新推送目标，不重复调用 ipcMain.handle。
 */
export function registerTaskHandlers(window: BrowserWindow): void {
  mainWindow = window
  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle(PROJECT_IPC_CHANNELS.GET, (_event, workspaceRoot: string) => {
    return loadWorkspaceProjects(workspaceRoot)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.GET_ONE, (_event, workspaceRoot: string, idOrSlug: string) => {
    return loadProject(workspaceRoot, idOrSlug) ?? loadProjectById(workspaceRoot, idOrSlug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.CREATE, (_event, workspaceRoot: string, input: CreateProjectInput) => {
    const config = createProject(workspaceRoot, input)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return loadProjectOrThrow(workspaceRoot, config.slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.UPDATE, (_event, workspaceRoot: string, slug: string, patch: UpdateProjectInput) => {
    const config = updateProject(workspaceRoot, slug, patch)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return loadProjectOrThrow(workspaceRoot, config.slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.DELETE, (_event, workspaceRoot: string, slug: string) => {
    deleteProject(workspaceRoot, slug)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.LIST_ASSETS, (_event, workspaceRoot: string, slug: string) => {
    return listProjectAssets(workspaceRoot, slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.UPLOAD_ASSET, (_event, workspaceRoot: string, slug: string, input: UploadProjectAssetInput) => {
    const asset = uploadProjectAsset(workspaceRoot, slug, input)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return asset
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.DELETE_ASSET, (_event, workspaceRoot: string, slug: string, filename: string) => {
    deleteProjectAsset(workspaceRoot, slug, filename)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.READ_MEMORY, (_event, workspaceRoot: string, slug: string) => {
    return readProjectMemory(workspaceRoot, slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.WRITE_MEMORY, (_event, workspaceRoot: string, slug: string, content: string) => {
    writeProjectMemory(workspaceRoot, slug, content)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(TASK_IPC_CHANNELS.VALIDATE, (_event, yaml: string) => {
    return buildTaskValidationPayload(parseTaskYaml(yaml))
  })

  ipcMain.handle(TASK_IPC_CHANNELS.CREATE, async (_event, workspaceRoot: string, workspaceId: string, request: {
    yaml: string
    orchestratorSessionId?: string
    attachToExistingSessionId?: string
  }) => {
    const parsed = parseTaskYaml(request.yaml)
    if (!parsed.valid || !parsed.spec) {
      throw new Error(`task.yaml 验证失败: ${parsed.errors?.map((error) => error.message).join(', ')}`)
    }
    saveTaskSpec(workspaceRoot, parsed.spec)

    const sessionId = request.attachToExistingSessionId ?? request.orchestratorSessionId
    if (sessionId) {
      if (!getAgentSessionMeta(sessionId)) throw new Error(`Agent 会话不存在: ${sessionId}`)
      await updateAgentSessionMeta(
        sessionId,
        request.orchestratorSessionId
          ? buildAdoptedTaskSessionPatch(parsed.spec)
          : {
              taskSlug: parsed.spec.id,
              ...(parsed.spec.project ? { projectId: parsed.spec.project } : {}),
            },
      )
    } else {
      const session = await (await getSessionHost()).createSession(workspaceId, {
        name: parsed.spec.title,
        projectId: parsed.spec.project,
        taskSlug: parsed.spec.id,
      })
      return { slug: parsed.spec.id, orchestratorSessionId: session.id, valid: true }
    }

    return { slug: parsed.spec.id, orchestratorSessionId: sessionId, valid: true }
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GENERATE, async (_event, workspaceRoot: string, workspaceId: string, request: {
    goal: string
    title?: string
    projectId?: string
  }) => {
    const host = await getSessionHost()
    const session = await host.createSession(workspaceId, {
      name: request.title ?? request.goal.slice(0, 60),
      projectId: request.projectId,
      taskDraft: true,
      sessionStatus: 'queued',
    })
    void generateTaskForSession(workspaceRoot, workspaceId, request, session.id)
    return { orchestratorSessionId: session.id }
  })

  ipcMain.handle(TASK_IPC_CHANNELS.RUN, async (_event, workspaceRoot: string, workspaceId: string, slug: string, options?: RunOptions) => {
    return (await getRunnerFor(workspaceRoot, workspaceId)).run(slug, options)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.PAUSE, async (_event, workspaceRoot: string, workspaceId: string, slug: string, runId: string) => {
    await pauseTaskRun(getRunnerFor, workspaceRoot, workspaceId, slug, runId)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.RESUME, async (_event, workspaceRoot: string, workspaceId: string, slug: string, runId: string) => {
    ;(await getRunnerFor(workspaceRoot, workspaceId)).resume(slug, runId)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.STOP, async (_event, workspaceRoot: string, workspaceId: string, slug: string, runId: string) => {
    await stopTaskRun(getRunnerFor, workspaceRoot, workspaceId, slug, runId)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GET, (_event, workspaceRoot: string, slug: string) => {
    return loadTaskSpec(workspaceRoot, slug)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.LIST, (_event, workspaceRoot: string) => {
    return listTaskSlugs(workspaceRoot)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GET_RESULTS, (_event, workspaceRoot: string, slug: string, runId?: string) => {
    const selectedRunId = runId ?? listRunIds(workspaceRoot, slug).at(-1)
    if (!selectedRunId) return null
    return {
      spec: readRunSpecSnapshot(workspaceRoot, slug, selectedRunId),
      log: readRunLog(workspaceRoot, slug, selectedRunId),
      runId: selectedRunId,
    }
  })

  ipcMain.handle(SESSION_COMMAND_CHANNEL, async (_event, sessionId: string, command: SessionKanbanCommand) => {
    const host = await getSessionHost()
    switch (command.kind) {
      case 'move_to_workspace':
        return updateAgentSessionMeta(sessionId, { workspaceId: command.workspaceId })
      case 'set_project_id':
        return updateAgentSessionMeta(sessionId, { projectId: command.projectId })
      case 'set_kanban_column':
        return setSessionKanbanColumn(sessionId, command.kanbanColumn)
      case 'set_session_status':
        return host.setSessionStatus(sessionId, command.status)
      case 'set_task_node_count':
        return host.setTaskNodeCount(sessionId, command.taskNodeCount)
    }
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.LIST_TASKS, async (_event, projectId: string) => {
    return (await getTeambitionAdapter()).fetchTasks(projectId)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.GET_BINDING, async (_event, taskId: string) => {
    return (await getTeambitionAdapter()).fetchTaskDetail(taskId)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.UPDATE_STATUS, async (_event, taskId: string, status: string) => {
    await (await getTeambitionAdapter()).updateStatus(taskId, parseWorkPhase(status))
  })
}

async function generateTaskForSession(
  workspaceRoot: string,
  workspaceId: string,
  request: { goal: string; title?: string; projectId?: string },
  sessionId: string,
): Promise<void> {
  const host = await getSessionHost()
  let prompt = buildGeneratorPrompt(request.goal, request.title)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await sendGenerationPrompt(host, sessionId, prompt)
      const parsed = parseTaskYaml(text)
      if (parsed.valid && parsed.spec) {
        saveTaskSpec(workspaceRoot, parsed.spec)
        await host.setSessionStatus(sessionId, 'done')
        sendToMainWindow(TASK_IPC_CHANNELS.GENERATED, {
          kind: 'tasks:generated',
          workspaceId,
          orchestratorSessionId: sessionId,
          status: 'saved',
          slug: parsed.spec.id,
        } satisfies TaskGeneratedEventPayload)
        return
      }
      const errors = toTaskIssues(parsed.errors)
      if (attempt === 0) {
        prompt = buildRepairPrompt(errors.map((issue) => ({ path: issue.path ?? '<root>', message: issue.message })))
        continue
      }
      await host.setSessionStatus(sessionId, 'needs-review')
      sendToMainWindow(TASK_IPC_CHANNELS.GENERATED, {
        kind: 'tasks:generated',
        workspaceId,
        orchestratorSessionId: sessionId,
        status: 'invalid',
        errors,
      } satisfies TaskGeneratedEventPayload)
      return
    } catch (error) {
      await host.setSessionStatus(sessionId, 'needs-review').catch(() => undefined)
      sendToMainWindow(TASK_IPC_CHANNELS.GENERATED, {
        kind: 'tasks:generated',
        workspaceId,
        orchestratorSessionId: sessionId,
        status: 'error',
        errors: [{ message: errorMessage(error) }],
      } satisfies TaskGeneratedEventPayload)
      return
    }
  }
}

let teambitionAdapter: import('./teambition-adapter').TeambitionAdapter | undefined

async function getTeambitionAdapter(): Promise<import('./teambition-adapter').TeambitionAdapter> {
  if (teambitionAdapter) return teambitionAdapter
  try {
    const { MockTeambitionAdapter } = await import('./teambition-adapter')
    teambitionAdapter = new MockTeambitionAdapter()
    console.warn('[Teambition] 未配置已验证的 adapter factory，使用本地 Mock 适配器')
    return teambitionAdapter
  } catch (error) {
    throw new Error(`Teambition adapter 不可用: ${errorMessage(error)}`)
  }
}
