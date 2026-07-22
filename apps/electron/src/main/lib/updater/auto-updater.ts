/**
 * 自动更新核心模块
 *
 * 主路径（不变）：检查 → 自动下载 →「立即重启」quitAndInstall。
 * 兜底：应用内安装失败（如未签名 macOS）后再静默下载 DMG/EXE，
 * 供用户「打开安装包」，不弹浏览器、不展示 GitHub URL。
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

/** 签名探测结果（仅用于日志 / 错误文案，不拦截主路径） */
let updateSupport: AutoUpdateSupport = { installSupported: true }

/** 手动安装包下载取消 */
let manualDownloadAbort: AbortController | null = null

/** 本地兜底安装包路径 */
let downloadedPackagePath: string | undefined

/** electron-updater 已下完可安装包（主路径就绪） */
let nativeUpdateReady = false

/** 正在走 DMG 兜底下载，忽略 updater 连带 error */
let fallbackDownloadInProgress = false

/** 本版本是否已启动过兜底（防死循环） */
let fallbackStartedForVersion: string | undefined

/** 更新状态并推送给渲染进程 */
function setStatus(status: UpdateStatus): void {
  currentStatus = withMeta(status)
  win?.webContents?.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, currentStatus)
}

function withMeta(status: UpdateStatus): UpdateStatus {
  const fallbackToPackage = fallbackDownloadInProgress || !!downloadedPackagePath
  return {
    ...status,
    installSupported: !fallbackToPackage,
    packagePath: downloadedPackagePath ?? status.packagePath,
    fallbackToPackage,
  }
}

function currentVersion(): string | undefined {
  return 'version' in currentStatus ? currentStatus.version : undefined
}

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return withMeta(currentStatus)
}

/** 是否仍以应用内安装为主（无兜底包） */
export function isAutoInstallSupported(): boolean {
  return !downloadedPackagePath
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
 * 应用内安装失败后的兜底：静默下载对应版本 DMG/EXE。
 * URL 只在主进程使用，不推给渲染层。
 */
async function startManualPackageDownload(version: string): Promise<void> {
  if (fallbackStartedForVersion === version && (fallbackDownloadInProgress || downloadedPackagePath)) {
    console.log('[更新] 跳过兜底下载：本版本已处理', version)
    return
  }

  if (manualDownloadAbort) {
    manualDownloadAbort.abort()
  }
  const abort = new AbortController()
  manualDownloadAbort = abort
  fallbackStartedForVersion = version
  fallbackDownloadInProgress = true
  downloadedPackagePath = undefined
  // 主路径已失败，不再拦截检查跳过逻辑里的 downloaded
  nativeUpdateReady = false

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

    console.log(`[更新] 应用内安装失败，改下安装包: ${asset.name}`)
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
    console.log(`[更新] 兜底安装包已就绪: ${filePath}`)
  } catch (err) {
    if (abort.signal.aborted) return
    console.error('[更新] 兜底下载安装包失败:', err)
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      version,
    })
  } finally {
    fallbackDownloadInProgress = false
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

/**
 * 应用内安装失败 → 触发 DMG 兜底（若有版本号）
 * @returns 是否已转入兜底
 */
function tryFallbackAfterInstallFailure(reason: string): boolean {
  const version = currentVersion()
  if (!version) return false
  if (fallbackDownloadInProgress) return true
  if (downloadedPackagePath) return true

  // 重启安装失败后应用仍存活：取消 quitting，避免窗口被当成退出
  setQuitting(false)

  console.warn(`[更新] 应用内安装失败，转入安装包兜底: ${reason}`)
  void startManualPackageDownload(version)
  return true
}

/** 退出并安装已下载的更新（主路径） */
export function quitAndInstall(): void {
  // 已有兜底包：打开本地安装包
  if (downloadedPackagePath) {
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
    try {
      console.log('[更新] 调用 quitAndInstall')
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      console.error('[更新] quitAndInstall 抛错:', err)
      // 同步失败时回滚 quitting，并走兜底
      setQuitting(false)
      if (!tryFallbackAfterInstallFailure(err instanceof Error ? err.message : String(err))) {
        setStatus({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          version: currentVersion(),
        })
      }
    }
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
  if (!updateSupport.installSupported) {
    console.warn(`[更新] ${updateSupport.reason}；仍走原自动更新，「立即重启」失败后再下 DMG`)
  }

  autoUpdater.logger = {
    info: (...args: unknown[]) => console.log('[更新-updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[更新-updater]', ...args),
    error: (...args: unknown[]) => console.error('[更新-updater]', ...args),
    debug: (...args: unknown[]) => console.log('[更新-updater:debug]', ...args),
  }

  // 主路径保持原行为：自动下载，仅用户确认后安装
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    console.log('[更新] 正在检查更新...')
    setStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[更新] 发现新版本:', info.version)
    downloadedPackagePath = undefined
    fallbackStartedForVersion = undefined
    nativeUpdateReady = false
    setStatus({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    // 兜底下载用自己的进度，忽略 updater 进度以免乱跳
    if (fallbackDownloadInProgress) return
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
    nativeUpdateReady = true
    downloadedPackagePath = undefined
    setStatus({
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[更新] 已是最新版本')
    nativeUpdateReady = false
    setStatus({ status: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    console.error('[更新] 更新出错:', err)

    if (fallbackDownloadInProgress) {
      console.warn('[更新] 忽略 updater error（兜底包下载中）:', err.message)
      return
    }

    // 主路径已就绪或用户点了重启后失败 → 转 DMG 兜底，而不是停在「检查失败」
    if (nativeUpdateReady || currentStatus.status === 'downloaded') {
      if (tryFallbackAfterInstallFailure(err.message)) return
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
    `[更新] 自动更新模块已初始化（主路径=quitAndInstall，失败兜底=静默 DMG；signed=${updateSupport.installSupported}）`,
  )
}
