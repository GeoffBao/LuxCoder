/**
 * CodeClaw 桌面助手窗口管理
 *
 * 移植自 clawd-on-desk（AGPL-3.0-only）Mini 模式的核心机制：
 * - 进入 Mini：窗口吸附到屏幕边缘，只露出 PEEK_OFFSET 宽的一条边
 * - 悬停 Peek：鼠标移到贴边条上时窗口探出，移开缩回
 * - 退出 Mini：恢复进入前的记忆位置
 * - 尺寸档位 S/M/L：调整窗口尺寸并记忆
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { CodeClawSize } from '@myyoda/shared'
import { getSettings, updateSettings } from './settings-service'

const CODECLAW_DEFAULT_WIDTH = 220
const CODECLAW_DEFAULT_HEIGHT = 220
const CODECLAW_MIN_X_MARGIN = 12
const CODECLAW_MIN_Y_MARGIN = 12

/** 尺寸档位 → 窗口边长（桌宠为正方形窗口）。 */
const CODECLAW_SIZE_MAP: Record<CodeClawSize, number> = { s: 160, m: 220, l: 280 }

/** Mini 模式贴边时露出的像素宽度（与上游 PEEK_OFFSET=25 一致）。 */
const MINI_PEEK_OFFSET = 25

let codeClawWindow: BrowserWindow | null = null
let readyCallbacks: Array<() => void> = []

/** Mini 模式进入前记忆的窗口位置（退出时恢复）。 */
let preMiniX = 0
let preMiniY = 0
let miniMode = false
let miniEdge: 'left' | 'right' = 'right'

export function onCodeClawWindowReady(cb: () => void): void {
  readyCallbacks.push(cb)
}

function getInitialBounds(): { x: number; y: number; width: number; height: number } {
  const settings = getSettings().codeClaw
  const size = CODECLAW_SIZE_MAP[settings?.size ?? 'm'] ?? CODECLAW_DEFAULT_WIDTH
  const width = size
  const height = size
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
      additionalArguments: ['--myyoda-window=codeclaw'],
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
  // Mini 模式下位置不持久化，避免贴边坐标污染用户记忆位置。
  if (miniMode) return
  const current = getSettings().codeClaw ?? {}
  updateSettings({ codeClaw: { ...current, x: next.x, y: next.y } })
}

/** 贴边吸附：把窗口放到目标边缘，只露出 MINI_PEEK_OFFSET 宽的一条边。 */
function snapToEdge(edge: 'left' | 'right', y: number): void {
  const win = getCodeClawWindow()
  if (!win) return
  const area = getWorkAreaForWindow(win)
  const x = edge === 'right'
    ? Math.round(area.x + area.width - win.getBounds().width - MINI_PEEK_OFFSET)
    : Math.round(area.x - win.getBounds().width + MINI_PEEK_OFFSET)
  win.setPosition(x, Math.round(y), false)
}

/** 探出/缩回：peek=true 完全移出窗口（宠物可见），false 缩回贴边。 */
function applyPeek(peek: boolean): void {
  const win = getCodeClawWindow()
  if (!win || !miniMode) return
  const area = getWorkAreaForWindow(win)
  const { width } = win.getBounds()
  const x = miniEdge === 'right'
    ? (peek ? Math.round(area.x + area.width - width) : Math.round(area.x + area.width - width - MINI_PEEK_OFFSET))
    : (peek ? Math.round(area.x) : Math.round(area.x - width + MINI_PEEK_OFFSET))
  win.setPosition(x, win.getBounds().y, false)
}

function getWorkAreaForWindow(win: BrowserWindow): Electron.Rectangle {
  const bounds = win.getBounds()
  return screen.getDisplayNearestPoint({ x: bounds.x + Math.round(bounds.width / 2), y: bounds.y + Math.round(bounds.height / 2) }).workArea
}

/**
 * 进入/退出 Mini 模式。
 * 进入时记住当前窗口位置并贴边吸附；退出时恢复记忆位置（若有效）。
 */
export function setCodeClawMiniMode(mini: boolean, edge: 'left' | 'right' = 'right'): void {
  const win = getCodeClawWindow()
  if (!win) return
  if (mini === miniMode) return
  if (mini) {
    const bounds = win.getBounds()
    preMiniX = bounds.x
    preMiniY = bounds.y
    miniEdge = edge
    miniMode = true
    snapToEdge(edge, preMiniY)
  } else {
    miniMode = false
    if (Number.isFinite(preMiniX) && Number.isFinite(preMiniY)) {
      const next = clampToNearestDisplay(preMiniX, preMiniY)
      win.setPosition(next.x, next.y, false)
      const current = getSettings().codeClaw ?? {}
      updateSettings({ codeClaw: { ...current, x: next.x, y: next.y } })
    }
  }
}

/** Mini 模式下悬停探出（peek=true）或缩回（peek=false）。 */
export function setCodeClawPeek(peek: boolean): void {
  if (!miniMode) return
  applyPeek(peek)
}

/**
 * 调整桌宠窗口尺寸（S/M/L），保持窗口中心不动并记忆到 settings。
 * Mini 模式下不调整（贴边几何由 mini 状态机管理）。
 */
export function resizeCodeClawWindow(size: CodeClawSize): void {
  const win = getCodeClawWindow()
  const edge = CODECLAW_SIZE_MAP[size] ?? CODECLAW_DEFAULT_WIDTH
  if (!win) {
    // 窗口尚未创建：仅记忆尺寸，下次创建时生效。
    const current = getSettings().codeClaw ?? {}
    updateSettings({ codeClaw: { ...current, size } })
    return
  }
  const bounds = win.getBounds()
  const nextX = Math.round(bounds.x + (bounds.width - edge) / 2)
  const nextY = Math.round(bounds.y + (bounds.height - edge) / 2)
  win.setBounds({ x: nextX, y: nextY, width: edge, height: edge }, false)
  if (miniMode) return
  const current = getSettings().codeClaw ?? {}
  updateSettings({ codeClaw: { ...current, size, x: nextX, y: nextY } })
}

/** 读取当前记忆的尺寸档位。 */
export function getCodeClawSize(): CodeClawSize {
  const size = getSettings().codeClaw?.size
  return size === 's' || size === 'l' ? size : 'm'
}
