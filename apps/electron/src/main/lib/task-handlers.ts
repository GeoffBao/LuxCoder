/**
 * Projects、Tasks 与 Session Kanban IPC handler 注册。
 *
 * 这里是 Electron 主进程与本地文件存储、TaskRunner、Agent 编排器之间的薄桥接层。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { basename, join, resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import {
  LABEL_IPC_CHANNELS,
  PROJECT_IPC_CHANNELS,
  SESSION_COMMAND_CHANNEL,
  SESSION_GROUP_IPC_CHANNELS,
  TASK_IPC_CHANNELS,
  TEAMBITION_IPC_CHANNELS,
  TEAMBITION_BOARD_IPC_CHANNELS,
} from '@yoda/shared/channels'
import type {
  CreateProjectInput,
  AgentSessionMeta,
  ProjectsChangedEventPayload,
  SessionKanbanCommand,
  TaskContractIssue,
  TaskGeneratedEventPayload,
  UpdateProjectInput,
  UploadProjectAssetInput,
} from '@yoda/shared'
import type { TaskSpec } from '@yoda/shared/tasks/schema'
import type { TaskMetadataPatch, TaskWorkflow } from '@yoda/shared/tasks/task-record'
import { slugify } from '@yoda/shared/utils'
import { resolveSkillMatches, TB_CONNECT_SKILL_SLUG } from '@yoda/shared/teambition-defect'
import {
  buildGeneratorPrompt,
  buildRepairPrompt,
  buildMinimalTaskSpec,
  extractYaml,
} from '@yoda/shared/tasks'
import {
  getLatestRunId,
  listResumableRuns,
  listTaskSlugs,
  loadTaskSpec,
  deleteTaskSpec,
  parseTaskYaml,
  readRunLog,
  readRunSpecSnapshot,
} from '@yoda/shared/tasks/storage'
import { createYodaConductorSessionHost, type YodaConductorSessionHost } from './conductor-session-host'
import { deleteAgentSession, getAgentSessionMeta, listAgentSessions, updateAgentSessionMeta } from './agent-session-manager'
import { createSessionGroup, deleteSessionGroup, listSessionGroups, renameSessionGroup } from './agent-session-group-service'
import { isAgentSessionActive } from './agent-service'
import {
  getAgentWorkspace,
  getWorkspaceDefaultWorkingDirectoryAtRoot,
  getWorkspaceSkills,
  listAgentWorkspaces,
} from './agent-workspace-manager'
import { getAgentWorkspacePath, getAgentSessionWorkspacePath, getExpertsDir } from './config-paths'
import { getExpert } from './expert-service'
import { loadExpertWorkspaceBinding } from './expert-binding-service'
import { projectRepository } from './project-repository'
import { analyzeProjectDeleteImpact, analyzeTaskDeleteImpact } from './project-impact-service'
import {
  openOrCreateProjectForPath,
  relocateProjectWorkingDirectory,
  restoreProjectWorkingDirectory,
  resolveEffectiveCwd,
} from './project-path-service'
import { TaskRepository } from './task-repository'
import { MockTeambitionAdapter, normalizeTeambitionTaskType } from './teambition-adapter'
import { TaskRunner, type CreateSessionOptions, type RunOptions } from './task-runner'
import {
  materializeTaskTransaction,
  recoverTaskMaterializations,
  type TaskMaterializationDependencies,
} from './task-materialization-service'
import {
  resolveTaskWorkingDirectory as resolveTaskWorkingDirectoryWithPolicy,
  type TaskWorkingDirectoryResult,
} from './task-working-directory'
import { TeambitionService, type ClaimTeambitionTaskInput, type TeambitionRemoteTask } from './teambition-service'
import { TeambitionBoardService, type TeambitionBoardGateway } from './teambition-board-service'
import { WorkspaceLabelService, assertValidWorkspaceLabelIds } from './workspace-label-service'

const GENERATE_TIMEOUT_MS = 180_000

let handlersRegistered = false
let mainWindow: BrowserWindow | null = null
let sessionHostPromise: Promise<YodaConductorSessionHost> | undefined

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

function getSessionHost(): Promise<YodaConductorSessionHost> {
  sessionHostPromise ??= createYodaConductorSessionHost()
  return sessionHostPromise
}

async function taskMaterializationDependencies(): Promise<TaskMaterializationDependencies> {
  const host = await getSessionHost()
  return {
    createSession: async (workspaceId: string, options: CreateSessionOptions) => {
      const created = await host.createSession(workspaceId, options)
      return getAgentSessionMeta(created.id) ?? {
        id: created.id,
        title: options.name ?? 'Task',
        workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    },
    getSession: getAgentSessionMeta,
    updateSession: updateAgentSessionMeta,
    deleteSession: deleteAgentSession,
  }
}

/** tasks:create 与 create_task 共用可恢复事务，只创建不运行。 */
export async function materializeTaskFromSpec(
  workspaceRoot: string,
  workspaceId: string,
  spec: TaskSpec,
  options?: { skipWorkspaceDefault?: boolean },
): Promise<{ slug: string; taskId: string; orchestratorSessionId: string }> {
  const seed = buildTaskSessionSeed(spec, workspaceRoot, options)
  return materializeTaskTransaction({
    workspaceRoot,
    workspaceId,
    spec,
    mode: {
      kind: 'create',
      sessionOptions: {
        sessionStatus: 'todo',
        ...(seed.workingDirectory ? { workingDirectory: seed.workingDirectory } : {}),
        ...(seed.modelId ? { model: seed.modelId } : {}),
        ...(seed.channelId ? { llmConnection: seed.channelId } : {}),
        ...(spec.defaults?.permissionMode ? { permissionMode: spec.defaults.permissionMode } : {}),
      },
    },
  }, await taskMaterializationDependencies())
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
    getWorkspaceExpertBinding: (expertId) => {
      const binding = loadExpertWorkspaceBinding(workspaceRoot, expertId)
      return binding.kind === 'valid' ? binding.binding : null
    },
    resolveProjectDefaultExpertId: (projectId) => {
      try {
        return projectRepository.getProjectAtRoot(workspaceRoot, projectId)?.config.defaultExpertId ?? null
      } catch (cause) {
        console.warn(`[TaskRunner] 读取项目默认专家失败: ${projectId}`, cause)
        return null
      }
    },
    resolveTaskWorkingDirectory: (spec) => resolveTaskWorkingDirectoryResult(workspaceRoot, spec),
  })
  runners.set(workspaceId, runner)
  return runner
}

