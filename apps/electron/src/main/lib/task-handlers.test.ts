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
