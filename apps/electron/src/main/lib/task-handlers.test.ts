import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROJECT_IPC_CHANNELS } from '@luxcoder/shared/channels'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'

type RegisteredHandler = (...args: unknown[]) => unknown

const registeredHandlers = new Map<string, RegisteredHandler>()

mock.module('electron', () => ({
  BrowserWindow: class BrowserWindow {
    isDestroyed(): boolean { return false }
    webContents = {
      isDestroyed: (): boolean => false,
      send: (): undefined => undefined,
    }
  },
  app: { getPath: () => '/tmp/luxcoder-test', isPackaged: false },
  clipboard: {},
  dialog: {},
  globalShortcut: {},
  ipcMain: {
    handle: (channel: string, handler: RegisteredHandler) => {
      registeredHandlers.set(channel, handler)
    },
  },
  nativeImage: {},
  nativeTheme: {},
  net: {},
  powerMonitor: {},
  powerSaveBlocker: {},
  safeStorage: {},
  screen: {},
  shell: {},
  systemPreferences: {},
}))

const {
  pauseTaskRun,
  stopTaskRun,
}: typeof import('./task-handlers') = await import('./task-handlers')
const taskHandlers = await import('./task-handlers')
type TaskRunnerController = import('./task-handlers').TaskRunnerController

function createController(): {
  controller: TaskRunnerController
  paused: Array<{ slug: string; runId: string }>
  stopped: Array<{ slug: string; runId: string }>
} {
  const paused: Array<{ slug: string; runId: string }> = []
  const stopped: Array<{ slug: string; runId: string }> = []
  return {
    controller: {
      pause: (slug, runId) => paused.push({ slug, runId }),
      stop: async (slug, runId) => { stopped.push({ slug, runId }) },
    },
    paused,
    stopped,
  }
}

describe('task handler runner hydration', () => {
  test('pause 从 resolver 获取 runner，而不是只操作内存注册表', async () => {
    const { controller, paused } = createController()
    let resolved = false

    await pauseTaskRun(
      async () => {
        resolved = true
        return controller
      },
      '/workspace',
      'workspace-1',
      'demo-task',
      'run-1',
    )

    expect(resolved).toBe(true)
    expect(paused).toEqual([{ slug: 'demo-task', runId: 'run-1' }])
  })

  test('stop 从 resolver 获取 runner，而不是缺少内存 runner 时静默返回', async () => {
    const { controller, stopped } = createController()
    let resolved = false

    await stopTaskRun(
      async () => {
        resolved = true
        return controller
      },
      '/workspace',
      'workspace-1',
      'demo-task',
      'run-1',
    )

    expect(resolved).toBe(true)
    expect(stopped).toEqual([{ slug: 'demo-task', runId: 'run-1' }])
  })
})

