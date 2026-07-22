/**
 * 自动更新核心模块
 *
 * 检测新版本 →（支持时）自动后台下载 → 用户确认后重启安装。
 * 未签名 macOS：静默下载 DMG 到本地，用户点「打开安装包」挂载，不暴露 GitHub URL。
 */

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { setQuitting } from '../app-lifecycle'
import { getReleaseByTag } from '../github-release-service'
import type { UpdateStatus } from './updater-types'
import { UPDATER_IPC_CHANNELS } from './updater-types'
import {
  formatUpdaterErrorMessage,
  resolveAutoUpdateSupport,
  type AutoUpdateSupport,
} from './updater-support'
import {
  downloadManualPackage,
  openManualPackage,
  pickManualInstallerAsset,
} from './updater-manual-package'

/** 当前更新状态 */
let currentStatus: UpdateStatus = { status: 'idle' }

/** 主窗口引用 */
let win: BrowserWindow | null = null

/** 定时检查定时器 */
let checkInterval: ReturnType<typeof setInterval> | null = null

/** 应用内安装能力（init 时探测） */
let updateSupport: AutoUpdateSupport = { installSupported: true }

/** 手动安装包下载取消 */
let manualDownloadAbort: AbortController | null = null

/** 本地已下载安装包路径 */
let downloadedPackagePath: string | undefined

/** 更新状态并推送给渲染进程 */
function setStatus(status: UpdateStatus): void {
  currentStatus = withSupport(status)
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, currentStatus)
}

function withSupport(status: UpdateStatus): UpdateStatus {
  return {
    ...status,
    installSupported: updateSupport.installSupported,
    packagePath: downloadedPackagePath ?? status.packagePath,
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

/**
 * 未签名构建：按版本静默拉取 DMG/EXE 到本地缓存。
 * URL 只在主进程使用，不推给渲染层。
 */
async function startManualPackageDownload(version: string, _releaseNotes?: string): Promise<void> {
  if (manualDownloadAbort) {
    manualDownloadAbort.abort()
  }
  const abort = new AbortController()
  manualDownloadAbort = abort
  downloadedPackagePath = undefined

  try {
    setStatus({
      status: 'downloading',
      version,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    })

    const release = await getReleaseByTag(`v${version}`)
    const assets = release?.assets ?? []
    const asset = pickManualInstallerAsset(assets, process.platform, process.arch)
    if (!asset) {
      throw new Error('未找到对应平台的安装包')
    }

    console.log(`[更新] 静默下载安装包: ${asset.name}`)
    const filePath = await downloadManualPackage({
      url: asset.browser_download_url,
      filename: asset.name,
      expectedSize: asset.size,
      signal: abort.signal,
      onProgress: (progress) => {
        if (abort.signal.aborted) return
        setStatus({
          status: 'downloading',
          version,
          progress: {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
          },
        })
      },
    })

    if (abort.signal.aborted) return

    downloadedPackagePath = filePath
    setStatus({
      status: 'downloaded',
      version,
      packagePath: filePath,
    })
    console.log(`[更新] 安装包已就绪: ${filePath}`)
  } catch (err) {
    if (abort.signal.aborted) return
    console.error('[更新] 静默下载安装包失败:', err)
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      version,
    })
  } finally {
    if (manualDownloadAbort === abort) {
      manualDownloadAbort = null
    }
  }
}

/** 打开已下载的本地安装包（DMG/EXE），不打开浏览器 */
export async function openDownloadedPackage(): Promise<void> {
  const filePath = downloadedPackagePath
    ?? ('packagePath' in currentStatus ? currentStatus.packagePath : undefined)

  if (!filePath) {
    throw new Error('安装包尚未下载完成')
  }

  await openManualPackage(filePath)
}

/** 退出并安装已下载的更新 */
export function quitAndInstall(): void {
  if (!updateSupport.installSupported) {
    // 未签名：改为打开本地安装包，避免假「检查失败」
    void openDownloadedPackage().catch((err) => {
      console.error('[更新] 打开安装包失败:', err)
      setStatus({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        version: currentVersion(),
      })
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
  manualDownloadAbort?.abort()
  manualDownloadAbort = null
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
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = process.platform === 'darwin'
  } else {
    // 未签名：不用 electron-updater 下 zip（Squirrel 装不上），改走静默 DMG
    console.warn(`[更新] ${updateSupport.reason}`)
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[更新] 正在检查更新...')
    setStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[更新] 发现新版本:', info.version)
    const releaseNotes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined

    if (!updateSupport.installSupported) {
      setStatus({
        status: 'available',
        version: info.version,
        releaseNotes,
      })
      void startManualPackageDownload(info.version, releaseNotes)
      return
    }

    setStatus({
      status: 'available',
      version: info.version,
      releaseNotes,
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
    // 手动包下载进行中时，忽略 electron-updater 的连带 error，避免冲掉进度
    if (!updateSupport.installSupported && currentStatus.status === 'downloading') {
      console.warn('[更新] 忽略 updater error（手动包下载中）:', err.message)
      return
    }
    setStatus({
      status: 'error',
      error: formatUpdaterErrorMessage(err.message, updateSupport.installSupported),
      version: currentVersion(),
    })
  })

  setTimeout(() => {
    console.log('[更新] 首次自动检查更新')
    checkForUpdates()
  }, 10_000)

  checkInterval = setInterval(() => {
    console.log('[更新] 定时自动检查更新')
    checkForUpdates()
  }, 4 * 60 * 60 * 1000)

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
