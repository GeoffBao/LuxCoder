import { describe, expect, test } from 'bun:test'
import {
  serializeClaudeOAuthCredentials,
  parseClaudeOAuthCredentials,
  isClaudeOAuthCredentialStale,
  isClaudeOAuthCredentialExpired,
  type ClaudeOAuthCredentials,
} from './channel'

const sample: ClaudeOAuthCredentials = {
  token: 'sk-ant-oat01-sample-token',
  obtainedAt: 1_800_000_000_000,
  accountId: 'acct_abc',
}

const samplePkce: ClaudeOAuthCredentials = {
  token: 'sk-ant-access-sample',
  obtainedAt: 1_800_000_000_000,
  refreshToken: 'sk-ant-refresh-sample',
  expiresAt: 1_800_003_600_000,
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

  test('Given 含 refreshToken/expiresAt 的 PKCE 凭据 When 序列化再解析 Then 往返一致', () => {
    const round = parseClaudeOAuthCredentials(serializeClaudeOAuthCredentials(samplePkce))
    expect(round).toEqual(samplePkce)
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

  test('Given 凭据带 refreshToken（即便 obtainedAt 很旧） When 判定 Then 不需要提醒（会自动刷新）', () => {
    expect(isClaudeOAuthCredentialStale({ ...samplePkce, obtainedAt: Date.now() - 400 * 86_400_000 })).toBe(false)
  })
})

describe('Claude 订阅 OAuth access token 过期判定', () => {
  test('Given 没有 expiresAt 的旧版长效凭据 When 判定 Then 不视为过期', () => {
    expect(isClaudeOAuthCredentialExpired(sample)).toBe(false)
  })

  test('Given expiresAt 在 5 分钟缓冲之外 When 判定 Then 未过期', () => {
    expect(isClaudeOAuthCredentialExpired({ ...samplePkce, expiresAt: Date.now() + 10 * 60_000 })).toBe(false)
  })

  test('Given expiresAt 已在 5 分钟缓冲内 When 判定 Then 视为过期', () => {
    expect(isClaudeOAuthCredentialExpired({ ...samplePkce, expiresAt: Date.now() + 30_000 })).toBe(true)
  })

  test('Given expiresAt 已过去 When 判定 Then 视为过期', () => {
    expect(isClaudeOAuthCredentialExpired({ ...samplePkce, expiresAt: Date.now() - 1000 })).toBe(true)
  })
})
