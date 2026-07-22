/**
 * 自动更新相关类型定义
 *
 * 检测新版本 → 自动下载 → 用户从更新入口确认后重启安装 / 打开安装包
 */

/** 各状态可选携带的安装能力标记 */
interface UpdateStatusMeta {
  /**
   * 是否仍走应用内 quitAndInstall。
   * 主路径为 true；安装失败并转入 DMG 兜底后为 false。
   */
  installSupported?: boolean
  /** 静默下载的本地安装包路径（仅兜底路径） */
  packagePath?: string
  /** 已转入安装包兜底（应用内安装失败后） */
  fallbackToPackage?: boolean
}

/** 更新状态 */
export type UpdateStatus =
  | ({ status: 'idle' } & UpdateStatusMeta)
  | ({ status: 'checking' } & UpdateStatusMeta)
  | ({ status: 'available'; version: string; releaseNotes?: string } & UpdateStatusMeta)
  | ({ status: 'downloading'; version: string; progress: DownloadProgress } & UpdateStatusMeta)
  | ({ status: 'downloaded'; version: string } & UpdateStatusMeta)
  | ({ status: 'not-available' } & UpdateStatusMeta)
  | ({ status: 'error'; error: string; version?: string } & UpdateStatusMeta)

/** 下载进度 */
export interface DownloadProgress {
  /** 已下载百分比 0-100 */
  percent: number
  /** 已下载字节数 */
  transferred: number
  /** 总字节数 */
  total: number
  /** 下载速度（字节/秒） */
  bytesPerSecond: number
}

/** 更新 IPC 通道常量 */
export const UPDATER_IPC_CHANNELS = {
  CHECK_FOR_UPDATES: 'updater:check',
  GET_STATUS: 'updater:get-status',
  ON_STATUS_CHANGED: 'updater:status-changed',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
  OPEN_DOWNLOADED_PACKAGE: 'updater:open-downloaded-package',
} as const
