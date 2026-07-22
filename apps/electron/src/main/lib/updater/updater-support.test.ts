/**
 * 自动更新能力探测单测
 */

import { describe, expect, test } from 'bun:test'
import type { execFileSync } from 'node:child_process'
import {
  formatUpdaterErrorMessage,
  isMacExecutableCodeSigned,
  resolveAutoUpdateSupport,
} from './updater-support'

describe('isMacExecutableCodeSigned', () => {
  test('codesign 成功时返回 true', () => {
    const execFile = (() => Buffer.from('')) as unknown as typeof execFileSync
    expect(isMacExecutableCodeSigned('/App.app/Contents/MacOS/App', execFile)).toBe(true)
  })

  test('codesign 失败时返回 false', () => {
    const execFile = (() => {
      throw new Error('code object is not signed at all')
    }) as unknown as typeof execFileSync
    expect(isMacExecutableCodeSigned('/App.app/Contents/MacOS/App', execFile)).toBe(false)
  })
})

describe('resolveAutoUpdateSupport', () => {
  test('非 darwin 始终支持应用内安装', () => {
    expect(
      resolveAutoUpdateSupport({
        platform: 'win32',
        exePath: 'C:\\\\LuxCoder\\\\LuxCoder.exe',
        execFile: (() => {
          throw new Error('should not run')
        }) as unknown as typeof execFileSync,
      }),
    ).toEqual({ installSupported: true })
  })

  test('darwin 未签名时禁用应用内安装', () => {
    const result = resolveAutoUpdateSupport({
      platform: 'darwin',
      exePath: '/Applications/LuxCoder.app/Contents/MacOS/LuxCoder',
      execFile: (() => {
        throw new Error('code object is not signed at all')
      }) as unknown as typeof execFileSync,
    })
    expect(result.installSupported).toBe(false)
    expect(result.reason).toContain('未签名')
  })

  test('darwin 已签名时支持应用内安装', () => {
    expect(
      resolveAutoUpdateSupport({
        platform: 'darwin',
        exePath: '/Applications/LuxCoder.app/Contents/MacOS/LuxCoder',
        execFile: (() => Buffer.from('')) as unknown as typeof execFileSync,
      }),
    ).toEqual({ installSupported: true })
  })
})

describe('formatUpdaterErrorMessage', () => {
  test('未签名构建返回固定引导文案', () => {
    expect(formatUpdaterErrorMessage('whatever', false)).toContain('未签名')
  })

  test('签名相关错误带前缀说明', () => {
    const msg = formatUpdaterErrorMessage('The code signature is invalid', true)
    expect(msg).toContain('代码签名')
    expect(msg).toContain('The code signature is invalid')
  })

  test('普通错误原样返回', () => {
    expect(formatUpdaterErrorMessage('net::ERR_FAILED', true)).toBe('net::ERR_FAILED')
  })
})
