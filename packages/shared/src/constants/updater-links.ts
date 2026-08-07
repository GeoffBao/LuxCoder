/**
 * 更新 / 发布相关外链 — 唯一权威入口
 *
 * 应用内所有「查看更新 / 前往下载 / 下载最新安装包」相关的外链统一从这里取，
 * 禁止在组件或服务中散落硬编码 URL（避免 fork 残留域名、仿冒钓鱼风险）。
 *
 * 唯一发布渠道：GitHub Releases。自动更新正常时应用内完成下载与安装；
 * 只有自动下载失败或安装包缺失等场景，才引导用户前往 Releases 手动下载。
 */
export const UPDATER_LINKS = {
  /** GitHub Releases 发布页（手动下载入口） */
  releases: 'https://github.com/GeoffBao/MyYoda/releases',
} as const
