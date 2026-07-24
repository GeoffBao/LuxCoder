import { describe, expect, test } from 'bun:test'
import {
  serializeClaudeOAuthCredentials,
  parseClaudeOAuthCredentials,
  isClaudeOAuthCredentialStale,
  type ClaudeOAuthCredentials,
} from './channel'

const sample: ClaudeOAuthCredentials = {
  token: 'sk-ant-oat01-sample-token',
  obtainedAt: 1_800_000_000_000,
  accountId: 'acct_abc',
}

describe('Claude 订阅 OAuth 凭据序列化', () => {
  test('Given 凭据 When 序列化再解析 Then 往返一致', () => {
    const round = parseClaudeOAuthCredentials(serializeClaudeOAuthCredentials(sample))
    expect(round).toEqual(sample)
  })

  test('Given 无 accountId 的凭据 When 往返 Then 省略可选字段', () => {
    const minimal: ClaudeOAuthCredentials = { token: 't', obtainedAt: 123 }
    expect(parseClaudeOAuthCredentials(serializeClaudeOAuthCredentials(minimal))).toEqual(minimal)
  })
})

describe('Claude 订阅 OAuth 凭据解析', () => {
  test('Given 空字符串 When 解析 Then null', () => {
    expect(parseClaudeOAuthCredentials('')).toBeNull()
    expect(parseClaudeOAuthCredentials('   ')).toBeNull()
  })

  test('Given 非 JSON When 解析 Then null（不抛错）', () => {
    expect(parseClaudeOAuthCredentials('sk-ant-oat-plain-string')).toBeNull()
  })

  test('Given 缺少必需字段 When 解析 Then null', () => {
    expect(parseClaudeOAuthCredentials('{"token":"t"}')).toBeNull()
    expect(parseClaudeOAuthCredentials('{"obtainedAt":1}')).toBeNull()
  })

  test('Given obtainedAt 非数字 When 解析 Then null', () => {
    expect(parseClaudeOAuthCredentials('{"token":"t","obtainedAt":"soon"}')).toBeNull()
  })
})

describe('Claude 订阅 OAuth 凭据过期提醒判定', () => {
  test('Given 刚登录 When 判定 Then 不需要提醒', () => {
    expect(isClaudeOAuthCredentialStale({ ...sample, obtainedAt: Date.now() })).toBe(false)
  })

  test('Given 距今 334 天 When 判定 Then 不需要提醒', () => {
    expect(isClaudeOAuthCredentialStale({ ...sample, obtainedAt: Date.now() - 334 * 86_400_000 })).toBe(false)
  })

  test('Given 距今 335 天 When 判定 Then 需要提醒', () => {
    expect(isClaudeOAuthCredentialStale({ ...sample, obtainedAt: Date.now() - 335 * 86_400_000 })).toBe(true)
  })

  test('Given 距今 400 天 When 判定 Then 需要提醒', () => {
    expect(isClaudeOAuthCredentialStale({ ...sample, obtainedAt: Date.now() - 400 * 86_400_000 })).toBe(true)
  })
})
