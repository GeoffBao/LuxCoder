import { describe, test, expect } from 'bun:test'
import {
  BASH_DEFAULT_TIMEOUT_MS,
  BASH_DEFAULT_TIMEOUT_MS_PI,
  hasExplicitBashTimeout,
  resolveBashDefaultTimeout,
  injectBashDefaultTimeout,
} from './agent-bash-timeout'

describe('agent-bash-timeout', () => {
  test('Pi runtime 注入的 timeout 单位是秒，默认值比 Claude 更宽松（避免误杀长编译）', () => {
    const input = injectBashDefaultTimeout({ command: 'awk ...' }, 'pi')
    // Pi 的 bash 工具 resolveTimeoutMs 按 秒×1000，故注入秒值
    expect(input.timeout).toBe(600)
    // 换算回毫秒应等于 Pi 专属默认值（600s），而非 Claude 的 120s
    expect((input.timeout as number) * 1000).toBe(BASH_DEFAULT_TIMEOUT_MS_PI)
    // 保留原 command
    expect(input.command).toBe('awk ...')
  })

  test('Claude runtime 注入的 timeout 单位是毫秒', () => {
    const input = injectBashDefaultTimeout({ command: 'git status' }, 'claude')
    expect(input.timeout).toBe(BASH_DEFAULT_TIMEOUT_MS)
    expect(input.command).toBe('git status')
  })

  test('模型已显式指定 timeout 时尊重原值，不覆盖', () => {
    // Claude：已给 5000ms
    const claude = injectBashDefaultTimeout({ command: 'sleep 3', timeout: 5000 }, 'claude')
    expect(claude.timeout).toBe(5000)
    // Pi：已给 60 秒（应保留，即使小于 Pi 的 600s 默认值也不覆盖）
    const pi = injectBashDefaultTimeout({ command: 'sleep 3', timeout: 60 }, 'pi')
    expect(pi.timeout).toBe(60)
  })

  test('timeout 为 0 / 非有限数 / 非数字时视为未显式指定', () => {
    expect(injectBashDefaultTimeout({ command: 'x', timeout: 0 }, 'claude').timeout).toBe(BASH_DEFAULT_TIMEOUT_MS)
    expect(injectBashDefaultTimeout({ command: 'x', timeout: NaN }, 'claude').timeout).toBe(BASH_DEFAULT_TIMEOUT_MS)
    expect(injectBashDefaultTimeout({ command: 'x', timeout: 'abc' }, 'claude').timeout).toBe(BASH_DEFAULT_TIMEOUT_MS)
    expect(injectBashDefaultTimeout({ command: 'x' }, 'claude').timeout).toBe(BASH_DEFAULT_TIMEOUT_MS)
  })

  test('hasExplicitBashTimeout 判定', () => {
    expect(hasExplicitBashTimeout({ timeout: 100 })).toBe(true)
    expect(hasExplicitBashTimeout({ timeout: 0 })).toBe(false)
    expect(hasExplicitBashTimeout({})).toBe(false)
    expect(hasExplicitBashTimeout({ timeout: undefined })).toBe(false)
  })

  test('resolveBashDefaultTimeout 单位换算，两个 runtime 使用各自默认值', () => {
    expect(resolveBashDefaultTimeout('pi')).toBe(600)
    expect(resolveBashDefaultTimeout('claude')).toBe(BASH_DEFAULT_TIMEOUT_MS)
  })

  test('已显式指定时返回原对象引用（不产生新对象）', () => {
    const input = { command: 'x', timeout: 5000 }
    const result = injectBashDefaultTimeout(input, 'claude')
    expect(result).toBe(input)
  })
})
