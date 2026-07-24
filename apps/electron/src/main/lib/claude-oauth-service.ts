/**
 * Claude Pro/Max 订阅 OAuth 登录服务
 *
 * 复用已打包的真实官方 claude 二进制的 `setup-token` 子命令完成登录——不重新
 * 实现 OAuth PKCE 流程，避免冒用第三方 client_id，也避免被 Anthropic 判定为
 * "第三方 harness 的 extra usage"计费。该二进制同时是 Agent（Code）模式实际
 * 发起请求所用的同一进程，登录与执行的鉴权路径完全一致。
 *
 * `setup-token` 生成的是不可刷新的长效（约 1 年）token，没有 refresh token，
 * 过期后需要用户重新走一遍本流程（对应 packages/shared 的
 * isClaudeOAuthCredentialStale 本地估算提醒）。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { shell } from 'electron'
import type { ClaudeOAuthCredentials } from '@luxcoder/shared'
import { resolveClaudeAgentBinaryPath } from './config-paths'

const TOKEN_PATTERN = /sk-ant-oat[A-Za-z0-9_-]{6,}/
const AUTH_URL_PATTERN = /https:\/\/claude\.ai\/oauth\/authorize\?[^\s"')]+/

export interface ClaudeLoginCallbacks {
  /** 捕获到授权 URL 时回调（除自动打开浏览器外，供 UI 展示兜底链接）。 */
  onAuthUrl?: (url: string) => void
  /** 子进程输出的非 URL/非 token 文本行，用于 UI 展示进度。 */
  onProgress?: (message: string) => void
}

/** 进行中的登录子进程（同一时刻只允许一个登录流程）。 */
let activeChild: ChildProcess | undefined

function extractDiagnostic(stdout: string, stderr: string): string {
  const tail = `${stdout}\n${stderr}`.trim()
  return tail.slice(-500)
}

/**
 * 发起一次 Claude Pro/Max 订阅 OAuth 登录。
 *
 * 成功返回 { token, obtainedAt }；失败或取消则抛错。真实 claude 二进制自行
 * 打开系统浏览器完成授权；本函数额外扫描 stdout 里出现的授权 URL 并主动
 * shell.openExternal 一次作为兜底（即便二进制已自动打开，重复打开无害）。
 */
export async function loginClaudeOAuth(callbacks?: ClaudeLoginCallbacks): Promise<ClaudeOAuthCredentials> {
  cancelClaudeOAuthLogin()

  const binaryPath = resolveClaudeAgentBinaryPath()
  if (!binaryPath) {
    throw new Error('未找到 Claude 运行时，请重装应用')
  }

  return new Promise<ClaudeOAuthCredentials>((resolve, reject) => {
    const child = spawn(binaryPath, ['setup-token'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    activeChild = child

    let stdout = ''
    let stderr = ''
    let urlOpened = false
    let settled = false

    const settleResolve = (credentials: ClaudeOAuthCredentials): void => {
      if (settled) return
      settled = true
      if (activeChild === child) activeChild = undefined
      child.kill()
      resolve(credentials)
    }

    const settleReject = (error: Error): void => {
      if (settled) return
      settled = true
      if (activeChild === child) activeChild = undefined
      reject(error)
    }

    const handleChunk = (chunk: Buffer): void => {
      const text = chunk.toString('utf-8')
      stdout += text

      if (!urlOpened) {
        const urlMatch = stdout.match(AUTH_URL_PATTERN)
        if (urlMatch) {
          urlOpened = true
          callbacks?.onAuthUrl?.(urlMatch[0])
          shell.openExternal(urlMatch[0]).catch((err) => console.error('[Claude OAuth] 打开浏览器失败:', err))
        }
      }

      const tokenMatch = stdout.match(TOKEN_PATTERN)
      if (tokenMatch) {
        settleResolve({ token: tokenMatch[0], obtainedAt: Date.now() })
        return
      }

      if (text.trim()) {
        callbacks?.onProgress?.(text.trim())
      }
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (error) => {
      settleReject(new Error(`无法启动 Claude 登录进程: ${error.message}`))
    })

    child.on('close', (code) => {
      if (settled) return
      const diagnostic = extractDiagnostic(stdout, stderr)
      settleReject(new Error(
        code === 0
          ? `登录未返回有效 token${diagnostic ? `：${diagnostic}` : ''}`
          : `登录失败${diagnostic ? `：${diagnostic}` : `（退出码 ${code}）`}`,
      ))
    })
  })
}

/** 取消进行中的 Claude OAuth 登录流程（若有）。 */
export function cancelClaudeOAuthLogin(): void {
  activeChild?.kill()
  activeChild = undefined
}
