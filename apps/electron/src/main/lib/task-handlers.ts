/**
 * Projects、Tasks 与 Session Kanban IPC handler 注册。
 *
 * 这里是 Electron 主进程与本地文件存储、TaskRunner、Agent 编排器之间的薄桥接层。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { basename, join } from 'node:path'
import {
  PROJECT_IPC_CHANNELS,
  SESSION_COMMAND_CHANNEL,
  TASK_IPC_CHANNELS,
  TEAMBITION_IPC_CHANNELS,
} from '@luxcoder/shared/channels'
import type {
  CreateProjectInput,
  AgentSessionMeta,
  ProjectsChangedEventPayload,
  SessionKanbanCommand,
  TaskContractIssue,
  TaskGeneratedEventPayload,
  UpdateProjectInput,
  UploadProjectAssetInput,
} from '@luxcoder/shared'
import {
  buildGeneratorPrompt,
  buildRepairPrompt,
  extractYaml,
} from '@luxcoder/shared/tasks'
import {
  listResumableRuns,
  listTaskSlugs,
  loadTaskSpec,
  parseTaskYaml,
  readRunLog,
  readRunSpecSnapshot,
  listRunIds,
  saveTaskSpec,
} from '@luxcoder/shared/tasks/storage'
import { createLuxCoderConductorSessionHost, type LuxCoderConductorSessionHost } from './conductor-session-host'
import { getAgentSessionMeta, updateAgentSessionMeta } from './agent-session-manager'
import { isAgentSessionActive } from './agent-service'
import { getAgentWorkspace, listAgentWorkspaces } from './agent-workspace-manager'
import { getAgentWorkspacePath, getExpertsDir } from './config-paths'
import { getExpert } from './expert-service'
import { projectRepository } from './project-repository'
import {
  openOrCreateProjectForPath,
  relocateProjectWorkingDirectory,
  resolveEffectiveCwd,
} from './project-path-service'
import { TaskRunner, type RunOptions } from './task-runner'
import { TeambitionService, type ClaimTeambitionTaskInput, type TeambitionRemoteTask } from './teambition-service'

const GENERATE_TIMEOUT_MS = 180_000

let handlersRegistered = false
let mainWindow: BrowserWindow | null = null
let sessionHostPromise: Promise<LuxCoderConductorSessionHost> | undefined

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

function getSessionHost(): Promise<LuxCoderConductorSessionHost> {
  sessionHostPromise ??= createLuxCoderConductorSessionHost()
  return sessionHostPromise
}

async function getRunnerFor(workspaceRoot: string, workspaceId: string): Promise<TaskRunner> {
  const existing = runners.get(workspaceId)
  if (existing) return existing

  const expertsRoot = getExpertsDir()
  const runner = new TaskRunner({
    host: await getSessionHost(),
    workspaceId,
    workspaceRoot,
    isSessionActive: isAgentSessionActive,
    getExpert: (expertId) => getExpert(expertsRoot, expertId),
    resolveProjectDefaultExpertId: (projectId) => {
      try {
        return projectRepository.getProjectAtRoot(workspaceRoot, projectId)?.config.defaultExpertId ?? null
      } catch (cause) {
        console.warn(`[TaskRunner] 读取项目默认专家失败: ${projectId}`, cause)
        return null
      }
    },
  })
  runners.set(workspaceId, runner)
  return runner
}

function workspaceIdFor(workspaceRoot: string): string {
  return basename(workspaceRoot)
}

function sendToMainWindow(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function broadcastProjectsChanged(workspaceRoot: string, workspaceId: string): void {
  const payload: ProjectsChangedEventPayload = {
    kind: 'projects:changed',
    workspaceId,
    projects: projectRepository.listProjectsAtRoot(workspaceRoot),
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
  cwd?: string
  defaults?: {
    model?: string
    llmConnection?: string
    permissionMode?: string
  }
}

/** spec.cwd 优先，否则回退到项目配置的 workingDirectory。 */
export function resolveTaskWorkingDirectory(
  workspaceRoot: string,
  spec: Pick<AdoptableTaskSpec, 'cwd' | 'project'>,
): string | undefined {
  const cwd = spec.cwd?.trim()
  if (cwd) return cwd
  return projectRepository.resolveWorkingDirectory(workspaceRoot, spec.project)
}