function workspaceIdFor(workspaceRoot: string): string {
  return basename(workspaceRoot)
}

type WorkspaceRootResolver = (workspaceId: string) => string | undefined

function resolveKnownWorkspaceRoot(workspaceId: string): string | undefined {
  const workspace = getAgentWorkspace(workspaceId)
  return workspace ? getAgentWorkspacePath(workspace.slug) : undefined
}

export function validateSessionLabelAssignment(
  workspaceRoot: string,
  session: AgentSessionMeta,
  labelIds: readonly string[],
  resolveWorkspaceRoot: WorkspaceRootResolver = resolveKnownWorkspaceRoot,
): string[] {
  if (session.workspaceId) {
    const associatedRoot = resolveWorkspaceRoot(session.workspaceId)
    if (associatedRoot && resolve(associatedRoot) !== resolve(workspaceRoot)) {
      throw new Error(`Session ${session.id} 不属于当前 Workspace`)
    }
  }
  return assertValidWorkspaceLabelIds(workspaceRoot, labelIds)
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

function isAgentServiceErrorText(text: string): boolean {
  const looksLikeTaskYaml = /^\s*(?:id|title|goal|nodes)\s*:/m.test(text) && /^\s*nodes\s*:/m.test(text)
  return !looksLikeTaskYaml
    && /(?:Codex error|Claude error|服务繁忙|model is not supported|API error|rate limit)/i.test(text)
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

/** 解析 Task cwd 的结构化结果；配置失效时保留 blocked 原因，供 Run/UI 使用。 */
export function resolveTaskWorkingDirectoryResult(
  workspaceRoot: string,
  spec: Pick<AdoptableTaskSpec, 'cwd' | 'project'>,
  options?: { skipWorkspaceDefault?: boolean },
): TaskWorkingDirectoryResult {
  return resolveTaskWorkingDirectoryWithPolicy({
    explicitCwd: spec.cwd,
    projectId: spec.project,
    skipWorkspaceDefault: options?.skipWorkspaceDefault,
    workspaceDefaultCwd: getWorkspaceDefaultWorkingDirectoryAtRoot(workspaceRoot),
    resolveProjectCwd: (projectId) => {
      const result = projectRepository.resolveEffectiveCwdForProject(workspaceRoot, projectId)
      if (!result) return null
      if (result.status === 'unavailable' || !result.cwd) {
        return {
          status: 'unavailable',
          ...(result.displayPath ? { attemptedPath: result.displayPath } : {}),
        }
      }
      return { status: 'resolved', cwd: result.cwd }
    },
  })
}

/** 创建阶段兼容 helper：Task 可在缺少 cwd 时保存，因此 blocked 映射为 undefined。 */
export function resolveTaskWorkingDirectory(
  workspaceRoot: string,
  spec: Pick<AdoptableTaskSpec, 'cwd' | 'project'>,
  options?: { skipWorkspaceDefault?: boolean },
): string | undefined {
  const result = resolveTaskWorkingDirectoryResult(workspaceRoot, spec, options)
  return result.status === 'resolved' ? result.cwd : undefined
}

/**
 * 构造 set_project_id 的会话更新补丁。
 * 绑定项目且解析出有效 cwd（外部主目录或托管 workdir）时写入 workingDirectory；
 * 解绑或 cwd 不可用时省略该字段，保留会话已有工作目录（避免误清手动附加路径）。
 * 绑定项目 = triage 完成：会话还未上板（无列）或滞留在已下线的收件箱时，顺位移到「待办」；
 * 用户已手动拖到其他列的会话不动，尊重整理结果。
 */
export function buildSetProjectIdUpdates(
  projectId: string | undefined,
  resolvedWorkingDirectory: string | undefined,
  currentKanbanColumn?: string,
): Pick<AgentSessionMeta, 'projectId'> & Partial<Pick<AgentSessionMeta, 'workingDirectory' | 'kanbanColumn'>> {
  const shouldAdvanceColumn = Boolean(projectId)
    && (currentKanbanColumn === undefined || currentKanbanColumn === 'inbox')
  return {
    projectId,
    ...(projectId && resolvedWorkingDirectory ? { workingDirectory: resolvedWorkingDirectory } : {}),
    ...(shouldAdvanceColumn ? { kanbanColumn: 'todo' } : {}),
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
  options?: { skipWorkspaceDefault?: boolean },
): Pick<AgentSessionMeta, 'workingDirectory' | 'modelId' | 'channelId' | 'permissionMode'> {
  const workingDirectory = workspaceRoot
    ? resolveTaskWorkingDirectory(workspaceRoot, spec, options)
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

/**
 * 只有 tasks:generate 创建的隐藏草稿会话允许被「创建」转正。
 * 防止 stale orchestratorSessionId 把普通会话或其他任务静默改造成看板任务。
 */
export function assertAdoptableTaskDraftSession(
  sessionId: string,
  spec: AdoptableTaskSpec,
  getSession: (id: string) => AgentSessionMeta | undefined = getAgentSessionMeta,
): AgentSessionMeta {
  const meta = getSession(sessionId)
  if (!meta) throw new Error(`Agent 会话不存在: ${sessionId}`)
  if (meta.taskSlug) {
    if (meta.taskSlug === spec.id) return meta
    throw new Error(`生成草稿已绑定到其他任务: ${meta.taskSlug}`)
  }
  if (!meta.taskDraft) {
    throw new Error('生成草稿会话已失效，请重新生成任务计划')
  }
  return meta
}

type AgentSessionMetaUpdater = (
  sessionId: string,
  updates: Pick<AgentSessionMeta, 'kanbanColumn' | 'sessionStatus'>,
) => AgentSessionMeta

/** 将看板列持久化；调用方可选传入联动的 sessionStatus 一并写入。 */
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

/**
 * 根据拖入的看板列解析应写入的 sessionStatus（内置默认列固定语义：
 * 待办→todo、已完成→done、进行中→不写，运行态由系统派生）。
 * 护栏：会话正在运行（running/in-progress）时不被拖放降级——人不与机器打架。
 */
export function resolveSessionDropStatus(
  sessionId: string,
  columnId: string | null,
  getSession: typeof getAgentSessionMeta = getAgentSessionMeta,
): string | undefined {
  const meta = getSession(sessionId)
  if (!meta || !columnId) return undefined

  // 运行中的会话 badge 由系统派生，拖列不改写
  if (meta.sessionStatus === 'running' || meta.sessionStatus === 'in-progress') return undefined

  if (columnId === 'todo') return 'todo'
  if (columnId === 'done') return 'done'
  return undefined
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
  host: YodaConductorSessionHost,
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

    void host.sendMessage(sessionId, prompt, { toolPolicy: 'none' }).catch((error: unknown) => {
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

  // 进程启动后先收敛已完成 Session 绑定但尚未 rename 提交的 Task 事务。
  // recovery-required 只报告，不猜测或删除用户数据。
  for (const workspace of listAgentWorkspaces()) {
    const workspaceRoot = getAgentWorkspacePath(workspace.slug)
    for (const result of recoverTaskMaterializations(workspaceRoot, {})) {
      if (result.status === 'recovery-required') {
        console.warn(`[TaskMaterialization] 需要人工恢复 ${workspace.id}/${result.transactionId}: ${result.message ?? result.taskSlug}`)
      } else {
        console.info(`[TaskMaterialization] 启动恢复 ${workspace.id}/${result.taskSlug}: ${result.status}`)
      }
    }
  }

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
    const project = projectRepository.getProjectAtRoot(workspaceRoot, slug)
    if (!project) throw new Error(`项目不存在: ${slug}`)
    if (!project.config.archivedAt) throw new Error('永久删除前必须先归档项目')

    // 在执行删除的同一主进程 command 内重新分析，不能信任 Renderer 中可能过期的预览。
    const impact = analyzeProjectDeleteImpact(workspaceRoot, project.config, listAgentSessions())
    if (!impact.canPurge) {
      throw new Error(`项目仍有关联数据，不能永久删除：${impact.blockers.join('；')}`)
    }

    projectRepository.deleteProjectAtRoot(workspaceRoot, slug)
    broadcastProjectsChanged(workspaceRoot, workspaceIdFor(workspaceRoot))
  })

  ipcMain.handle(PROJECT_IPC_CHANNELS.ANALYZE_DELETE_IMPACT, (_event, workspaceRoot: string, idOrSlug: string) => {
    const project = projectRepository.getProjectAtRoot(workspaceRoot, idOrSlug)
    if (!project) throw new Error(`项目不存在: ${idOrSlug}`)
    return analyzeProjectDeleteImpact(workspaceRoot, project.config, listAgentSessions())
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

  ipcMain.handle(
    PROJECT_IPC_CHANNELS.RESTORE_WORKING_DIRECTORY,
    (_event, workspaceRoot: string, projectSlug: string) => {
      restoreProjectWorkingDirectory(workspaceRoot, projectSlug)
      const loaded = projectRepository.getProjectAtRoot(workspaceRoot, projectSlug)
      if (!loaded) throw new Error(`恢复目录后无法加载项目: ${projectSlug}`)
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

    if (request.attachToExistingSessionId) {
      const sessionId = request.attachToExistingSessionId
      const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
      const existingTask = repository.getTaskAggregate(workspaceId, parsed.spec.id)
      const existingSession = getAgentSessionMeta(sessionId)
      // TaskEditor 的“编辑”必须原地更新同一 Task，不能经 ensureUniqueTaskSlug 复制出第二个聚合根。
      if (existingTask && existingSession?.taskSlug === parsed.spec.id) {
        repository.updateTaskSpec(workspaceId, existingTask.taskId, parsed.spec)
        return {
          slug: existingTask.taskSlug,
          taskId: existingTask.taskId,
          orchestratorSessionId: sessionId,
          valid: true,
        }
      }
      const seed = buildTaskSessionSeed(parsed.spec, workspaceRoot)
      const result = await materializeTaskTransaction({
        workspaceRoot,
        workspaceId,
        spec: parsed.spec,
        mode: {
          kind: 'attach',
          sessionId,
          sessionPatch: {
            ...(parsed.spec.project ? { projectId: parsed.spec.project } : {}),
            ...seed,
          },
        },
      }, await taskMaterializationDependencies())
      return { ...result, valid: true }
    }

    if (request.orchestratorSessionId) {
      const sessionId = request.orchestratorSessionId
      assertAdoptableTaskDraftSession(sessionId, parsed.spec)
      const result = await materializeTaskTransaction({
        workspaceRoot,
        workspaceId,
        spec: parsed.spec,
        mode: {
          kind: 'adopt',
          sessionId,
          sessionPatch: buildAdoptedTaskSessionPatch(parsed.spec, workspaceRoot),
        },
      }, await taskMaterializationDependencies())
      return { ...result, valid: true }
    }

    const result = await materializeTaskFromSpec(workspaceRoot, workspaceId, parsed.spec)
    return { ...result, valid: true }
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GENERATE, async (_event, workspaceRoot: string, workspaceId: string, request: {
    goal: string
    title?: string
    projectId?: string
    cwd?: string
    model?: string
    llmConnection?: string
    permissionMode?: string
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
      ...(request.model ? { model: request.model } : {}),
      ...(request.llmConnection ? { llmConnection: request.llmConnection } : {}),
      ...(request.permissionMode ? { permissionMode: request.permissionMode } : {}),
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

  ipcMain.handle(TASK_IPC_CHANNELS.LIST_SUMMARIES, (_event, workspaceRoot: string, workspaceId: string) => {
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    return repository.listTaskAggregateSummaries(workspaceId)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.UPDATE_WORKFLOW, (
    _event,
    workspaceRoot: string,
    workspaceId: string,
    taskId: string,
    workflow: TaskWorkflow,
    expectedRevision?: number,
  ) => {
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    return repository.updateTaskWorkflow(workspaceId, taskId, workflow, expectedRevision)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.UPDATE_METADATA, (
    _event,
    workspaceRoot: string,
    workspaceId: string,
    taskId: string,
    patch: TaskMetadataPatch,
  ) => {
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    const validatedPatch = patch.labelIds === undefined
      ? patch
      : { ...patch, labelIds: assertValidWorkspaceLabelIds(workspaceRoot, patch.labelIds) }
    return repository.updateTaskMetadata(workspaceId, taskId, validatedPatch)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.ANALYZE_DELETE_IMPACT, (_event, workspaceRoot: string, slug: string) => {
    const loaded = loadTaskSpec(workspaceRoot, slug)
    if (!loaded?.spec) throw new Error(`Task 不存在: ${slug}`)
    return analyzeTaskDeleteImpact(workspaceRoot, slug, listAgentSessions())
  })

  ipcMain.handle(TASK_IPC_CHANNELS.DELETE, (_event, workspaceRoot: string, _workspaceId: string, slug: string) => {
    const loaded = loadTaskSpec(workspaceRoot, slug)
    if (!loaded?.spec) throw new Error(`Task 不存在: ${slug}`)
    // 删除前重新验证影响分析
    const impact = analyzeTaskDeleteImpact(workspaceRoot, slug, listAgentSessions())
    if (impact.activeRunCount > 0) {
      throw new Error(`仍有 ${impact.activeRunCount} 个活跃 Run，请先停止运行`)
    }
    deleteTaskSpec(workspaceRoot, slug)
  })

  ipcMain.handle(TASK_IPC_CHANNELS.GET_RESULTS, (_event, workspaceRoot: string, slug: string, runId?: string) => {
    const selectedRunId = runId ?? getLatestRunId(workspaceRoot, slug)
    if (!selectedRunId) return null
    return {
      spec: readRunSpecSnapshot(workspaceRoot, slug, selectedRunId),
      log: readRunLog(workspaceRoot, slug, selectedRunId),
      runId: selectedRunId,
    }
  })

  ipcMain.handle(SESSION_GROUP_IPC_CHANNELS.LIST, (_event, workspaceSlug: string) => {
    return listSessionGroups(workspaceSlug)
  })

  ipcMain.handle(SESSION_GROUP_IPC_CHANNELS.CREATE, (_event, workspaceSlug: string, name: string) => {
    return createSessionGroup(workspaceSlug, name)
  })

  ipcMain.handle(SESSION_GROUP_IPC_CHANNELS.RENAME, (_event, workspaceSlug: string, id: string, name: string) => {
    return renameSessionGroup(workspaceSlug, id, name)
  })

  ipcMain.handle(SESSION_GROUP_IPC_CHANNELS.DELETE, (_event, workspaceSlug: string, id: string) => {
    deleteSessionGroup(workspaceSlug, id)
  })

  // === Workspace Labels ===

  ipcMain.handle(LABEL_IPC_CHANNELS.LIST, (_event, workspaceRoot: string) => {
    return new WorkspaceLabelService(workspaceRoot).list()
  })

  ipcMain.handle(LABEL_IPC_CHANNELS.CREATE, (_event, workspaceRoot: string, input: { name: string; color?: string }) => {
    return new WorkspaceLabelService(workspaceRoot).create(input)
  })

  ipcMain.handle(LABEL_IPC_CHANNELS.UPDATE, (_event, workspaceRoot: string, labelId: string, patch: { name?: string; color?: string | null; archived?: boolean }) => {
    return new WorkspaceLabelService(workspaceRoot).update(labelId, patch)
  })

  ipcMain.handle(LABEL_IPC_CHANNELS.ARCHIVE, (_event, workspaceRoot: string, labelId: string) => {
    return new WorkspaceLabelService(workspaceRoot).archive(labelId)
  })

  ipcMain.handle(LABEL_IPC_CHANNELS.SET_SESSION_LABELS, (_event, workspaceRoot: string, sessionId: string, labelIds: string[]) => {
    const session = getAgentSessionMeta(sessionId)
    if (!session) throw new Error(`Agent 会话不存在: ${sessionId}`)
    const validatedLabelIds = validateSessionLabelAssignment(workspaceRoot, session, labelIds)
    return updateAgentSessionMeta(sessionId, { labelIds: validatedLabelIds })
  })

  ipcMain.handle(LABEL_IPC_CHANNELS.SET_TASK_LABELS, (_event, workspaceRoot: string, workspaceId: string, taskId: string, labelIds: string[]) => {
    const validatedLabelIds = assertValidWorkspaceLabelIds(workspaceRoot, labelIds)
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    const aggregate = repository.getTaskAggregateById(workspaceId, taskId)
    if (!aggregate?.record) throw new Error(`Task ${taskId} 缺少稳定 TaskRecord，不能设置 labels`)
    return repository.updateTaskMetadata(workspaceId, taskId, {
      labelIds: validatedLabelIds,
      expectedRevision: aggregate.record.revision,
    })
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
          buildSetProjectIdUpdates(command.projectId, resolvedWorkingDirectory, meta?.kanbanColumn),
        )
      }
      case 'set_custom_group':
        return updateAgentSessionMeta(sessionId, { customGroupId: command.groupId })
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

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.SYNC_MY_OPEN_TASKS, async (_event, workspaceRoot: string, workspaceId: string) => {
    const { adapter, isMock } = await getTeambitionAdapterInfo(workspaceRoot)
    const service = new TeambitionService({
      storagePath: join(workspaceRoot, 'teambition-bindings.json'),
      gateway: adapter,
    })
    // 1. 拉取 Teambition 名下未完成任务（候选，不自动创建）
    const { tasks, needsReauth } = await service.listMyOpenTasks()
    if (needsReauth) {
      return { ok: false, needsReauth: true, candidates: [], alreadySynced: [], created: [], skipped: [], tasks, mock: false }
    }
    if (isMock) {
      return { ok: true, needsReauth: false, candidates: [], alreadySynced: [], created: [], skipped: [], tasks, mock: true }
    }

    // 2. 计算候选与已同步：按 TB taskId 去重（本地已有同源任务视为已同步）
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    const summaries = repository.listTaskAggregateSummaries(workspaceId)
    const syncedTbIds = new Set(
      summaries
        .filter((summary) => summary.source === 'teambition' && summary.teambitionTaskId)
        .map((summary) => summary.teambitionTaskId as string),
    )
    const candidates = tasks.filter((task) => !syncedTbIds.has(task.id))
    const alreadySynced = tasks.filter((task) => syncedTbIds.has(task.id))

    return {
      ok: true,
      needsReauth: false,
      candidates,
      alreadySynced: alreadySynced.map((task) => task.title),
      created: [],
      skipped: [],
      tasks,
      mock: false,
    }
  })

  // 手动创建选中的 TB 任务为本地看板 Task（不自动运行、不开会话窗口）
  ipcMain.handle(TEAMBITION_IPC_CHANNELS.CREATE_SYNCED_TASKS, async (_event, workspaceRoot: string, workspaceId: string, selected: TeambitionRemoteTask[], options?: { expertId?: string; projectId?: string; workingDirectory?: string; skills?: string[]; skillsByTask?: Record<string, string[]> }) => {
    const repo = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    const created: Array<{ taskId: string; slug: string; title: string }> = []
    const skipped: string[] = []
    const failed: Array<{ title: string; reason: string }> = []
    const expertId = options?.expertId
    const projectId = options?.projectId
    const workingDirectory = options?.workingDirectory
    /** 用户手动勾选的技能（覆盖 AI 自动匹配；未提供时用 AI 结果） */
    const manualSkills = options?.skills
    /** 逐条技能（taskId → 用户勾选；批量逐条确认时使用，优先级最高） */
    const skillsByTask = options?.skillsByTask

    // 工作区 Skills（用于把适配的技能写进任务 spec，执行时会话自动带技能上下文）
    const workspaceSlug = workspaceIdFor(workspaceRoot)
    const workspaceSkills = getWorkspaceSkills(workspaceSlug)

    // 去重：本地已有相同 TB 任务（teambitionTaskId 相同）则跳过，避免反复加入重复创建
    const existingTbTaskIds = collectLocalTbTaskIds(workspaceRoot, workspaceId)

    for (const task of selected) {
      if (existingTbTaskIds.has(task.id)) {
        skipped.push(task.id)
        continue
      }
      // 用 TB taskId 作为去重/唯一标识（slugify 中文会退化冲突，taskId 唯一）
      const shortId = task.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'tb'
      const slug = `${slugify(task.title) || 'tb-task'}-${shortId}`
      try {
        const localType = normalizeTeambitionTaskType(task.type)
        // 拉取 TB 任务详情（问题描述/备注/附件/关键字段），让执行会话充分了解具体问题
        let tbDetail: Awaited<ReturnType<typeof getTeambitionBoardDetail>> | undefined
        try {
          tbDetail = await getTeambitionBoardDetail(workspaceRoot, task.id)
        } catch (detailError) {
          console.warn(`[Teambition] 拉取任务详情失败（跳过详情填充）${task.id}:`, detailError)
        }
        // 技能匹配：基于标题/类型 + 详情内容（更严谨），把适配技能写入 spec.skills
        const skillMatches = resolveSkillMatches(
          {
            content: task.title,
            type: localType,
            ...(tbDetail?.description ? { description: tbDetail.description } : {}),
            ...(tbDetail?.note ? { note: tbDetail.note } : {}),
            ...(tbDetail?.attachments ? { attachments: tbDetail.attachments } : {}),
            ...(tbDetail?.fields ? { fields: tbDetail.fields } : {}),
          },
          workspaceSkills.map((skill) => ({ slug: skill.slug, name: skill.name, description: skill.description, enabled: skill.enabled })),
        )
        // 内容：标题 + 编号 + 项目 + 类型 + 详情（问题描述/复现步骤/附件/关键字段），作为任务 goal 与首节点 prompt
        // 缺陷类任务：明确「分析该缺陷」意图，让 Agent 第一步就进入问题分析而非泛泛执行
        const isBug = localType === 'bug'
        const detailSections = [
          // 问题描述（rtf/note 提取，可能很长）
          tbDetail?.description ? `【问题描述】\n${tbDetail.description}` : '',
          // 备注
          tbDetail?.note && tbDetail.note !== tbDetail.description ? `【备注】\n${tbDetail.note}` : '',
          // 附件（日志等）
          tbDetail && tbDetail.attachments.length > 0
            ? `【附件】${tbDetail.attachments.map((a) => a.name).join('、')}`
            : '',
          // 关键自定义字段（出现几率/严重程度/软件版本等）
          tbDetail && tbDetail.fields.length > 0
            ? `【关键字段】${tbDetail.fields.map((f) => `${f.name}:${f.value}`).join('；')}`
            : '',
        ].filter(Boolean).join('\n')
        const taskDescription = [
          isBug ? '请分析以下 TB 缺陷问题，定位根因并输出分析结论：' : '请处理以下 TB 任务：',
          `【TB 任务】${task.title}`,
          task.uniqueId ? `编号：${task.uniqueId}` : '',
          task.projectId ? `TB 项目 ID：${task.projectId}` : '',
          `类型：${localType}`,
          `来源：Teambition（taskId=${task.id}）`,
          detailSections,
          `适配技能：${skillMatches.length > 0 ? skillMatches.map((match) => match.name).join('、') : '无（按通用任务处理）'}`,
        ].filter(Boolean).join('\n')
        const spec = buildMinimalTaskSpec({
          title: task.title,
          description: taskDescription,
          // 加入本地任务时按当前看板默认填充：项目归属 + 工作目录；
          // 未选中项目则不传（归到 Workspace 范围，用户后续可在编辑里改归属）
          projectId,
          workingDirectory,
          source: 'teambition',
          teambitionTaskId: task.id,
          // TB 任务类型（缺陷/需求/任务等）映射到本地 TaskType，避免全部落成默认“任务”
          type: localType,
          // 适配的技能写入 spec.skills（执行时会话自动加载）：
          // 1) connect-tb-workflow 为 TB 问题必选（工作区存在时）——分析/流转流程对所有 TB 问题一致
          // 2) 该条任务用户勾选的技能（skillsByTask[task.id] 优先，其次 manualSkills）
          skills: [
            ...(workspaceSkills.some((s) => s.slug === TB_CONNECT_SKILL_SLUG) ? [TB_CONNECT_SKILL_SLUG] : []),
            ...((skillsByTask?.[task.id] ?? manualSkills)?.length
              ? (skillsByTask?.[task.id] ?? manualSkills)!.filter((slug) => slug !== TB_CONNECT_SKILL_SLUG)
              : []),
          ],
          // 自动选 Agent 结果：写入 defaults.expertId（无则用默认，不传）
          ...(expertId ? { expertId } : {}),
        })
        // 关键：spec.id 必须等于去重 slug（含 TB taskId 后缀），否则 materialize
        // 生成的目录 slug 与下次同步的去重键不一致 → 二次同步会重复创建
        spec.id = slug
        // TB 加入本地任务：未绑定项目时跳过 workspace 默认目录回退，
        // 并把任务 cwd 指向其会话自己的工作目录（临时会话），而不是首页/工作区默认目录
        const result = await materializeTaskFromSpec(workspaceRoot, workspaceId, spec, {
          skipWorkspaceDefault: !projectId,
        })
        if (!projectId) {
          const ws = getAgentWorkspace(workspaceId)
          if (ws) {
            const sessionCwd = getAgentSessionWorkspacePath(ws.slug, result.orchestratorSessionId)
            // 补写 task.yaml cwd，保证 TaskRunner 运行时能解析出有效工作目录
            const loaded = repo.getTaskAggregateById(workspaceId, result.taskId)
            if (loaded?.spec) {
              const patched = { ...loaded.spec, cwd: sessionCwd }
              repo.updateTaskSpec(workspaceId, result.taskId, patched)
            }
            // 同步会话工作目录（Agent 会话运行时同目录）
            updateAgentSessionMeta(result.orchestratorSessionId, { workingDirectory: sessionCwd })
          }
        }
        created.push({ taskId: result.taskId, slug: result.slug, title: task.title })
      } catch (error) {
        console.error(`[Teambition] 创建任务「${task.title}」失败:`, error)
        failed.push({ title: task.title, reason: errorMessage(error) })
      }
    }

    return { ok: true, created, skipped, failed }
  })

  // 本地 Agent 看板中已存在的 TB 任务 ID 集合（按 teambitionTaskId 收集）
  const collectLocalTbTaskIds = (workspaceRoot: string, workspaceId: string): Set<string> => {
    const repository = new TaskRepository({ resolveWorkspaceRoot: () => workspaceRoot })
    const ids = new Set<string>()
    for (const aggregate of repository.listTaskAggregates(workspaceId)) {
      const tbTaskId = aggregate.spec?.teambitionTaskId ?? aggregate.record?.teambitionTaskId
      if (tbTaskId) ids.add(tbTaskId)
    }
    return ids
  }

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.LIST_LOCAL_TB_TASK_IDS, async (_event, workspaceRoot: string, workspaceId: string) => {
    return [...collectLocalTbTaskIds(workspaceRoot, workspaceId)]
  })

  ipcMain.handle(TEAMBITION_IPC_CHANNELS.RECOGNIZE, async (_event, workspaceRoot: string) => {
    const { getWorkspaceMcpConfig } = await import('./agent-workspace-manager')
    const { recognizeTeambitionMcp } = await import('@yoda/shared')
    const slug = basename(workspaceRoot)
    return recognizeTeambitionMcp(getWorkspaceMcpConfig(slug))
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

  // ===== TB 缺陷看板（研发三区视图 / 状态流转 / 写回） =====
  const boardService = (workspaceRoot: string) => getTeambitionBoardService(workspaceRoot)

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.GET_CURRENT_USER, async (_event, workspaceRoot: string) => {
    return (await boardService(workspaceRoot)).getCurrentUserId()
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.LIST_MY_DEFECTS, async (_event, workspaceRoot: string, roleTypes?: string) => {
    return (await boardService(workspaceRoot)).listMyDefects(roleTypes)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.LIST_CLOSED_DEFECTS, async (_event, workspaceRoot: string, days: number) => {
    return (await boardService(workspaceRoot)).listClosedDefects(days)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.LIST_PROJECT_DEFECTS, async (_event, workspaceRoot: string, projectId: string) => {
    return (await boardService(workspaceRoot)).listProjectDefects(projectId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.GET_WORKFLOW, async (_event, workspaceRoot: string, taskId: string, projectId?: string) => {
    return (await boardService(workspaceRoot)).getTaskWorkflow(taskId, projectId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.GET_WORKFLOWS_BATCH, async (_event, workspaceRoot: string, taskIds: string[], projectId?: string) => {
    return (await boardService(workspaceRoot)).listWorkflowsForTasks(taskIds, projectId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.LIST_TRANSITIONS, async (_event, workspaceRoot: string, taskId: string) => {
    return (await boardService(workspaceRoot)).listTransitions(taskId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.GET_TASK_DETAIL, async (_event, workspaceRoot: string, taskId: string) => {
    return (await boardService(workspaceRoot)).getTaskDetail(taskId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.CLAIM_TASK, async (_event, workspaceRoot: string, taskId: string) => {
    return (await boardService(workspaceRoot)).claimTask(taskId)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.UPDATE_STATUS, async (
    _event,
    workspaceRoot: string,
    taskId: string,
    targetTfsId: string,
    note?: string,
  ) => {
    return (await boardService(workspaceRoot)).updateStatus(taskId, targetTfsId, note)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.POST_COMMENT, async (_event, workspaceRoot: string, taskId: string, text: string) => {
    return (await boardService(workspaceRoot)).postComment(taskId, text)
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.IS_MOCK, async (_event, workspaceRoot: string) => {
    return (await boardService(workspaceRoot)).isMock()
  })

  ipcMain.handle(TEAMBITION_BOARD_IPC_CHANNELS.CLEAR_CACHE, async (_event, workspaceRoot: string) => {
    ;(await boardService(workspaceRoot)).clearCache()
  })

  // 按会话读取分析报告文件（log/**/ 下的 qxdm 报告 / HTML 报告），供 TB 详情「AI 分析预览」展示
  ipcMain.handle(
    TEAMBITION_BOARD_IPC_CHANNELS.RESOLVE_ANALYSIS_REPORT,
    async (_event, workspaceRoot: string, workspaceSlug: string, sessionId: string): Promise<string> => {
      try {
        const sessionDir = getAgentSessionWorkspacePath(workspaceSlug, sessionId)
        if (!sessionDir || !existsSync(sessionDir)) return ''
        // ① 约定路径优先：log/{shortId}/分析报告.md → 分析报告.html
        //    报告路径契约见 connect-tb-workflow SKILL.md（v2.8.0+），避免 AI 写偏导致预览取不到
        const candidates = await findReportAtConvention(sessionDir)
        for (const candidate of candidates) {
          if (candidate && existsSync(candidate)) {
            const text = readFileSync(candidate, 'utf-8').trim()
            if (text) return text
          }
        }
        // ② 兜底：递归扫描 log 目录（兼容旧报告位置，如 diag_logs/qxdm_sim_analysis_report.md）
        const reportNames = /(analysis_report|分析报告|_SIM_Analysis_Report|evidence)\.(md|html|markdown)$/i
        const found = findReportInDir(sessionDir, reportNames)
        return found ? readFileSync(found, 'utf-8') : ''
      } catch {
        return ''
      }
    },
  )
}

/** 按约定路径查找报告：log 目录下的分析报告（优先 md）；返回按优先级排序的候选绝对路径 */
export async function findReportAtConvention(sessionDir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const out: string[] = []
  const logDirs: string[] = []
  try {
    const entries = await readdir(sessionDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'log') logDirs.push(join(sessionDir, entry.name))
      // 兼容工作区根直接放报告的场景（如历史版本）
      for (const name of ['分析报告.md', '分析报告.html']) {
        const p = join(sessionDir, entry.name, name)
        if (existsSync(p)) out.push(p)
      }
    }
  } catch {
    return []
  }
  // 在 log 及其一层子目录找约定文件名
  for (const logDir of logDirs) {
    for (const name of ['分析报告.md', '分析报告.html']) {
      const p = join(logDir, name)
      if (existsSync(p)) out.push(p)
    }
    try {
      const subs = await readdir(logDir, { withFileTypes: true })
      for (const sub of subs) {
        if (!sub.isDirectory()) continue
        for (const name of ['分析报告.md', '分析报告.html']) {
          const p = join(logDir, sub.name, name)
          if (existsSync(p)) out.push(p)
        }
      }
    } catch {
      // ignore
    }
  }
  return out
}

/** 递归在目录下查找第一个匹配报告文件名的文件 */
export function findReportInDir(dir: string, namePattern: RegExp, depth = 0): string | null {
  if (depth > 5) return null
  let entries: Array<{ name: string; path: string; isDir: boolean }> = []
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      path: join(dir, entry.name),
      isDir: entry.isDirectory(),
    }))
  } catch {
    return null
  }
  // 优先当前层的报告文件，再递归子目录（log 目录优先）
  // 注意：md 报告（四段式，可解析）优先于 HTML；HTML 仅兜底（结构为 <h2> 标题）
  const files = entries.filter((e) => !e.isDir)
  // 第一轮：md/markdown 报告
  for (const file of files) {
    if (/\.(md|markdown)$/i.test(file.name) && namePattern.test(file.name)) return file.path
  }
  const dirs = entries.filter((e) => e.isDir).sort((a, b) => (a.name === 'log' ? -1 : b.name === 'log' ? 1 : 0))
  for (const d of dirs) {
    const hit = findReportInDir(d.path, namePattern, depth + 1)
    if (hit) return hit
  }
  // 第二轮：HTML 报告（当前层 + 递归）
  for (const file of files) {
    if (/\.html?$/i.test(file.name) && namePattern.test(file.name)) return file.path
  }
  for (const d of dirs) {
    const hit = findReportInDir(d.path, namePattern, depth + 1)
    if (hit) return hit
  }
  return null
}

async function generateTaskForSession(
  _workspaceRoot: string,
  workspaceId: string,
  request: { goal: string; title?: string; projectId?: string; model?: string; llmConnection?: string; permissionMode?: string },
  sessionId: string,
): Promise<void> {
  const host = await getSessionHost()
  let prompt = buildGeneratorPrompt(request.goal, request.title)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await sendGenerationPrompt(host, sessionId, prompt)
      const yaml = extractYaml(text)
      if (isAgentServiceErrorText(yaml)) throw new Error(yaml)
      const parsed = parseTaskYaml(yaml)
      if (parsed.valid && parsed.spec) {
        // Generate 只返回可编辑草稿，不落盘 task.yaml；正式写入必须等用户点击「创建」。
        await host.setSessionStatus(sessionId, 'done')
        sendToMainWindow(TASK_IPC_CHANNELS.GENERATED, {
          kind: 'tasks:generated',
          workspaceId,
          orchestratorSessionId: sessionId,
          status: 'saved',
          slug: parsed.spec.id,
          spec: parsed.spec,
          yaml,
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

const teambitionBoardServices = new Map<string, TeambitionBoardService>()

async function getTeambitionBoardService(workspaceRoot: string): Promise<TeambitionBoardService> {
  const existing = teambitionBoardServices.get(workspaceRoot)
  if (existing) return existing
  const service = new TeambitionBoardService({
    gateway: await getTeambitionBoardAdapter(workspaceRoot),
  })
  teambitionBoardServices.set(workspaceRoot, service)
  return service
}

/** 拉取 TB 任务详情（CREATE_SYNCED_TASKS 填充问题描述用；失败抛出由调用方降级） */
async function getTeambitionBoardDetail(workspaceRoot: string, taskId: string) {
  return (await getTeambitionBoardService(workspaceRoot)).getTaskDetail(taskId)
}

/** 构造看板网关：优先真实 TB MCP，未配置则 Mock 兜底。 */
async function getTeambitionBoardAdapter(workspaceRoot: string): Promise<TeambitionBoardGateway> {
  try {
    const { getWorkspaceMcpConfig } = await import('./agent-workspace-manager')
    const { findTeambitionMcpEntry } = await import('@yoda/shared')
    const config = getWorkspaceMcpConfig(getWorkspaceSlugFromRoot(workspaceRoot))
    const tb = findTeambitionMcpEntry(config)

    if (tb && tb.entry.enabled !== false && tb.entry.url) {
      const { McpTeambitionBoardAdapter } = await import('./teambition-board-adapter')
      const entry = tb.entry
      const headers = entry.headers ?? {}
      const adapter = new McpTeambitionBoardAdapter({
        server: { ...entry, type: 'http', headers },
        toolNames: {
          getCurrentUser: 'GetUsersMe',
          listMyOpenTasks: 'SearchUserTasksV3',
          listProjectTasks: 'SearchProjectTasksV3',
          getScenarioFields: 'GetScenarioFieldsMCP',
          queryTaskTfs: 'QueryTaskTfs',
          listTaskActivities: 'ListTaskActivitiesV3',
          updateExecutor: 'UpdateTaskExecutorV3',
          updateStatus: 'UpdateTaskStatusV3',
          postComment: 'CreateTaskCommentV3',
          getTaskDetail: 'QueryTaskV3',
          listProjectCustomFields: 'SearchProjectCustomFiledsV3',
          searchTasksByTql: 'SearchTasksByTQLV2',
          queryProjects: 'QueryProjectsV3',
        },
      })
      console.warn(`[TbBoard] 已连接真实 TB MCP (${tb.name})`)
      return adapter
    }
  } catch (error) {
    console.warn(`[TbBoard] 构造 TB 看板 adapter 失败，使用 Mock 兜底: ${errorMessage(error)}`)
  }

  const { MockTeambitionBoardAdapter } = await import('./teambition-board-adapter')
  console.warn('[TbBoard] 未找到已启用的 TB MCP 配置，使用 Mock 兜底（仅开发/断连降级，不会写回真实 TB）')
  return new MockTeambitionBoardAdapter()
}

async function getTeambitionService(workspaceRoot: string): Promise<TeambitionService> {
  const existing = teambitionServices.get(workspaceRoot)
  if (existing) return existing
  const service = new TeambitionService({
    storagePath: join(workspaceRoot, 'teambition-bindings.json'),
    gateway: await getTeambitionAdapter(workspaceRoot),
  })
  teambitionServices.set(workspaceRoot, service)
  return service
}

interface TeambitionAdapterInfo {
  adapter: import('./teambition-adapter').TeambitionAdapter
  isMock: boolean
}

async function getTeambitionAdapter(workspaceRoot: string): Promise<import('./teambition-adapter').TeambitionAdapter> {
  return (await getTeambitionAdapterInfo(workspaceRoot)).adapter
}

async function getTeambitionAdapterInfo(workspaceRoot: string): Promise<TeambitionAdapterInfo> {
  // 真实 MCP adapter 可缓存；Mock 不缓存（用户配置 TB 后应能重试真实连接）
  if (teambitionAdapter && !(teambitionAdapter instanceof MockTeambitionAdapter)) {
    return { adapter: teambitionAdapter, isMock: false }
  }
  try {
    // 宽松识别工作区 mcp.json 中的 Teambition MCP（TB-Connect 或自定义名/URL 匹配）
    const { getWorkspaceMcpConfig } = await import('./agent-workspace-manager')
    const { findTeambitionMcpEntry } = await import('@yoda/shared')
    const config = getWorkspaceMcpConfig(getWorkspaceSlugFromRoot(workspaceRoot))
    const tb = findTeambitionMcpEntry(config)

    if (tb && tb.entry.enabled !== false && tb.entry.url) {
      const { McpTeambitionAdapter } = await import('./teambition-adapter')
      const entry = tb.entry
      // HTTP MCP：TB 网关 URL 直接来自用户配置；userToken 通过 headers 携带（若配置里有）
      const headers = entry.headers ?? {}
      teambitionAdapter = new McpTeambitionAdapter({
        server: { ...entry, type: 'http', headers },
        toolNames: {
          listTasks: 'SearchUserTasksV3',
          getTaskDetail: 'QueryTaskV3',
          updateStatus: 'UpdateTaskStatusV3',
          postComment: 'CreateTaskCommentV3',
          listMyOpenTasks: 'SearchUserTasksV3',
          searchTasksByTql: 'SearchTasksByTQLV2',
          getCurrentUser: 'GetUsersMe',
          getScenarioFields: 'GetScenarioFieldsMCP',
        },
      })
      console.warn(`[Teambition] 已连接 TB MCP (${tb.name})`)
      return { adapter: teambitionAdapter, isMock: false }
    }

    const { MockTeambitionAdapter } = await import('./teambition-adapter')
    const mock = new MockTeambitionAdapter()
    console.warn('[Teambition] 未找到已启用的 TB MCP 配置，使用本地 Mock 适配器')
    return { adapter: mock, isMock: true }
  } catch (error) {
    throw new Error(`Teambition adapter 不可用: ${errorMessage(error)}`)
  }
}

/** 从 workspaceRoot 提取 slug（agent-workspaces 根目录的最后一段） */
function getWorkspaceSlugFromRoot(workspaceRoot: string): string {
  return basename(workspaceRoot)
}
