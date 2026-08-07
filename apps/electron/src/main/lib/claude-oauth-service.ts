/**
 * Claude Pro/Max 订阅 OAuth 登录服务
 *
 * 不再 spawn 打包的 claude 二进制走 `setup-token` 子命令——已确认该子命令是纯交互式
 * TUI：非 TTY 环境下会尝试直接打开 /dev/tty 抢控制终端，正式打包后的 Electron 应用
 * 从 Dock/Finder 启动没有 controlling terminal，/dev/tty 打开必然失败，子进程会
 * 在完全静默中挂起（用 setsid 完整复现过：stdio 全部无输出，10+ 秒不退出）。就算
 * 拿到浏览器授权 URL，登录本身还要求用户把回调页显示的 code 手动粘贴回终端 stdin，
 * 而旧实现从未打通这个通道。开发模式下"能登录"只是因为主进程继承了开发终端的
 * controlling terminal，/dev/tty 兜底恰好能打开——这是巧合，不是设计。
 *
 * 现在改为原生实现 Authorization Code + PKCE 流程（参考 craft-agents-oss 的
 * packages/shared/src/auth/claude-oauth.ts）：
 * - CLIENT_ID 直接复用官方 claude 二进制自己在真实 setup-token 流程里使用的同一个
 *   public client id（从其生成的真实授权 URL 里实测抓到），不是冒用第三方身份。
 * - 浏览器授权完成后，Anthropic 的回调页会显示一段 code，用户手动复制粘贴回 App
 *   （Anthropic 的公开客户端目前不支持 localhost redirect_uri 自动回传，这一步
 *   无法省略，`setup-token` 本身也是同样的交互）。
 * - 用 code 换 token 时能拿到真正的 refreshToken + expiresAt，比旧的"约 1 年不可
 *   刷新长效 token"更规范；配套的刷新逻辑见 channel-manager.ts。
 */

import { randomBytes, createHash } from 'node:crypto'
import { shell } from 'electron'
import type { ClaudeOAuthCredentials } from '@myyoda/shared'
import { getAppUserAgent } from '@myyoda/core'
import pkg from '../../../package.json' with { type: 'json' }

/** 官方 claude 二进制自己使用的 public client id（实测从其 setup-token 生成的授权 URL 抓取）。 */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const AUTH_URL = 'https://claude.ai/oauth/authorize'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
/** 必须与官方二进制生成的授权 URL 完全一致，否则服务端会拒绝该 redirect_uri。 */
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback'
const SCOPES = 'org:create_api_key user:profile user:inference'
/** 授权码时效：留够用户"切到浏览器完成授权→切回来粘贴"的时间，同时避免陈旧 state 无限堆积。 */
const STATE_EXPIRY_MS = 10 * 60_000

interface PendingOAuthState {
  state: string
  codeVerifier: string
  expiresAt: number
}

/** 进行中的登录流程（同一时刻只允许一个）。 */
let pendingState: PendingOAuthState | undefined

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

interface TokenResponseBody {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  account?: { uuid?: string; email_address?: string; email?: string }
  organization?: { uuid?: string; name?: string }
}

async function parseTokenResponse(
  response: Response,
  action: string,
  fallbackRefreshToken?: string,
): Promise<ClaudeOAuthCredentials> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let detail = text
    try {
      const json = JSON.parse(text) as { error_description?: string; error?: string }
      detail = json.error_description || json.error || text
    } catch {
      // 非 JSON 错误响应体，原样透出即可
    }
    throw new Error(`Claude ${action}失败${detail ? `：${detail}` : `（HTTP ${response.status}）`}`)
  }

  const data = await response.json() as TokenResponseBody
  if (!data.access_token) {
    throw new Error(`Claude ${action}未返回有效 token`)
  }

  const identity: Partial<Pick<ClaudeOAuthCredentials, 'accountId' | 'emailAddress' | 'organizationName'>> = {}
  if (data.account) {
    identity.accountId = data.account.uuid
    identity.emailAddress = data.account.email_address ?? data.account.email
  }
  if (data.organization) {
    identity.organizationName = data.organization.name
  }

  return {
    token: data.access_token,
    obtainedAt: Date.now(),
    ...(data.refresh_token || fallbackRefreshToken
      ? { refreshToken: data.refresh_token ?? fallbackRefreshToken }
      : {}),
    ...(typeof data.expires_in === 'number' ? { expiresAt: Date.now() + data.expires_in * 1000 } : {}),
    ...identity,
  }
}

/**
 * 生成一次新的 Claude Pro/Max 授权 URL 并用系统浏览器打开。
 *
 * 返回的 URL 同时供 UI 兜底展示（例如浏览器未自动打开时手动点击）。
 */
export function prepareClaudeOAuthLogin(): string {
  const state = randomBytes(32).toString('hex')
  const { codeVerifier, codeChallenge } = generatePkce()
  pendingState = { state, codeVerifier, expiresAt: Date.now() + STATE_EXPIRY_MS }

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  const authUrl = `${AUTH_URL}?${params.toString()}`

  shell.openExternal(authUrl).catch((err) => console.error('[Claude OAuth] 打开浏览器失败:', err))

  return authUrl
}

/**
 * 用用户从浏览器回调页复制的授权码换取凭据。
 *
 * 授权码可能带上 `#`/`&` 之后的多余片段（例如页面展示时混入了 state），这里做
 * 一次保守清理；真正的合法性校验交给服务端。
 */
export async function exchangeClaudeOAuthCode(rawCode: string): Promise<ClaudeOAuthCredentials> {
  const current = pendingState
  if (!current) {
    throw new Error('登录会话已失效，请重新点击登录')
  }
  if (Date.now() > current.expiresAt) {
    pendingState = undefined
    throw new Error('授权码已过期（超过 10 分钟），请重新登录')
  }

  const code = rawCode.trim().split('#')[0]?.split('&')[0]?.trim() ?? ''
  if (!code) {
    throw new Error('请粘贴授权码')
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': getAppUserAgent(pkg.version),
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: current.codeVerifier,
      state: current.state,
    }),
  })

  const credentials = await parseTokenResponse(response, '登录')
  pendingState = undefined
  return credentials
}

/**
 * 用 refresh token 换取新的 access token（channel-manager 在快过期时调用）。
 * 服务端未轮换 refresh token 时（响应里没有 refresh_token）沿用旧值。
 */
export async function refreshClaudeOAuthToken(refreshToken: string): Promise<ClaudeOAuthCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': getAppUserAgent(pkg.version),
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })

  return parseTokenResponse(response, '刷新', refreshToken)
}

/** 取消进行中的登录流程（若有）：清掉待换取的 PKCE state。 */
export function cancelClaudeOAuthLogin(): void {
  pendingState = undefined
}