/**
 * 构造 set_project_id 的会话更新补丁。
 * 绑定项目且解析出有效 cwd（外部主目录或托管 workdir）时写入 workingDirectory；
 * 解绑或 cwd 不可用时省略该字段，保留会话已有工作目录（避免误清手动附加路径）。
 */
export function buildSetProjectIdUpdates(
  projectId: string | undefined,
  resolvedWorkingDirectory: string | undefined,
): Pick<AgentSessionMeta, 'projectId'> & Partial<Pick<AgentSessionMeta, 'workingDirectory'>> {
  return {
    projectId,
    ...(projectId && resolvedWorkingDirectory ? { workingDirectory: resolvedWorkingDirectory } : {}),
  }
}

function mapTaskPermissionMode(mode: string | undefined): AgentSessionMeta['permissionMode'] | undefined {
  if (mode === undefined) return undefined
  if (mode === 'allow-all' || mode === 'bypassPermissions') return 'bypassPermissions'
  // 历史 SDK auto ≈ 完全自动；safe/ask 不得升权，收敛到计划模式
  if (mode === 'auto') return 'bypassPermissions'
  if (mode === 'safe' || mode === 'ask') return 'plan'
  if (mode === 'plan') return 'plan'
  return undefined
}

/** 从 task spec 提取应写入 orchestrator 会话的字段（cwd / 模型 / 渠道 / 权限）。 */
export function buildTaskSessionSeed(
  spec: AdoptableTaskSpec,
  workspaceRoot?: string,
): Pick<AgentSessionMeta, 'workingDirectory' | 'modelId' | 'channelId' | 'permissionMode'> {
  const workingDirectory = workspaceRoot
    ? resolveTaskWorkingDirectory(workspaceRoot, spec)
    : spec.cwd?.trim() || undefined
  const permissionMode = mapTaskPermissionMode(spec.defaults?.permissionMode)
  return {
    ...(workingDirectory ? { workingDirectory } : {}),
    ...(spec.defaults?.model ? { modelId: spec.defaults.model } : {}),
    ...(spec.defaults?.llmConnection ? { channelId: spec.defaults.llmConnection } : {}),
    ...(permissionMode ? { permissionMode } : {}),
  }
}

/** 生成草稿转正时清除隐藏标记，并把尚未运行的任务放回待办状态。 */
export function buildAdoptedTaskSessionPatch(
  spec: AdoptableTaskSpec,
  workspaceRoot?: string,
): Pick<AgentSessionMeta, 'taskSlug' | 'projectId' | 'taskDraft' | 'sessionStatus' | 'workingDirectory' | 'modelId' | 'channelId' | 'permissionMode'> {
  return {
    taskSlug: spec.id,
    ...(spec.project ? { projectId: spec.project } : {}),
    ...buildTaskSessionSeed(spec, workspaceRoot),
    taskDraft: undefined,
    sessionStatus: 'todo',
  }
}

type AgentSessionMetaUpdater = (
  sessionId: string,
  updates: Pick<AgentSessionMeta, 'kanbanColumn' | 'sessionStatus'>,
) => AgentSessionMeta

/** 将看板列持久化；若列定义了 dropStatusId 则同步 sessionStatus。 */
export function setSessionKanbanColumn(
  sessionId: string,
  column: string | null,
  updateSession: AgentSessionMetaUpdater = updateAgentSessionMeta,
  options?: { sessionStatus?: string },
): AgentSessionMeta {
  return updateSession(sessionId, {
    kanbanColumn: column ?? undefined,
    ...(options?.sessionStatus ? { sessionStatus: options.sessionStatus } : {}),
  })
}

