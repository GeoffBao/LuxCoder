import { describe, expect, mock, test } from 'bun:test'

mock.module('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  app: { getPath: () => '/tmp/luxagents-test', isPackaged: false },
  clipboard: {},
  dialog: {},
  globalShortcut: {},
  ipcMain: { handle: () => undefined },
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
  })
})
