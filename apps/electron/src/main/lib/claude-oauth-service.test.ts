import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { mockElectronModule } from './__tests__/electron-mock'

mockElectronModule({
  shell: {
    openExternal: mock(async () => undefined),
  },
})

type ClaudeOAuthServiceModule = typeof import('./claude-oauth-service')
let service: ClaudeOAuthServiceModule

const originalFetch = globalThis.fetch

function mockFetchOnce(response: { ok: boolean; status?: number; json?: unknown; text?: string }): void {
  globalThis.fetch = mock(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.json,
    text: async () => response.text ?? (response.json ? JSON.stringify(response.json) : ''),
  })) as unknown as typeof fetch
}

beforeEach(async () => {
  service = await import('./claude-oauth-service')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  service.cancelClaudeOAuthLogin()
})

describe('Claude 订阅 OAuth 登录服务', () => {
  test('Given 调用 prepare When 生成授权 URL Then 携带 PKCE 参数并打开浏览器', async () => {
    const { shell } = await import('electron') as unknown as { shell: { openExternal: ReturnType<typeof mock> } }

    const authUrl = service.prepareClaudeOAuthLogin()

    const url = new URL(authUrl)
    expect(url.origin + url.pathname).toBe('https://claude.ai/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('https://platform.claude.com/oauth/code/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(shell.openExternal).toHaveBeenCalledWith(authUrl)
  })

  test('Given prepare 未调用 When 直接换取授权码 Then reject 提示重新登录', async () => {
    await expect(service.exchangeClaudeOAuthCode('some-code')).rejects.toThrow(/重新点击登录/)
  })

  test('Given 已 prepare When 提交空授权码 Then reject 提示粘贴授权码', async () => {
    service.prepareClaudeOAuthLogin()
    await expect(service.exchangeClaudeOAuthCode('   ')).rejects.toThrow(/粘贴授权码/)
  })

  test('Given 已 prepare 且 token 端点返回凭据 When 提交授权码 Then resolve token/refreshToken/expiresAt', async () => {
    service.prepareClaudeOAuthLogin()
    mockFetchOnce({
      ok: true,
      json: { access_token: 'sk-ant-access-1', refresh_token: 'sk-ant-refresh-1', expires_in: 3600 },
    })

    const before = Date.now()
    const credentials = await service.exchangeClaudeOAuthCode('auth-code-123')

    expect(credentials.token).toBe('sk-ant-access-1')
    expect(credentials.refreshToken).toBe('sk-ant-refresh-1')
    expect(credentials.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(typeof credentials.obtainedAt).toBe('number')
  })

  test('Given 授权码带多余片段 When 提交授权码 Then 清理后再换取', async () => {
    service.prepareClaudeOAuthLogin()
    mockFetchOnce({ ok: true, json: { access_token: 'sk-ant-access-2' } })

    const credentials = await service.exchangeClaudeOAuthCode('auth-code-456#state=xyz')

    expect(credentials.token).toBe('sk-ant-access-2')
  })

  test('Given 已 prepare 但已过期 When 提交授权码 Then reject 提示重新登录', async () => {
    service.prepareClaudeOAuthLogin()
    const originalNow = Date.now
    Date.now = () => originalNow() + 11 * 60_000
    try {
      await expect(service.exchangeClaudeOAuthCode('auth-code')).rejects.toThrow(/已过期/)
    } finally {
      Date.now = originalNow
    }
  })

  test('Given token 端点返回非 2xx When 提交授权码 Then reject 并带诊断信息', async () => {
    service.prepareClaudeOAuthLogin()
    mockFetchOnce({ ok: false, status: 400, json: { error: 'invalid_grant', error_description: 'code expired' } })

    await expect(service.exchangeClaudeOAuthCode('auth-code')).rejects.toThrow(/code expired/)
  })

  test('Given token 端点返回 2xx 但没有 access_token When 提交授权码 Then reject 提示未返回有效 token', async () => {
    service.prepareClaudeOAuthLogin()
    mockFetchOnce({ ok: true, json: {} })

    await expect(service.exchangeClaudeOAuthCode('auth-code')).rejects.toThrow(/未返回有效 token/)
  })

  test('Given 换取成功 When 再次换取（未重新 prepare） Then reject 提示重新登录（state 已消费）', async () => {
    service.prepareClaudeOAuthLogin()
    mockFetchOnce({ ok: true, json: { access_token: 'sk-ant-access-3' } })
    await service.exchangeClaudeOAuthCode('auth-code')

    await expect(service.exchangeClaudeOAuthCode('auth-code-again')).rejects.toThrow(/重新点击登录/)
  })

  test('Given 取消登录 When 提交授权码 Then reject 提示重新登录', async () => {
    service.prepareClaudeOAuthLogin()
    service.cancelClaudeOAuthLogin()

    await expect(service.exchangeClaudeOAuthCode('auth-code')).rejects.toThrow(/重新点击登录/)
  })

  test('Given refresh token When 刷新成功且未轮换 refresh token Then 沿用旧 refresh token', async () => {
    mockFetchOnce({ ok: true, json: { access_token: 'sk-ant-access-refreshed', expires_in: 7200 } })

    const credentials = await service.refreshClaudeOAuthToken('old-refresh-token')

    expect(credentials.token).toBe('sk-ant-access-refreshed')
    expect(credentials.refreshToken).toBe('old-refresh-token')
  })

  test('Given refresh token When 刷新且服务端轮换了新 refresh token Then 使用新 refresh token', async () => {
    mockFetchOnce({ ok: true, json: { access_token: 'sk-ant-access-4', refresh_token: 'new-refresh-token' } })

    const credentials = await service.refreshClaudeOAuthToken('old-refresh-token')

    expect(credentials.refreshToken).toBe('new-refresh-token')
  })

  test('Given refresh token When 刷新失败 Then reject 并带诊断信息', async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: 'invalid_grant' } })

    await expect(service.refreshClaudeOAuthToken('expired-refresh-token')).rejects.toThrow(/invalid_grant/)
  })
})