describe('task handler Kanban payloads', () => {
  test('项目 create/update handlers 返回 preload 可解包的 LoadedProject', () => {
    const registerHandlers = Reflect.get(taskHandlers, 'registerTaskHandlers')
    expect(registerHandlers).toBeInstanceOf(Function)
    if (typeof registerHandlers !== 'function') return

    const windowStub = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: () => undefined,
      },
    } as unknown as ElectronBrowserWindow
    registerHandlers(windowStub)
    const createHandler = registeredHandlers.get(PROJECT_IPC_CHANNELS.CREATE)
    const updateHandler = registeredHandlers.get(PROJECT_IPC_CHANNELS.UPDATE)
    expect(createHandler).toBeInstanceOf(Function)
    expect(updateHandler).toBeInstanceOf(Function)
    if (!createHandler || !updateHandler) return

    const workspaceRoot = mkdtempSync(join(tmpdir(), 'luxcoder-project-handler-'))
    try {
      const created = createHandler(undefined, workspaceRoot, { name: '发布计划' })
      expect(created).toEqual(expect.objectContaining({
        config: expect.objectContaining({ name: '发布计划' }),
        workspaceRootPath: workspaceRoot,
      }))

      if (typeof created !== 'object' || created === null) throw new Error('create handler 未返回对象')
      const config = Reflect.get(created, 'config')
      if (typeof config !== 'object' || config === null) throw new Error('create handler 未返回 config')
      const slug = Reflect.get(config, 'slug')
      if (typeof slug !== 'string') throw new Error('create handler 未返回 slug')
      const updated = updateHandler(undefined, workspaceRoot, slug, { description: '桌面端' })
      expect(updated).toEqual(expect.objectContaining({
        config: expect.objectContaining({ description: '桌面端' }),
        workspaceRootPath: workspaceRoot,
      }))
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  test('set_kanban_column 返回更新后的 AgentSessionMeta', () => {
    const setKanbanColumn = Reflect.get(taskHandlers, 'setSessionKanbanColumn')
    expect(setKanbanColumn).toBeInstanceOf(Function)
    if (typeof setKanbanColumn !== 'function') return

    const result = setKanbanColumn('session-1', 'done', (sessionId: string, updates: { kanbanColumn?: string }) => ({
      id: sessionId,
      title: '任务会话',
      createdAt: 1,
      updatedAt: 2,
      ...updates,
    }))

    expect(result).toEqual(expect.objectContaining({ id: 'session-1', kanbanColumn: 'done' }))
  })

  test('validate payload 保留 warnings', () => {
    const buildPayload = Reflect.get(taskHandlers, 'buildTaskValidationPayload')
    expect(buildPayload).toBeInstanceOf(Function)
    if (typeof buildPayload !== 'function') return

    const warnings = [{ file: 'task.yaml', path: 'nodes.a', message: '依赖建议', severity: 'warning' as const }]
    const result = buildPayload({ valid: true, errors: [], warnings })

    expect(result).toEqual(expect.objectContaining({ valid: true, errors: [], warnings }))
  })

  test('set_kanban_column 可同步 dropStatusId 到 sessionStatus', () => {
    const setKanbanColumn = Reflect.get(taskHandlers, 'setSessionKanbanColumn')
    expect(setKanbanColumn).toBeInstanceOf(Function)
    if (typeof setKanbanColumn !== 'function') return

    const result = setKanbanColumn(
      'session-1',
      'in-progress',
      (sessionId: string, updates: { kanbanColumn?: string; sessionStatus?: string }) => ({
        id: sessionId,
        title: '任务会话',
        createdAt: 1,
        updatedAt: 2,
        ...updates,
      }),
      { sessionStatus: 'coding' },
    )

    expect(result).toEqual(expect.objectContaining({
      id: 'session-1',
      kanbanColumn: 'in-progress',
      sessionStatus: 'coding',
    }))
  })

  test('set_project_id 有有效 cwd 时写入 workingDirectory，解绑不清除', () => {
    const buildUpdates = Reflect.get(taskHandlers, 'buildSetProjectIdUpdates')
    expect(buildUpdates).toBeInstanceOf(Function)
    if (typeof buildUpdates !== 'function') return

    expect(buildUpdates('proj-1', '/repo/app')).toEqual({
      projectId: 'proj-1',
      workingDirectory: '/repo/app',
    })
    // 无有效 cwd（不可用外部目录）：不带 workingDirectory 键，保留会话已有目录
    expect(buildUpdates('proj-1', undefined)).toEqual({ projectId: 'proj-1' })
    expect(Object.hasOwn(buildUpdates('proj-1', undefined) as object, 'workingDirectory')).toBe(false)
    // 解绑：清空 projectId，但不写 workingDirectory
    expect(buildUpdates(undefined, undefined)).toEqual({ projectId: undefined })
    expect(Object.hasOwn(buildUpdates(undefined, '/repo/app') as object, 'workingDirectory')).toBe(false)
  })

  test('采用生成草稿时清除 taskDraft 并恢复待办状态', () => {
    const buildPatch = Reflect.get(taskHandlers, 'buildAdoptedTaskSessionPatch')
    expect(buildPatch).toBeInstanceOf(Function)
    if (typeof buildPatch !== 'function') return

    expect(buildPatch({ id: 'release-task', project: 'project-a' })).toEqual({
      taskSlug: 'release-task',
      projectId: 'project-a',
      taskDraft: undefined,
      sessionStatus: 'todo',
    })

    expect(buildPatch(
      {
        id: 'release-task',
        project: 'project-a',
        cwd: '/Users/me/repo',
        defaults: { model: 'claude-sonnet', llmConnection: 'channel-1', permissionMode: 'allow-all' },
      },
      '/workspace',
    )).toEqual({
      taskSlug: 'release-task',
      projectId: 'project-a',
      workingDirectory: '/Users/me/repo',
      modelId: 'claude-sonnet',
      channelId: 'channel-1',
      permissionMode: 'bypassPermissions',
      taskDraft: undefined,
      sessionStatus: 'todo',
    })
  })
})
