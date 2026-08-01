/**
 * CodeClaw 桌面助手窗口管理
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getSettings, updateSettings } from './settings-service'

const CODECLAW_DEFAULT_WIDTH = 220
const CODECLAW_DEFAULT_HEIGHT = 220
const CODECLAW_MIN_X_MARGIN = 12
const CODECLAW_MIN_Y_MARGIN = 12

let codeClawWindow: BrowserWindow | null = null
let readyCallbacks: Array<() => void> = []

export function onCodeClawWindowReady(cb: () => void): void {
  readyCallbacks.push(cb)
}

function getInitialBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings().codeClaw
  const width = CODECLAW_DEFAULT_WIDTH
  const height = CODECLAW_DEFAULT_HEIGHT
  if (typeof settings?.x === 'number' && typeof settings?.y === 'number') {
    return { x: settings.x, y: settings.y, width, height }
  }
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  return {
    x: Math.round(area.x + area.width - width - 28),
    y: Math.round(area.y + area.height - height - 28),
    width,
    height,
  }
}

function clampToNearestDisplay(x: number, y: number): { x: number; y: number } {
  const point = { x: Math.round(x), y: Math.round(y) }
  const display = screen.getDisplayNearestPoint(point)
  const area = display.workArea
  return {
    x: Math.max(area.x + CODECLAW_MIN_X_MARGIN, Math.min(area.x + area.width - CODECLAW_MIN_X_MARGIN, point.x)),
    y: Math.max(area.y + CODECLAW_MIN_Y_MARGIN, Math.min(area.y + area.height - CODECLAW_MIN_Y_MARGIN, point.y)),
  }
}

export function createCodeClawWindow(): BrowserWindow | null {
  if (codeClawWindow && !codeClawWindow.isDestroyed()) return codeClawWindow

  const bounds = getInitialBounds()
  codeClawWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ['--luxcoder-window=codeclaw'],
    },
  })

  codeClawWindow.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'screen-saver')
  codeClawWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  // 必须与主窗口统一使用 app.isPackaged 判断。开发启动脚本不保证设置
  // NODE_ENV；若误判为生产环境会加载过期 dist/renderer，进而在 220×220
  // 桌宠窗口渲染完整主界面。
  const isDev = !app.isPackaged
  const loadPromise = isDev
    ? codeClawWindow.loadURL('http://127.0.0.1:5173?window=codeclaw')
    : codeClawWindow.loadFile(join(__dirname, 'renderer', 'index.html'), {
      query: { window: 'codeclaw' },
    })
  void loadPromise.catch((error: unknown) => {
    console.error('[CodeClaw] failed to load its renderer', error)
  })

  codeClawWindow.webContents.once('did-finish-load', () => {
    for (const cb of readyCallbacks) cb()
    readyCallbacks = []
  })

  codeClawWindow.on('closed', () => {
    codeClawWindow = null
  })

  return codeClawWindow
}

export function showCodeClawWindow(): void {
  const win = createCodeClawWindow()
  if (!win || win.isDestroyed()) return
  if (!win.isVisible()) win.showInactive()
}

export function hideCodeClawWindow(): void {
  if (codeClawWindow && !codeClawWindow.isDestroyed()) codeClawWindow.hide()
}

export function destroyCodeClawWindow(): void {
  if (codeClawWindow && !codeClawWindow.isDestroyed()) codeClawWindow.destroy()
  codeClawWindow = null
}

export function getCodeClawWindow(): BrowserWindow | null {
  return codeClawWindow && !codeClawWindow.isDestroyed() ? codeClawWindow : null
}

export function moveCodeClawWindow(x: number, y: number): void {
  const win = getCodeClawWindow()
  if (!win) return
  const next = clampToNearestDisplay(x, y)
  win.setPosition(next.x, next.y, false)
  const current = getSettings().codeClaw ?? {}
  updateSettings({ codeClaw: { ...current, x: next.x, y: next.y } })
}
