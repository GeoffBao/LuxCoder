/**
 * GitHub Release 相关类型定义
 */

/** Release 附件（安装包等） */
export interface GitHubReleaseAsset {
  /** 附件 ID */
  id: number
  /** 文件名 */
  name: string
  /** 字节大小 */
  size: number
  /** 浏览器可下载 URL（主进程静默下载用，勿直接暴露给用户 UI） */
  browser_download_url: string
  /** MIME */
  content_type?: string
}

/** GitHub Release 资源（简化版） */
export interface GitHubRelease {
  /** Release ID */
  id: number
  /** 标签名（版本号） */
  tag_name: string
  /** Release 名称 */
  name: string
  /** 发布说明（Markdown 格式） */
  body: string
  /** 是否为草稿 */
  draft: boolean
  /** 是否为预发布版本 */
  prerelease: boolean
  /** 创建时间 */
  created_at: string
  /** 发布时间 */
  published_at: string
  /** Release HTML URL */
  html_url: string
  /** 附件列表（API 返回；类型可选以兼容旧缓存） */
  assets?: GitHubReleaseAsset[]
}

/** GitHub Release 列表查询选项 */
export interface GitHubReleaseListOptions {
  /** 每页数量（默认 10） */
  perPage?: number
  /** 页码（默认 1） */
  page?: number
  /** 是否包含草稿和预发布版本（默认 false） */
  includePrerelease?: boolean
}

/** GitHub Release IPC 通道常量 */
export const GITHUB_RELEASE_IPC_CHANNELS = {
  /** 获取最新 Release */
  GET_LATEST_RELEASE: 'github-release:get-latest',
  /** 获取 Release 列表 */
  LIST_RELEASES: 'github-release:list',
  /** 获取指定版本的 Release */
  GET_RELEASE_BY_TAG: 'github-release:get-by-tag',
} as const
