/**
 * 自动更新能力探测
 *
 * macOS 应用内安装依赖 Squirrel.Mac，要求 Developer ID 签名。
 * 未签名构建仍可检查/提示新版本，但必须引导用户手动下载安装包。
 */

import { execFileSync } from 'node:child_process'

export interface AutoUpdateSupport {
  /** 是否支持下载后应用内 quitAndInstall */
  installSupported: boolean
  /** 不支持时的可读原因（中文） */
  reason?: string
}

/**
 * 判断当前 macOS 可执行文件是否通过 codesign 校验。
 * 非 darwin 平台直接视为 true（由调用方决定是否使用）。
 */
export function isMacExecutableCodeSigned(
  exePath: string,
  execFile: typeof execFileSync = execFileSync,
): boolean {
  try {
    execFile('codesign', ['--verify', '--verbose=0', exePath], {
      stdio: 'pipe',
      timeout: 5_000,
    })
    return true
  } catch {
    return false
  }
}

/** 根据平台与签名状态计算自动更新安装能力 */
export function resolveAutoUpdateSupport(input: {
  platform: NodeJS.Platform
  exePath: string
  execFile?: typeof execFileSync
}): AutoUpdateSupport {
  if (input.platform !== 'darwin') {
    return { installSupported: true }
  }

  const signed = isMacExecutableCodeSigned(input.exePath, input.execFile)
  if (signed) {
    return { installSupported: true }
  }

  return {
    installSupported: false,
    reason: '当前 macOS 构建未签名，Squirrel.Mac 无法应用内安装，请从 GitHub Releases 手动下载',
  }
}

/** 将 updater 错误整理为面向用户的中文说明 */
export function formatUpdaterErrorMessage(raw: string, installSupported: boolean): string {
  const text = raw.trim() || '未知错误'

  if (!installSupported) {
    return '当前 macOS 构建未签名，无法应用内自动安装，请手动下载新版本'
  }

  const lower = text.toLowerCase()
  if (
    lower.includes('code signature') ||
    lower.includes('codesign') ||
    lower.includes('not signed') ||
    lower.includes('signature') ||
    text.includes('签名')
  ) {
    return `更新安装失败（代码签名校验未通过）：${text}`
  }

  return text
}