/** 根据会话所属项目解析拖入列应写入的 sessionStatus */
export function resolveSessionDropStatus(
  sessionId: string,
  columnId: string | null,
  getSession: typeof getAgentSessionMeta = getAgentSessionMeta,
): string | undefined {
  const meta = getSession(sessionId)
  if (!meta?.projectId || !meta.workspaceId || !columnId) return undefined
  const workspace = getAgentWorkspace(meta.workspaceId)
  if (!workspace) return undefined
  return projectRepository.resolveDropStatusId(
    getAgentWorkspacePath(workspace.slug),
    meta.projectId,
    columnId,
  )
}

/** 冷启动：扫描所有工作区未结束的 TaskRun 并 resume */
export async function rehydrateIncompleteTaskRuns(): Promise<number> {
  let restored = 0
  for (const workspace of listAgentWorkspaces()) {
    const workspaceRoot = getAgentWorkspacePath(workspace.slug)
    const resumable = listResumableRuns(workspaceRoot)
    if (resumable.length === 0) continue
    const runner = await getRunnerFor(workspaceRoot, workspace.id)
    for (const { slug, runId } of resumable) {
      try {
        runner.resume(slug, runId)
        restored += 1
        console.log(`[TaskRunner] 冷启动恢复 ${workspace.slug}/${slug}:${runId}`)
      } catch (error) {
        console.warn(`[TaskRunner] 冷启动恢复失败 ${workspace.slug}/${slug}:${runId}: ${errorMessage(error)}`)
      }
    }
    runner.healAllOrphaned()
  }
  return restored
}

