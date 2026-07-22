/**
 * 手动安装包资产挑选（纯函数，无 Electron 依赖）
 */

import type { GitHubReleaseAsset } from '@luxcoder/shared'

/** 按平台/架构挑选用户可直接打开的安装包（优先 DMG / Setup.exe） */
export function pickManualInstallerAsset(
  assets: GitHubReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string,
): GitHubReleaseAsset | null {
  if (!assets.length) return null

  if (platform === 'darwin') {
    const archToken = arch === 'arm64' ? 'arm64' : 'x64'
    const dmgExact = assets.find(
      (a) => /\.dmg$/i.test(a.name) && a.name.toLowerCase().includes(archToken),
    )
    if (dmgExact) return dmgExact
    return assets.find((a) => /\.dmg$/i.test(a.name)) ?? null
  }

  if (platform === 'win32') {
    const setup = assets.find(
      (a) => /setup.*\.exe$/i.test(a.name) || /LuxCoder-Setup/i.test(a.name),
    )
    if (setup) return setup
    return assets.find((a) => /\.exe$/i.test(a.name)) ?? null
  }

  return null
}
