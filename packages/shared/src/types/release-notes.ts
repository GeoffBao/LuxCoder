/**
 * 本地化版本历史（Release Notes）相关类型定义
 *
 * 版本历史改为本地 markdown 资源（resources/release-notes/*.md），
 * 完全离线可用，不再依赖 GitHub 网络。GitHub 仅保留「检查更新」入口。
 */

/** 单条版本记录 */
export interface ReleaseNote {
  /** 版本号（由文件名解析，如 "0.1.94"） */
  version: string
  /** Markdown 发布说明正文 */
  content: string
}

/** Release Notes IPC 通道常量 */
export const RELEASE_NOTES_IPC_CHANNELS = {
  /** 获取版本历史列表（semver 降序，最近 N 条） */
  LIST: 'release-notes:list',
  /** 获取最新版本号 */
  LATEST: 'release-notes:latest',
  /** 获取合并后的完整版本历史 Markdown */
  COMBINED: 'release-notes:combined',
} as const