/** 收敛内存中卡住的 TaskRun（Agent 已不活跃但仍标 running） */
export async function healOrphanedTaskRuns(): Promise<number> {
  let total = 0
  for (const runner of runners.values()) {
    total += runner.healAllOrphaned()
  }
  return total
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
  host: LuxCoderConductorSessionHost,
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

/**
 * 注册所有 Projects、Tasks、Session 与 Teambition IPC handlers。
 * 重建窗口时只更新推送目标，不重复调用 ipcMain.handle。
 */
export function registerTaskHandlers(window: BrowserWindow): void {
  mainWindow = window
  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle(PROJECT_IPC_CHANNELS.GET, (_event, workspaceRoot: string) => {
    return projectRepository.listProjectsAtRoot(workspaceRoot)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.GET_ONE, (_event, workspaceRoot: string, idOrSlug: string) => {
    return projectRepository.getProjectAtRoot(workspaceRoot, idOrSlug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.CREATE, (_event, workspaceRoot: string, input: CreateProjectInput) => {
    const project = projectRepository.createProjectAtRoot(workspaceRoot, input)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return project
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.UPDATE, (_event, workspaceRoot: string, slug: string, patch: UpdateProjectInput) => {
    const project = projectRepository.updateProjectAtRoot(workspaceRoot, slug, patch)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return project
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.DELETE, (_event, workspaceRoot: string, slug: string) => {
    projectRepository.deleteProjectAtRoot(workspaceRoot, slug)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.LIST_ASSETS, (_event, workspaceRoot: string, slug: string) => {
    return projectRepository.listProjectAssetsAtRoot(workspaceRoot, slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.UPLOAD_ASSET, (_event, workspaceRoot: string, slug: string, input: UploadProjectAssetInput) => {
    const asset = projectRepository.uploadProjectAssetAtRoot(workspaceRoot, slug, input)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
    return asset
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.DELETE_ASSET, (_event, workspaceRoot: string, slug: string, filename: string) => {
    projectRepository.deleteProjectAssetAtRoot(workspaceRoot, slug, filename)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.READ_MEMORY, (_event, workspaceRoot: string, slug: string) => {
    return projectRepository.readProjectMemoryAtRoot(workspaceRoot, slug)
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.WRITE_MEMORY, (_event, workspaceRoot: string, slug: string, content: string) => {
    projectRepository.writeProjectMemoryAtRoot(workspaceRoot, slug, content)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(
    PROJECT_IPC_CHANNELS.OPEN_OR_CREATE_BY_PATH,
    (_event, workspaceRoot: string, folderPath: string) => {
      const result = openOrCreateProjectForPath(workspaceRoot, folderPath)
      if (result.created) {
        broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
      }
      const loaded = projectRepository.getProjectAtRoot(workspaceRoot, result.project.slug)
      if (!loaded) throw new Error(`项目创建或复用后无法加载: ${result.project.slug}`)
      return { project: loaded, created: result.created }
    },
  )

  ipcMain.handle(
    PROJECT_IPC_CHANNELS.RESOLVE_EFFECTIVE_CWD,
    (_event, workspaceRoot: string, projectSlug: string) => {
      const loaded = projectRepository.getProjectAtRoot(workspaceRoot, projectSlug)
      if (!loaded) throw new Error(`项目不存在: ${projectSlug}`)
      return resolveEffectiveCwd(workspaceRoot, loaded.config)
    },
  )

  ipcMain.handle(
    PROJECT_IPC_CHANNELS.RELOCATE_WORKING_DIRECTORY,
    (_event, workspaceRoot: string, projectSlug: string, newPath: string) => {
      relocateProjectWorkingDirectory(workspaceRoot, projectSlug, newPath)
      const loaded = projectRepository.getProjectAtRoot(workspaceRoot, projectSlug)
      if (!loaded) throw new Error(`重新定位后无法加载项目: ${projectSlug}`)
      broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
      return loaded
    },
  )

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
    const seed = buildTaskSessionSeed(parsed.spec, workspaceRoot)
    if (sessionId) {
      if (!getAgentSessionMeta(sessionId)) throw new Error(`Agent 会话不存在: ${sessionId}`)
      await updateAgentSessionMeta(
        sessionId,
        request.orchestratorSessionId
          ? buildAdoptedTaskSessionPatch(parsed.spec, workspaceRoot)
          : {
              taskSlug: parsed.spec.id,
              ...(parsed.spec.project ? { projectId: parsed.spec.project } : {}),
              ...seed,
            },
      )
    } else {
      const session = await (await getSessionHost()).createSession(workspaceId, {
        name: parsed.spec.title,
        projectId: parsed.spec.project,
        taskSlug: parsed.spec.id,
        sessionStatus: 'todo',
        ...(seed.workingDirectory ? { workingDirectory: seed.workingDirectory } : {}),
        ...(seed.modelId ? { model: seed.modelId } : {}),
        ...(seed.channelId ? { llmConnection: seed.channelId } : {}),
        ...(parsed.spec.defaults?.permissionMode
          ? { permissionMode: parsed.spec.defaults.permissionMode }
          : {}),
      })
      return { slug: parsed.spec.id, orchestratorSessionId: session.id, valid: true }
    }

    return { slug: parsed.spec.id, orchestratorSessionId: sessionId, valid: true }
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GENERATE, async (_event, workspaceRoot: string, workspaceId: string, request: {
    goal: string
    title?: string
    projectId?: string
    cwd?: string
  }) => {
    const host = await getSessionHost()
    const workingDirectory = request.cwd?.trim()
      || projectRepository.resolveWorkingDirectory(workspaceRoot, request.projectId)
    const session = await host.createSession(workspaceId, {
      name: request.title ?? request.goal.slice(0, 60),
      projectId: request.projectId,
      taskDraft: true,
      sessionStatus: 'queued',
      ...(workingDirectory ? { workingDirectory } : {}),
    })
    // 延后启动，确保 IPC ack 先回到 renderer 并设置 pendingSessionId，避免 GENERATED 竞态被忽略
    setImmediate(() => {
      void generateTaskForSession(workspaceRoot, workspaceId, request, session.id)
    })
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

  ipcMain.handle(TASK_IPC_CHANNELS.REHYDRATE, async (_event, workspaceRoot: string, workspaceId: string) => {
    const runner = await getRunnerFor(workspaceRoot, workspaceId)
    const resumable = listResumableRuns(workspaceRoot)
    for (const { slug, runId } of resumable) {
      runner.resume(slug, runId)
    }
    const healed = runner.healAllOrphaned()
    return { restored: resumable.length, healed, runs: resumable }
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
      case 'set_project_id': {
        const meta = getAgentSessionMeta(sessionId)
        const workspace = meta?.workspaceId ? getAgentWorkspace(meta.workspaceId) : undefined
        const resolvedWorkingDirectory = command.projectId && workspace
          ? projectRepository.resolveWorkingDirectory(
              getAgentWorkspacePath(workspace.slug),
              command.projectId,
            )
          : undefined
        return updateAgentSessionMeta(
          sessionId,
          buildSetProjectIdUpdates(command.projectId, resolvedWorkingDirectory),
        )
      }
      case 'set_kanban_column': {
        const sessionStatus = resolveSessionDropStatus(sessionId, command.kanbanColumn)
        return setSessionKanbanColumn(sessionId, command.kanbanColumn, updateAgentSessionMeta, {
          ...(sessionStatus ? { sessionStatus } : {}),
        })
      }
      case 'set_session_status':
        return host.setSessionStatus(sessionId, command.status)
      case 'set_task_node_count':
        return host.setTaskNodeCount(sessionId, command.taskNodeCount)
      default: {
        const _exhaustive: never = command
        return _exhaustive
      }
    }
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.CAPABILITIES, async (_event, workspaceRoot: string) => {
    return (await getTeambitionService(workspaceRoot)).probeCapabilities()
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.LIST_TASKS, async (_event, workspaceRoot: string, projectId: string) => {
    return (await getTeambitionService(workspaceRoot)).listClaimableTasks(projectId)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.CLAIM_TASK, async (_event, workspaceRoot: string, input: ClaimTeambitionTaskInput) => {
    return (await getTeambitionService(workspaceRoot)).claimTask(input)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.BIND_PROJECT, async (_event, workspaceRoot: string, sessionId: string, task: TeambitionRemoteTask) => {
    return (await getTeambitionService(workspaceRoot)).bindTask(sessionId, task)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.GET_BINDING, async (_event, workspaceRoot: string, sessionId: string) => {
    return (await getTeambitionService(workspaceRoot)).getBinding(sessionId)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.LIST_BINDINGS, async (_event, workspaceRoot: string) => {
    return (await getTeambitionService(workspaceRoot)).listBindings()
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.UPDATE_STATUS, async (_event, workspaceRoot: string, bindingId: string, status: string) => {
    return (await getTeambitionService(workspaceRoot)).syncStatus(bindingId, status)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.SYNC_PROGRESS, async (_event, workspaceRoot: string, bindingId: string, progress: number) => {
    return (await getTeambitionService(workspaceRoot)).syncProgress(bindingId, progress)
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.RETRY_SYNC, async (_event, workspaceRoot: string, bindingId: string) => {
    return (await getTeambitionService(workspaceRoot)).retryPendingSync(bindingId)
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
      const yaml = extractYaml(text)
      const parsed = parseTaskYaml(yaml)
      if (parsed.valid && parsed.spec) {
        // 与 craft OSS 一致：generate 不落盘，tasks:create 才是唯一写入点。
        // 这里仍写入以便 TaskEditor applySpec(tasks.get) 能读到草稿；create 时会覆盖确认版。
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
      console.warn(`[TaskGenerate] 校验失败 attempt=${attempt + 1} session=${sessionId}`, errors)
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
      console.error(`[TaskGenerate] 失败 session=${sessionId}:`, errorMessage(error))
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
const teambitionServices = new Map<string, TeambitionService>()

async function getTeambitionService(workspaceRoot: string): Promise<TeambitionService> {
  const existing = teambitionServices.get(workspaceRoot)
  if (existing) return existing
  const service = new TeambitionService({
    storagePath: join(workspaceRoot, 'teambition-bindings.json'),
    gateway: await getTeambitionAdapter(),
  })
  teambitionServices.set(workspaceRoot, service)
  return service
}

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
