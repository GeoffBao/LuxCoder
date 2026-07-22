/**
 * 自动更新核心模块
 *
 * 检测新版本 →（支持时）自动后台下载 → 用户从更新入口确认后重启安装。
 * 仅在打包后的生产环境中工作。
 *
 * macOS 注意：
 * - 应用内安装依赖 Squirrel.Mac，必须 Developer ID 签名
 * - 未签名构建只提示新版本，引导手动下载（避免「已就绪 → 立即重启 → 检查失败」死循环）
 * - 已签名时 autoInstallOnAppQuit=true，让 nativeUpdater 在 zip 下载后预取，quit 时安装
 */

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { setQuitting } from '../app-lifecycle'
import type { UpdateStatus } from './updater-types'
import { UPDATER_IPC_CHANNELS } from './updater-types'
import {
  formatUpdaterErrorMessage,
  resolveAutoUpdateSupport,
  type AutoUpdateSupport,
} from './updater-support'

/** 当前更新状态 */
let currentStatus: UpdateStatus = { status: 'idle' }

/** 主窗口引用 */
let win: BrowserWindow | null = null

/** 定时检查定时器 */
let checkInterval: ReturnType<typeof setInterval> | null = null

/** 应用内安装能力（init 时探测） */
let updateSupport: AutoUpdateSupport = { installSupported: true }

/** 更新状态并推送给渲染进程 */
function setStatus(status: UpdateStatus): void {
  currentStatus = withSupport(status)
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, currentStatus)
}

function withSupport(status: UpdateStatus): UpdateStatus {
  return {
    ...status,
    installSupported: updateSupport.installSupported,
  }
}

function currentVersion(): string | undefined {
  return 'version' in currentStatus ? currentStatus.version : undefined
}

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return withSupport(currentStatus)
}

/** 是否支持应用内自动安装 */
export function isAutoInstallSupported(): boolean {
  return updateSupport.installSupported
}

/** 手动触发检查更新 */
export async function checkForUpdates(): Promise<void> {
  // 已在下载中或已下载完成，不重复检查
  if (currentStatus.status === 'downloading' || currentStatus.status === 'downloaded') {
    console.log('[更新] 跳过检查：已在下载中或已下载完成')
    return
  }

  try {
    setStatus({ status: 'checking' })
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('[更新] 检查更新失败:', err)
    setStatus({
      status: 'error',
      error: formatUpdaterErrorMessage(
        err instanceof Error ? err.message : String(err),
        updateSupport.installSupported,
      ),
      version: currentVersion(),
    })
  }
}

/** 退出并安装已下载的更新 */
export function quitAndInstall(): void {
  if (!updateSupport.installSupported) {
    console.warn('[更新] 拒绝 quitAndInstall：当前构建不支持应用内安装')
    setStatus({
      status: 'error',
      error: updateSupport.reason ?? '当前构建不支持应用内自动安装，请手动下载',
      version: currentVersion(),
    })
    return
  }

  if (currentStatus.status !== 'downloaded') {
    console.warn('[更新] 拒绝 quitAndInstall：更新尚未下载完成', currentStatus.status)
    setStatus({
      status: 'error',
      error: '更新尚未下载完成，请先等待下载结束或重新检查更新',
      version: currentVersion(),
    })
    return
  }

  // 标记退出，避免 macOS/Windows 的 close → preventDefault 拦截
  setQuitting(true)
  app.removeAllListeners('window-all-closed')
  for (const w of BrowserWindow.getAllWindows()) {
    w.removeAllListeners('close')
  }

  // 延迟调用确保 IPC 响应已发送回渲染进程
  setImmediate(() => {
    // macOS + autoInstallOnAppQuit：Squirrel 已预取，走正常 quit 即可安装
    // （历史修复：quitAndInstall 在部分 macOS 路径上不会正确设置 isQuitting）
    if (process.platform === 'darwin' && autoUpdater.autoInstallOnAppQuit) {
      console.log('[更新] macOS 调用 app.quit() 触发安装')
      app.quit()
      return
    }

    console.log('[更新] 调用 quitAndInstall')
    autoUpdater.quitAndInstall(false, true)
  })
}

/** 清理更新器资源（定时器等） */
export function cleanupUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

/**
 * 初始化自动更新
 *
 * @param mainWindow - 主窗口实例，用于推送更新状态
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  updateSupport = resolveAutoUpdateSupport({
    platform: process.platform,
    exePath: app.getPath('exe'),
  })

  autoUpdater.logger = {
    info: (...args: unknown[]) => console.log('[更新-updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[更新-updater]', ...args),
    error: (...args: unknown[]) => console.error('[更新-updater]', ...args),
    debug: (...args: unknown[]) => console.log('[更新-updater:debug]', ...args),
  }

  if (updateSupport.installSupported) {
    // 自动下载；macOS 还需在 zip 落盘后喂给 Squirrel（autoInstallOnAppQuit）
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = process.platform === 'darwin'
  } else {
    // 未签名 macOS：只检查，不后台下载「假就绪」包，避免点重启必失败
    console.warn(`[更新] ${updateSupport.reason}`)
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
  }

  // 监听更新事件
  autoUpdater.on('checking-for-update', () => {
    console.log('[更新] 正在检查更新...')
    setStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[更新] 发现新版本:', info.version)
    setStatus({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : undefined,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      status: 'downloading',
      version: currentVersion() || '',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[更新] 下载完成:', info.version)
    setStatus({
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[更新] 已是最新版本')
    setStatus({ status: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    console.error('[更新] 更新出错:', err)
    setStatus({
      status: 'error',
      error: formatUpdaterErrorMessage(err.message, updateSupport.installSupported),
      version: currentVersion(),
    })
  })

  // 启动后延迟 10 秒首次检查
  setTimeout(() => {
    console.log('[更新] 首次自动检查更新')
    checkForUpdates()
  }, 10_000)

  // 每 4 小时自动检查一次
  checkInterval = setInterval(() => {
    console.log('[更新] 定时自动检查更新')
    checkForUpdates()
  }, 4 * 60 * 60 * 1000)

  // 窗口关闭时清理定时器
  mainWindow.on('closed', () => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
    win = null
  })

  console.log(
    `[更新] 自动更新模块已初始化（installSupported=${updateSupport.installSupported}, autoDownload=${autoUpdater.autoDownload}, autoInstallOnAppQuit=${autoUpdater.autoInstallOnAppQuit}）`,
  )
}
