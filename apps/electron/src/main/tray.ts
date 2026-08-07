import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { listAgentSessions } from './lib/agent-session-manager'
import { listAgentWorkspaces } from './lib/agent-workspace-manager'
import { isAgentSessionActive } from './lib/agent-service'
import { createTrayMenuModel, type TrayRecentSessionItem } from './lib/tray-menu-model'
import { getSettings, updateSettings } from './lib/settings-service'
import {
  getCodeClawControlSnapshot,
  publishCodeClawNow,
  setCodeClawDnd,
  setCodeClawMiniModeControl,
  setCodeClawSize,
  setCodeClawSound,
  setCodeClawTheme,
} from './lib/codeclaw-service'
import { CODECLAW_THEMES, type CodeClawSize } from '@myyoda/shared'

let tray: Tray | null = null

export interface TrayActions {
  showMainWindow: () => void
  showPlanningWindow: () => void
  openAgentSession: (sessionId: string, title: string) => void
  createChatSession: () => void
  createAgentSession: () => void
}

/**
 * 获取托盘图标路径
 * 所有平台统一使用 Template 图标
 */
function getTrayIconPath(): string {
  // dev: __dirname/resources（build:resources 拷贝产物）
  // prod: process.resourcesPath（electron-builder extraResources 产物）
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'logos')
    : join(__dirname, 'resources/logos')
  return join(resourcesDir, 'iconTemplate.png')
}

/** 显示主窗口 */
function showMainWindow(): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return
  const mainWindow = windows[0]!
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function getDefaultTrayActions(): TrayActions {
  return {
    showMainWindow,
    showPlanningWindow: showMainWindow,
    openAgentSession: () => showMainWindow(),
    createChatSession: () => showMainWindow(),
    createAgentSession: () => showMainWindow(),
  }
}

function createRecentSessionMenuItem(
  item: TrayRecentSessionItem,
  actions: TrayActions,
): Electron.MenuItemConstructorOptions {
  return {
    label: item.title,
    sublabel: item.subtitle,
    click: () => actions.openAgentSession(item.id, item.title),
  }
}

/** 启用 CodeClaw 桌宠（未启用时托盘提供入口）。 */
function enableCodeClaw(): void {
  const current = getSettings().codeClaw ?? {}
  updateSettings({ codeClaw: { ...current, enabled: true } })
  // tray 直接 updateSettings 不走 ipc settings:update handler，需主动发布让桌宠窗口出现。
  publishCodeClawNow()
}

/** 构建托盘「桌宠」控制菜单组（复用 codeclaw-service 的控制能力）。 */
function buildCodeClawTrayGroup(): Electron.MenuItemConstructorOptions[] {
  const snapshot = getCodeClawControlSnapshot()
  const sizeLabels: Array<[CodeClawSize, string]> = [['s', '小'], ['m', '中'], ['l', '大']]
  return [
    { type: 'separator' },
    {
      label: snapshot.enabled ? '桌宠' : '桌宠（未启用）',
      submenu: snapshot.enabled
        ? [
            {
              label: snapshot.miniMode ? '退出 Mini 模式' : '进入 Mini 模式',
              click: () => setCodeClawMiniModeControl(!snapshot.miniMode),
            },
            {
              label: '主题',
              submenu: CODECLAW_THEMES.map((theme) => ({
                label: theme.name,
                type: 'radio' as const,
                checked: theme.id === snapshot.themeId,
                click: () => setCodeClawTheme(theme.id),
              })),
            },
            {
              label: '尺寸',
              submenu: sizeLabels.map(([id, label]) => ({
                label,
                type: 'radio' as const,
                checked: snapshot.size === id,
                click: () => setCodeClawSize(id),
              })),
            },
            { type: 'separator' },
            {
              label: '免打扰',
              type: 'checkbox' as const,
              checked: snapshot.dnd,
              click: (item) => setCodeClawDnd(item.checked),
            },
            {
              label: '音效',
              type: 'checkbox' as const,
              checked: snapshot.soundEnabled,
              click: (item) => setCodeClawSound(item.checked),
            },
          ]
        : [
            {
              label: '启用 CodeClaw 桌宠',
              click: () => enableCodeClaw(),
            },
          ],
    },
  ]
}

function buildTrayMenu(actions: TrayActions): Menu {
  const sessions = listAgentSessions()
  const runningSessionIds = new Set(
    sessions
      .filter((session) => isAgentSessionActive(session.id))
      .map((session) => session.id)
  )
  const model = createTrayMenuModel(sessions, listAgentWorkspaces(), runningSessionIds)
  const runningItems = model.runningSessions.map((item) => createRecentSessionMenuItem(item, actions))
  const recentItems = model.recentSessions.map((item) => createRecentSessionMenuItem(item, actions))
  const moreItems = model.moreSessions.map((item) => createRecentSessionMenuItem(item, actions))

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '任务/日程',
      click: () => actions.showPlanningWindow(),
    },
    { type: 'separator' },
    ...(runningItems.length > 0
      ? [
          { label: '运行中', enabled: false },
          ...runningItems,
          { type: 'separator' as const },
        ]
      : []),
    { label: '最近', enabled: false },
    ...(recentItems.length > 0
      ? recentItems
      : [{ label: '暂无最近会话', enabled: false }]),
    ...(moreItems.length > 0
      ? [{
          label: '更多',
          submenu: moreItems,
        }]
      : []),
    { type: 'separator' },
    {
      label: '新建对话',
      click: () => actions.createChatSession(),
    },
    {
      label: '新建 Agent 会话',
      click: () => actions.createAgentSession(),
    },
    { type: 'separator' },
    {
      label: '打开 MyYoda',
      click: () => actions.showMainWindow(),
    },
    ...buildCodeClawTrayGroup(),
    { type: 'separator' },
    {
      label: '退出 MyYoda',
      click: () => {
        app.quit()
      },
    },
  ]

  return Menu.buildFromTemplate(template)
}

function updateTrayMenu(actions: TrayActions): Menu | null {
  if (!tray) return null
  const contextMenu = buildTrayMenu(actions)
  tray.setContextMenu(contextMenu)
  return contextMenu
}

/**
 * 创建系统托盘图标和菜单
 */
export function createTray(actionsInput?: Partial<TrayActions>): Tray | null {
  const iconPath = getTrayIconPath()
  const actions = { ...getDefaultTrayActions(), ...actionsInput }

  if (!existsSync(iconPath)) {
    console.warn('Tray icon not found at:', iconPath)
    return null
  }

  try {
    const image = nativeImage.createFromPath(iconPath)

    // macOS: 标记为 Template 图像
    // Template 图像必须是单色的，使用 alpha 通道定义形状
    // 系统会自动根据菜单栏主题填充颜色
    if (process.platform === 'darwin') {
      image.setTemplateImage(true)
    }

    tray = new Tray(image)

    // 设置 tooltip
    tray.setToolTip('MyYoda')

    updateTrayMenu(actions)

    // 点击行为：始终弹出菜单（与右键一致）
    tray.on('click', () => {
      const contextMenu = updateTrayMenu(actions)
      if (contextMenu) {
        tray?.popUpContextMenu(contextMenu)
      }
    })

    tray.on('right-click', () => {
      updateTrayMenu(actions)
    })

    console.log('System tray created')
    return tray
  } catch (error) {
    console.error('Failed to create system tray:', error)
    return null
  }
}

/**
 * 销毁系统托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * 获取当前托盘实例
 */
export function getTray(): Tray | null {
  return tray
}
