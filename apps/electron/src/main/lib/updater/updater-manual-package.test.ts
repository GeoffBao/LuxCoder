/**
 * 手动安装包挑选单测
 */

import { describe, expect, test } from 'bun:test'
import type { GitHubReleaseAsset } from '@luxcoder/shared'
import { pickManualInstallerAsset } from './updater-manual-package-select'

function asset(name: string): GitHubReleaseAsset {
  return {
    id: 1,
    name,
    size: 100,
    browser_download_url: `https://example.invalid/${name}`,
  }
}

describe('pickManualInstallerAsset', () => {
  test('darwin arm64 优先同架构 dmg', () => {
    const picked = pickManualInstallerAsset(
      [
        asset('LuxCoder-0.1.96-x64.dmg'),
        asset('LuxCoder-0.1.96-arm64.dmg'),
        asset('LuxCoder-0.1.96-arm64-mac.zip'),
      ],
      'darwin',
      'arm64',
    )
    expect(picked?.name).toBe('LuxCoder-0.1.96-arm64.dmg')
  })

  test('darwin 无精确架构时回退任意 dmg', () => {
    const picked = pickManualInstallerAsset(
      [asset('LuxCoder-0.1.96.dmg'), asset('notes.txt')],
      'darwin',
      'arm64',
    )
    expect(picked?.name).toBe('LuxCoder-0.1.96.dmg')
  })

  test('win32 优先 Setup.exe', () => {
    const picked = pickManualInstallerAsset(
      [asset('notes.txt'), asset('LuxCoder-Setup-0.1.96.exe')],
      'win32',
      'x64',
    )
    expect(picked?.name).toBe('LuxCoder-Setup-0.1.96.exe')
  })

  test('无匹配返回 null', () => {
    expect(pickManualInstallerAsset([asset('README.md')], 'darwin', 'arm64')).toBeNull()
  })
})
