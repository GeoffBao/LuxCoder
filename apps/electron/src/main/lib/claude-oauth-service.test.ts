import { afterEach, describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill(): void {
    this.killed = true
  }
}

let fakeChild: FakeChildProcess
const spawnMock = mock(() => fakeChild)

mock.module('node:child_process', () => ({
  spawn: spawnMock,
}))

mock.module('electron', () => ({
  shell: {
    openExternal: mock(async () => undefined),
  },
}))

mock.module('./config-paths', () => ({
  resolveClaudeAgentBinaryPath: () => '/fake/path/to/claude',
}))

type ClaudeOAuthServiceModule = typeof import('./claude-oauth-service')
let service: ClaudeOAuthServiceModule

async function loadService(): Promise<ClaudeOAuthServiceModule> {
  service = await import('./claude-oauth-service')
  return service
}

afterEach(() => {
  spawnMock.mockClear()
})

describe('Claude 订阅 OAuth 登录服务', () => {
  test('Given stdout 打印出 token When 登录 Then resolve token 与时间戳', async () => {
    const { loginClaudeOAuth } = await loadService()
    fakeChild = new FakeChildProcess()

    const loginPromise = loginClaudeOAuth()
    fakeChild.stdout.emit('data', Buffer.from('Please visit https://claude.ai/oauth/authorize?code=true&client_id=x to continue\n'))
    fakeChild.stdout.emit('data', Buffer.from('Login successful. Your token: sk-ant-oat01-abcDEF123_-xyz\n'))

    const result = await loginPromise
    expect(result.token).toBe('sk-ant-oat01-abcDEF123_-xyz')
    expect(typeof result.obtainedAt).toBe('number')
  })

  test('Given 进程非零退出且无 token When 登录 Then reject 并带诊断信息', async () => {
    const { loginClaudeOAuth } = await loadService()
    fakeChild = new FakeChildProcess()

    const loginPromise = loginClaudeOAuth()
    fakeChild.stderr.emit('data', Buffer.from('Error: no active subscription found\n'))
    fakeChild.emit('close', 1)

    await expect(loginPromise).rejects.toThrow(/no active subscription found/)
  })

  test('Given 二进制路径解析失败 When 登录 Then reject 提示重装', async () => {
    mock.module('./config-paths', () => ({
      resolveClaudeAgentBinaryPath: () => '',
    }))
    const { loginClaudeOAuth } = await loadService()

    await expect(loginClaudeOAuth()).rejects.toThrow(/未找到 Claude 运行时/)
  })

  test('Given 取消登录 When cancelClaudeOAuthLogin Then 已 spawn 的子进程被 kill', async () => {
    mock.module('./config-paths', () => ({
      resolveClaudeAgentBinaryPath: () => '/fake/path/to/claude',
    }))
    const { loginClaudeOAuth, cancelClaudeOAuthLogin } = await loadService()
    fakeChild = new FakeChildProcess()

    const loginPromise = loginClaudeOAuth()
    cancelClaudeOAuthLogin()
    fakeChild.emit('close', null)

    await expect(loginPromise).rejects.toThrow()
    expect(fakeChild.killed).toBe(true)
  })
})
