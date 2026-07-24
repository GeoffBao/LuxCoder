# Claude Pro/Max 订阅登录（Agent 模式）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在「模型配置」里新增一个「Claude Pro/Max（订阅登录）」渠道，通过浏览器 OAuth 登录 Claude Pro/Max/Team/Enterprise 订阅账号，在 Code/Agent 模式下按订阅额度使用，而不是必须去 Console 开按量计费的 API Key。

**Architecture:** 新增独立 `ProviderType: 'anthropic-oauth'`（与既有 `openai-codex` 平级，不改动 `anthropic` provider 本身）。登录不重新实现 OAuth PKCE，而是 spawn 已打包进应用的**真实官方 `claude` 二进制**执行 `setup-token` 子命令——该命令自己打开浏览器走官方授权页，完成后把长效（约 1 年、不可刷新）token 打印到 stdout。运行时把这个 token 塞进 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量传给同一个真实二进制去发起实际请求，因此登录与执行的鉴权路径完全一致，计费按订阅额度走，不存在被判定成"第三方 extra usage"的风险。这个 provider 的会话强制走 `'claude'` runtime（不受全局 `CLAUDE_RUNTIME_ENABLED=false` 开关影响，也不影响其它任何渠道），Chat 模式下选中该渠道直接拒绝并引导切换到 Code 模式。

**Tech Stack:** TypeScript, Bun test, Electron (`child_process.spawn` + `safeStorage` 加密), React (Jotai 已有渲染层模式)

**前置文档：** `docs/superpowers/specs/2026-07-24-claude-subscription-oauth-login-design.md`（已用户评审通过，含 `CLAUDE_RUNTIME_ENABLED` 例外的完整背景）

---

## Task 1: 共享类型 — 新增 `anthropic-oauth` Provider 枚举

**Files:**
- Modify: `packages/shared/src/types/channel.ts:11-100`（`ProviderType` / `PROVIDER_DEFAULT_URLS` / `PROVIDER_LABELS` / `AGENT_COMPATIBLE_PROVIDERS`）
- Test: `packages/shared/src/types/channel.test.ts`

- [ ] **Step 1: 写失败测试，断言新枚举值在三张表里都有条目且被判定为 Agent 兼容**

在 `packages/shared/src/types/channel.test.ts` 末尾追加：

```ts
import { PROVIDER_DEFAULT_URLS, PROVIDER_LABELS, isAgentCompatibleProvider } from './channel'

describe('anthropic-oauth provider 注册', () => {
  test('Given anthropic-oauth When 查 defaultUrls/labels Then 都有条目', () => {
    expect(PROVIDER_DEFAULT_URLS['anthropic-oauth']).toBe('')
    expect(PROVIDER_LABELS['anthropic-oauth']).toBe('Claude Pro/Max（订阅登录）')
  })

  test('Given anthropic-oauth When 判定 Agent 兼容性 Then true', () => {
    expect(isAgentCompatibleProvider('anthropic-oauth')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/shared && bun test src/types/channel.test.ts`
Expected: FAIL —`Property 'anthropic-oauth' does not exist`（TS 类型错误，此时 `ProviderType` 还没有这个字面量）

- [ ] **Step 3: 在 `channel.ts` 加入枚举值与三张表条目**

`ProviderType` union（[channel.ts:11-40](packages/shared/src/types/channel.ts)），在 `'anthropic-compatible'` 之后插入：

```ts
export type ProviderType =
  | 'anthropic'
  | 'anthropic-compatible'
  | 'anthropic-oauth'
  | 'openai'
  ...
```

`PROVIDER_DEFAULT_URLS`（第 45 行起），在 `'anthropic-compatible': '',` 之后插入：

```ts
  // Claude Pro/Max 订阅登录：baseUrl 由官方 claude 二进制内部管理，无需用户填写。
  'anthropic-oauth': '',
```

`PROVIDER_LABELS`（第 76 行起），在 `'anthropic-compatible': 'Anthropic 兼容格式',` 之后插入：

```ts
  'anthropic-oauth': 'Claude Pro/Max（订阅登录）',
```

`AGENT_COMPATIBLE_PROVIDERS`（第 108 行起），加入：

```ts
export const AGENT_COMPATIBLE_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'anthropic',
  'anthropic-compatible',
  'anthropic-oauth',
  ...
])
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/shared && bun test src/types/channel.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 typecheck，确认没有遗漏 exhaustive 的 `Record<ProviderType, ...>`**

Run: `cd /Users/admin/Workspace/ClaudeCode/LuxAgents && bun run typecheck 2>&1 | grep -A2 "anthropic-oauth\|Property.*missing\|does not satisfy"`
Expected: 报出 `apps/electron/src/renderer/lib/model-logo.ts` 的 `PROVIDER_LOGO_MAP` 缺少 `'anthropic-oauth'` 键（`Record<ProviderType, string>` 是穷尽类型，这里必然报错）。这是预期的——留给 Task 10 处理，此处只需确认报错位置和描述一致，不要在本 Task 里顺手改（避免跨 Task 改动交叉，出问题不好定位）。

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/types/channel.ts packages/shared/src/types/channel.test.ts
git commit -m "feat(shared): register anthropic-oauth provider type"
```

---

## Task 2: 共享类型 — `ClaudeOAuthCredentials` 凭据结构

**Files:**
- Modify: `packages/shared/src/types/channel.ts`（在 `CodexOAuthCredentials` 相关函数块之后新增）
- Test: `packages/shared/src/types/channel.claude-oauth.test.ts`（新建，对齐 `channel.codex.test.ts` 命名与风格）

- [ ] **Step 1: 写失败测试**

创建 `packages/shared/src/types/channel.claude-oauth.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/shared && bun test src/types/channel.claude-oauth.test.ts`
Expected: FAIL — `serializeClaudeOAuthCredentials is not a function`（尚未定义）

- [ ] **Step 3: 在 `channel.ts` 里 `isCodexCredentialExpired` 函数之后新增结构与函数**

```ts
/**
 * Claude Pro/Max 订阅登录（`claude setup-token`）凭据。
 *
 * 复用 Channel.apiKey 字段承载：序列化为 JSON 后经 safeStorage 加密存储，
 * 与 CodexOAuthCredentials 同一套「凭据塞进 apiKey 字段」模式。
 *
 * 与 Codex 的关键区别：`setup-token` 生成的是不可刷新的长效 token（约 1 年），
 * 没有 refresh token，所以没有 expires/refresh 字段，只有 obtainedAt 用于本地
 * 估算"是否该提醒用户重新登录"（并非精确过期时间，服务端才是权威判定）。
 */
export interface ClaudeOAuthCredentials {
  /** 长效 OAuth token（`sk-ant-oat...`），直接作为 CLAUDE_CODE_OAUTH_TOKEN 使用 */
  token: string
  /** 登录成功时间戳（Unix 毫秒），用于本地估算提醒阈值 */
  obtainedAt: number
  /** 可选：账号标识，用于展示登录身份 */
  accountId?: string
}

/** 将 OAuth 凭据序列化为存入 apiKey 字段的 JSON 字符串。 */
export function serializeClaudeOAuthCredentials(credentials: ClaudeOAuthCredentials): string {
  return JSON.stringify(credentials)
}

/** 从 apiKey 字段解析 Claude 订阅 OAuth 凭据；非合法 JSON 或缺少必需字段时返回 null。 */
export function parseClaudeOAuthCredentials(secret: string): ClaudeOAuthCredentials | null {
  const trimmed = secret.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as Partial<ClaudeOAuthCredentials>
    if (typeof parsed.token === 'string' && parsed.token
      && typeof parsed.obtainedAt === 'number') {
      return {
        token: parsed.token,
        obtainedAt: parsed.obtainedAt,
        ...(typeof parsed.accountId === 'string' && parsed.accountId ? { accountId: parsed.accountId } : {}),
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 判断 Claude 订阅登录是否该提醒用户重新登录。
 *
 * `setup-token` 生成的 token 官方文档只说"约 1 年"，没有精确过期时间返回。
 * 按 335 天（1 年减 30 天缓冲）本地估算阈值，纯 UI 提醒，不阻塞使用——
 * 真正过期时服务端会返回 401，运行时错误处理走既有链路提示重新登录。
 */
export function isClaudeOAuthCredentialStale(credentials: ClaudeOAuthCredentials): boolean {
  const STALE_AFTER_MS = 335 * 86_400_000
  return Date.now() - credentials.obtainedAt >= STALE_AFTER_MS
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/shared && bun test src/types/channel.claude-oauth.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/types/channel.ts packages/shared/src/types/channel.claude-oauth.test.ts
git commit -m "feat(shared): add ClaudeOAuthCredentials serialize/parse/stale helpers"
```

---

## Task 3: 抽取 `resolveSDKCliPath` 到 `config-paths.ts`（供登录服务复用）

**Files:**
- Modify: `apps/electron/src/main/lib/config-paths.ts`（新增导出函数）
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts:266-324`（删除本地实现，改为导入）

这是纯重构：把 `agent-orchestrator.ts` 里定位真实 `claude` 二进制路径的逻辑移到 `config-paths.ts`（该文件已经承载同类职责的 `getBundledCliPath`），这样新的 `claude-oauth-service.ts` 不需要依赖体量巨大的 `agent-orchestrator.ts` 模块图就能拿到同一份路径解析逻辑。行为完全不变，只是搬家 + 改名（`resolveSDKCliPath` → `resolveClaudeAgentBinaryPath`，名字更准确地反映"解析的是 Anthropic 官方二进制"而不是 LuxCoder 自己的 CLI）。

- [ ] **Step 1: 在 `config-paths.ts` 追加函数**

在 `apps/electron/src/main/lib/config-paths.ts` 顶部 import 区加入（若已存在同名 import 则合并）：

```ts
import { createRequire } from 'node:module'
```

在文件末尾（`getBundledCliPath` 函数之后）追加：

```ts
/**
 * 解析已打包的真实官方 `claude` 二进制路径（`@anthropic-ai/claude-agent-sdk-{platform}-{arch}`）。
 *
 * 从 `agent-orchestrator.ts` 抽取而来：Agent（Code）模式的 SDK 执行与
 * `claude-oauth-service.ts` 的订阅登录都需要定位同一个二进制，抽到这里
 * 避免登录服务依赖体量巨大的 orchestrator 模块图。
 *
 * 0.2.113+ 起 SDK 改为按平台分发 native binary，通过 optionalDependencies 安装到
 * `@anthropic-ai/claude-agent-sdk-{platform}-{arch}` 子包，与主包 `@anthropic-ai/claude-agent-sdk`
 * 同级。binary 名 macOS/Linux 为 `claude`，Windows 为 `claude.exe`。
 *
 * SDK 作为 esbuild external 依赖，require.resolve 可在运行时解析主包入口路径，
 * 再沿父目录 `@anthropic-ai/` 找到同级的平台子包。
 *
 * 多种策略降级：createRequire → 全局 require → cwd/node_modules 手动查找。
 * 打包环境下：asar 内的路径需要转换为 asar.unpacked 路径。
 */
export function resolveClaudeAgentBinaryPath(): string {
  const { app } = require('electron')
  const subpkg = `claude-agent-sdk-${process.platform}-${process.arch}`
  const scopedSubpkg = `@anthropic-ai/${subpkg}`
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  let binaryPath: string | null = null

  try {
    const cjsRequire = createRequire(__filename)
    const sdkEntryPath = cjsRequire.resolve('@anthropic-ai/claude-agent-sdk')
    const anthropicDir = join(sdkEntryPath, '..', '..')
    binaryPath = join(anthropicDir, subpkg, binaryName)
    if (!existsSync(binaryPath)) {
      const subpkgPackagePath = cjsRequire.resolve(`${scopedSubpkg}/package.json`)
      binaryPath = join(subpkgPackagePath, '..', binaryName)
    }
  } catch (e) {
    console.warn('[配置路径] createRequire 解析 Claude 二进制路径失败:', e)
  }

  if (!binaryPath || !existsSync(binaryPath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sdkEntryPath = require.resolve('@anthropic-ai/claude-agent-sdk')
      const anthropicDir = join(sdkEntryPath, '..', '..')
      binaryPath = join(anthropicDir, subpkg, binaryName)
      if (!existsSync(binaryPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const subpkgPackagePath = require.resolve(`${scopedSubpkg}/package.json`)
        binaryPath = join(subpkgPackagePath, '..', binaryName)
      }
    } catch (e) {
      console.warn('[配置路径] require.resolve 解析 Claude 二进制路径失败:', e)
    }
  }

  if (!binaryPath || !existsSync(binaryPath)) {
    binaryPath = join(__dirname, '..', 'node_modules', '@anthropic-ai', subpkg, binaryName)
  }

  if (app.isPackaged && binaryPath.includes('.asar')) {
    binaryPath = binaryPath.replace(/\.asar([/\\])/, '.asar.unpacked$1')
  }

  return binaryPath
}
```

（注：`dirname(dirname(x))` 原实现改写成 `join(x, '..', '..')` 是等价的，`config-paths.ts` 顶部已有 `join` 导入，不需要额外导入 `dirname`。）

- [ ] **Step 2: 更新 `agent-orchestrator.ts`，删除本地实现，改用导入**

在 `apps/electron/src/main/lib/agent-orchestrator.ts:50` 的 import 里加入 `resolveClaudeAgentBinaryPath`：

```ts
import { getAgentWorkspacePath, getAgentSessionWorkspacePath, getSdkConfigDir, getWorkspaceFilesDir, getBundledCliPath, getWorkspaceSkillsDir, resolveClaudeAgentBinaryPath } from './config-paths'
```

删除 [agent-orchestrator.ts:250-324](apps/electron/src/main/lib/agent-orchestrator.ts) 整个 `resolveSDKCliPath` 函数定义（含其上方注释块）。

搜索文件内所有 `resolveSDKCliPath()` 调用（应该只有一处，`agentRuntime === 'claude' ? resolveSDKCliPath() : undefined` 那一行），替换为 `resolveClaudeAgentBinaryPath()`：

```ts
const cliPath = agentRuntime === 'claude' ? resolveClaudeAgentBinaryPath() : undefined
```

- [ ] **Step 3: typecheck + 跑现有 Agent 相关测试确认没有破坏行为**

Run: `cd apps/electron && bun run typecheck`
Expected: 无新增错误（`resolveSDKCliPath` 相关的引用应该已全部替换干净）

Run: `cd apps/electron && bun test src/main/lib/agent-sdk-auth-env.test.ts src/main/lib/channel-runtime-api-key.test.ts`
Expected: PASS（这两个是本次改动附近现存的测试，确认没有连带破坏）

- [ ] **Step 4: 提交**

```bash
git add apps/electron/src/main/lib/config-paths.ts apps/electron/src/main/lib/agent-orchestrator.ts
git commit -m "refactor(electron): extract resolveClaudeAgentBinaryPath to config-paths"
```

---

## Task 4: `claude-oauth-service.ts` — 登录服务（spawn 真实二进制）

**Files:**
- Create: `apps/electron/src/main/lib/claude-oauth-service.ts`
- Test: `apps/electron/src/main/lib/claude-oauth-service.test.ts`

- [ ] **Step 1: 写失败测试（mock child_process.spawn）**

创建 `apps/electron/src/main/lib/claude-oauth-service.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/electron && bun test src/main/lib/claude-oauth-service.test.ts`
Expected: FAIL — `Cannot find module './claude-oauth-service'`

- [ ] **Step 3: 实现 `claude-oauth-service.ts`**

创建 `apps/electron/src/main/lib/claude-oauth-service.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/electron && bun test src/main/lib/claude-oauth-service.test.ts`
Expected: PASS（4 个 test）

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/main/lib/claude-oauth-service.ts apps/electron/src/main/lib/claude-oauth-service.test.ts
git commit -m "feat(electron): add claude-oauth-service spawning the bundled claude binary"
```

---

## Task 5: IPC 通道与类型 — `CLAUDE_OAUTH_LOGIN` / `CLAUDE_OAUTH_CANCEL`

**Files:**
- Modify: `packages/shared/src/types/channel.ts`（`CHANNEL_IPC_CHANNELS` + 新增 `ClaudeOAuthLoginResult` 类型）
- Modify: `apps/electron/src/main/ipc.ts`（新增两个 handler）
- Modify: `apps/electron/src/preload/index.ts`（暴露两个方法）

这一步没有独立单测（IPC handler 是薄封装，行为已被 Task 4 的 `claude-oauth-service.test.ts` 覆盖；照抄 Codex 那两个 handler 的既有模式，风险很低），靠 Step 3 的 typecheck 与 Step 4 的手动验证兜底。

- [ ] **Step 1: 在 `channel.ts` 加 IPC 通道常量与结果类型**

在 `CHANNEL_IPC_CHANNELS`（[channel.ts:434-457](packages/shared/src/types/channel.ts)）里，`CODEX_OAUTH_CANCEL` 之后追加：

```ts
  /** 发起 Claude Pro/Max 订阅 OAuth 登录，返回加密凭据与账号信息 */
  CLAUDE_OAUTH_LOGIN: 'channel:claude-oauth-login',
  /** 取消进行中的 Claude 订阅 OAuth 登录流程 */
  CLAUDE_OAUTH_CANCEL: 'channel:claude-oauth-cancel',
```

在文件末尾（`CodexOAuthLoginResult` 接口之后）追加：

```ts
/**
 * Claude Pro/Max 订阅 OAuth 登录结果。
 *
 * 登录在主进程执行（spawn 真实 claude 二进制的 setup-token 子命令），成功后
 * 返回已序列化的凭据 JSON（可直接作为 Channel.apiKey 存储）与展示信息。
 */
export interface ClaudeOAuthLoginResult {
  /** 是否登录成功 */
  success: boolean
  /**
   * 序列化后的凭据 JSON（明文）。与现有 apiKey 明文回传模式一致：
   * 渲染层拿到后作为 Channel.apiKey 传给 create/update，由 channel-manager 加密存储。
   */
  credentials?: string
  /** 失败或取消时的用户可读原因 */
  message?: string
}
```

- [ ] **Step 2: 在 `ipc.ts` 注册两个 handler**

在 `apps/electron/src/main/ipc.ts` 顶部 import 区（`loginCodexOAuth, cancelCodexOAuthLogin` 那一行附近）加入：

```ts
import { loginClaudeOAuth, cancelClaudeOAuthLogin } from './lib/claude-oauth-service'
import { serializeClaudeOAuthCredentials } from '@luxcoder/shared'
```

（若 `serializeClaudeOAuthCredentials` 已在别处从 `@luxcoder/shared` 的解构 import 里出现，合并到同一条 import，不要重复 import 语句。）

在 `CODEX_OAUTH_CANCEL` 的 handler 注册（约 [ipc.ts:1199-1205](apps/electron/src/main/ipc.ts)）之后追加：

```ts
  // 发起 Claude Pro/Max 订阅 OAuth 登录。登录在主进程执行（spawn 真实 claude
  // 二进制的 setup-token 子命令）；成功后返回序列化的凭据 JSON（明文），由渲染
  // 层作为 apiKey 传给 create/update，channel-manager 加密后存储——与 Codex
  // OAuth、以及现有 apiKey 明文回传模式一致。
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.CLAUDE_OAUTH_LOGIN,
    async (): Promise<import('@luxcoder/shared').ClaudeOAuthLoginResult> => {
      try {
        const credentials = await loginClaudeOAuth()
        return {
          success: true,
          credentials: serializeClaudeOAuthCredentials(credentials),
        }
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }
  )

  // 取消进行中的 Claude 订阅 OAuth 登录流程
  ipcMain.handle(
    CHANNEL_IPC_CHANNELS.CLAUDE_OAUTH_CANCEL,
    async (): Promise<void> => {
      cancelClaudeOAuthLogin()
    }
  )
```

- [ ] **Step 3: 在 `preload/index.ts` 暴露方法**

在类型声明区（`codexOAuthCancel: () => Promise<void>` 之后，[preload/index.ts:377](apps/electron/src/preload/index.ts)）加入：

```ts
  /** 发起 Claude Pro/Max 订阅 OAuth 登录，返回序列化凭据（作为 apiKey 存储） */
  claudeOAuthLogin: () => Promise<ClaudeOAuthLoginResult>

  /** 取消进行中的 Claude 订阅 OAuth 登录 */
  claudeOAuthCancel: () => Promise<void>
```

（若文件顶部 `import type { ... CodexOAuthLoginResult ... } from '@luxcoder/shared'` 已存在，把 `ClaudeOAuthLoginResult` 加进同一条 import。）

在实现区（`codexOAuthCancel: () => {...}` 之后，[preload/index.ts:1449-1451](apps/electron/src/preload/index.ts)）加入：

```ts
  claudeOAuthLogin: () => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.CLAUDE_OAUTH_LOGIN)
  },

  claudeOAuthCancel: () => {
    return ipcRenderer.invoke(CHANNEL_IPC_CHANNELS.CLAUDE_OAUTH_CANCEL)
  },
```

- [ ] **Step 4: typecheck 全量确认接线正确**

Run: `cd /Users/admin/Workspace/ClaudeCode/LuxAgents && bun run typecheck`
Expected: 无 `claudeOAuthLogin`/`ClaudeOAuthLoginResult`/`CLAUDE_OAUTH_LOGIN` 相关报错（`model-logo.ts` 那条 `anthropic-oauth` 缺失键的报错应该还在，属于 Task 10 范围，暂时忽略）

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/types/channel.ts apps/electron/src/main/ipc.ts apps/electron/src/preload/index.ts
git commit -m "feat(electron): wire up CLAUDE_OAUTH_LOGIN/CANCEL IPC channels"
```

---

## Task 6: `agent-sdk-auth-env.ts` — `anthropic-oauth` 认证分支

**Files:**
- Modify: `apps/electron/src/main/lib/agent-sdk-auth-env.ts`
- Test: `apps/electron/src/main/lib/agent-sdk-auth-env.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/electron/src/main/lib/agent-sdk-auth-env.test.ts` 的 `describe('Agent SDK 认证环境变量', ...)` 块内追加：

```ts
  test('Given Claude 订阅 OAuth 渠道 When 写入 SDK 认证 env Then 使用 CLAUDE_CODE_OAUTH_TOKEN', () => {
    const env: Record<string, string | undefined> = {}

    applyAgentSdkAuthEnv(env, 'anthropic-oauth', 'sk-ant-oat01-token', 'LuxCoder/test')

    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-token')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/electron && bun test src/main/lib/agent-sdk-auth-env.test.ts`
Expected: FAIL — `env.CLAUDE_CODE_OAUTH_TOKEN` 为 `undefined`，因为当前实现会落到 `target.ANTHROPIC_API_KEY = apiKey` 分支

- [ ] **Step 3: 在 `applyAgentSdkAuthEnv` 加分支**

修改 `apps/electron/src/main/lib/agent-sdk-auth-env.ts`，在 `if (provider === 'minimax') { ... }` 块之后、`target.ANTHROPIC_API_KEY = apiKey` 之前插入：

```ts
  if (provider === 'anthropic-oauth') {
    target.CLAUDE_CODE_OAUTH_TOKEN = apiKey
    return
  }

```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/electron && bun test src/main/lib/agent-sdk-auth-env.test.ts`
Expected: PASS（全部用例，含新增的一个）

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/main/lib/agent-sdk-auth-env.ts apps/electron/src/main/lib/agent-sdk-auth-env.test.ts
git commit -m "feat(electron): route anthropic-oauth channels to CLAUDE_CODE_OAUTH_TOKEN"
```

---

## Task 7: `channel-manager.ts` — 解析运行时 token

**Files:**
- Modify: `apps/electron/src/main/lib/channel-manager.ts`
- Test: `apps/electron/src/main/lib/channel-runtime-api-key.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/electron/src/main/lib/channel-runtime-api-key.test.ts` 顶部 import 区加入：

```ts
import { serializeCodexCredentials, serializeClaudeOAuthCredentials } from '@luxcoder/shared'
```

在 `describe('渠道运行时认证解析', ...)` 块内追加（跟在已有的两个 test 后面）：

```ts
  test('Given Claude 订阅 OAuth 渠道 When 解析运行时 key Then 返回 token 而不是凭据 JSON', async () => {
    writeChannels([
      {
        id: 'claude-oauth-channel',
        name: 'Claude Pro/Max',
        provider: 'anthropic-oauth',
        baseUrl: '',
        apiKey: serializeClaudeOAuthCredentials({
          token: 'sk-ant-oat01-runtime-token',
          obtainedAt: Date.now(),
        }),
        models: [],
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ])

    await expect(channelManager.resolveChannelRuntimeApiKey('claude-oauth-channel'))
      .resolves.toBe('sk-ant-oat01-runtime-token')
  })

  test('Given Claude 订阅渠道凭据损坏 When 解析运行时 key Then 抛出可读错误', async () => {
    writeChannels([
      {
        id: 'claude-oauth-broken',
        name: 'Claude Pro/Max',
        provider: 'anthropic-oauth',
        baseUrl: '',
        apiKey: 'not-valid-json',
        models: [],
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ])

    await expect(channelManager.resolveChannelRuntimeApiKey('claude-oauth-broken'))
      .rejects.toThrow(/重新登录/)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/electron && bun test src/main/lib/channel-runtime-api-key.test.ts`
Expected: FAIL — 第一个新用例会把整段加密的凭据 JSON 当普通 apiKey 解密返回（因为当前 `resolveChannelRuntimeApiKey` 没有 `anthropic-oauth` 分支），断言值不匹配

- [ ] **Step 3: 实现 `resolveClaudeOAuthAccessToken` 并接入 `resolveChannelRuntimeApiKey`**

在 `apps/electron/src/main/lib/channel-manager.ts` 顶部 import 区，把 `parseCodexCredentials, serializeCodexCredentials, isCodexCredentialExpired` 那一行的 `@luxcoder/shared` 具名 import 扩展为同时引入：

```ts
import {
  extractZhipuCodingTeamApiToken,
  parseZhipuTeamCredentials,
  PROVIDER_DEFAULT_URLS,
  parseCodexCredentials,
  serializeCodexCredentials,
  isCodexCredentialExpired,
  parseClaudeOAuthCredentials,
} from '@luxcoder/shared'
```

在 `resolveCodexAccessToken` 函数（[channel-manager.ts:493-496](apps/electron/src/main/lib/channel-manager.ts)）之后、`resolveChannelRuntimeApiKey` 定义之前插入：

```ts
/**
 * 解析 Claude Pro/Max 订阅登录渠道的运行时 token。
 *
 * 与 Codex 不同：`setup-token` 生成的是不可刷新的长效 token，这里只做纯解析，
 * 没有刷新逻辑；真正过期时由运行时 401 错误链路提示用户重新登录。
 */
function resolveClaudeOAuthAccessToken(channelId: string): string {
  const channel = getChannelById(channelId)
  if (!channel || channel.provider !== 'anthropic-oauth') {
    throw new Error(`Claude 订阅登录渠道不存在或类型不匹配: ${channelId}`)
  }

  const credentials = parseClaudeOAuthCredentials(decryptKey(channel.apiKey))
  if (!credentials) {
    throw new Error('Claude 订阅登录凭据无效或缺失，请重新登录')
  }

  return credentials.token
}
```

修改 `resolveChannelRuntimeApiKey`（[channel-manager.ts:504-513](apps/electron/src/main/lib/channel-manager.ts)）：

```ts
export async function resolveChannelRuntimeApiKey(channelId: string): Promise<string> {
  const channel = getChannelById(channelId)
  if (!channel) {
    throw new Error(`渠道不存在: ${channelId}`)
  }

  if (channel.provider === 'openai-codex') return resolveCodexAccessToken(channelId)
  if (channel.provider === 'anthropic-oauth') return resolveClaudeOAuthAccessToken(channelId)
  return decryptApiKey(channelId)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/electron && bun test src/main/lib/channel-runtime-api-key.test.ts`
Expected: PASS（全部 4 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/electron/src/main/lib/channel-manager.ts apps/electron/src/main/lib/channel-runtime-api-key.test.ts
git commit -m "feat(electron): resolve anthropic-oauth channel runtime token"
```

---

## Task 8: 抽取 `normalizeAgentRuntime` + provider 例外

`agent-orchestrator.ts` 顶部 `import { app } from 'electron'`，并传递依赖十几个 `./lib/*` 服务（agent-session-manager、agent-workspace-manager、project-repository 等），大概率其中不少在模块加载时就会触碰 Electron API。为测试这一个纯函数就在测试文件里 `import './agent-orchestrator'`，等于要连带 mock 一整套模块图——脆弱且和本次改动无关。做法对齐 Task 3：把这个纯函数抽到一个零依赖的小文件里，`agent-orchestrator.ts` 改为从那里导入。

**Files:**
- Create: `apps/electron/src/main/lib/agent-runtime-normalize.ts`
- Test: `apps/electron/src/main/lib/agent-runtime-normalize.test.ts`
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts`（删除本地实现，改为导入 + 更新调用处）

- [ ] **Step 1: 写失败测试**

创建 `apps/electron/src/main/lib/agent-runtime-normalize.test.ts`：

```ts
import { describe, expect, test } from 'bun:test'
import { normalizeAgentRuntime } from './agent-runtime-normalize'

describe('Agent runtime 归一化', () => {
  test('Given anthropic-oauth 渠道 When 归一化 Then 恒为 claude（不受全局开关影响）', () => {
    expect(normalizeAgentRuntime('pi', 'anthropic-oauth')).toBe('claude')
    expect(normalizeAgentRuntime('claude', 'anthropic-oauth')).toBe('claude')
    expect(normalizeAgentRuntime(undefined, 'anthropic-oauth')).toBe('claude')
  })

  test('Given openai-codex 渠道 When 归一化 Then 行为不受影响（回归用例）', () => {
    // CLAUDE_RUNTIME_ENABLED 当前为 false，全局强制 pi；此用例锁定这个既有行为
    // 不因为新增 anthropic-oauth 例外而被误改。
    expect(normalizeAgentRuntime('claude', 'openai-codex')).toBe('pi')
    expect(normalizeAgentRuntime('pi', 'openai-codex')).toBe('pi')
  })

  test('Given 未传 provider When 归一化 Then 行为与改动前一致', () => {
    expect(normalizeAgentRuntime('claude')).toBe('pi')
    expect(normalizeAgentRuntime('pi')).toBe('pi')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/electron && bun test src/main/lib/agent-runtime-normalize.test.ts`
Expected: FAIL — `Cannot find module './agent-runtime-normalize'`

- [ ] **Step 3: 创建 `agent-runtime-normalize.ts`**

```ts
/**
 * Agent runtime 归一化 — 独立成零 Electron 依赖的小文件。
 *
 * 抽离原因：这是纯函数，但原本定义处 agent-orchestrator.ts 顶层 import 了
 * 十几个 Electron 相关服务模块；测试这一个函数不该连带拉起那整张模块图。
 */

import type { ProviderType } from '@luxcoder/shared'
import { CLAUDE_RUNTIME_ENABLED, type AgentRuntime } from '@luxcoder/shared'

export function normalizeAgentRuntime(value: unknown, provider?: ProviderType): AgentRuntime {
  // anthropic-oauth 结构性依赖真实 claude 二进制（Pi 不理解 CLAUDE_CODE_OAUTH_TOKEN），
  // 不受全局 CLAUDE_RUNTIME_ENABLED 开关影响；用户对此无感——渠道选择即决定 runtime。
  if (provider === 'anthropic-oauth') return 'claude'
  // Claude 内核默认关闭时，所有执行（含历史会话）强制回落到 Pi。
  if (!CLAUDE_RUNTIME_ENABLED) return 'pi'
  return value === 'pi' ? 'pi' : 'claude'
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/electron && bun test src/main/lib/agent-runtime-normalize.test.ts`
Expected: PASS（3 个 test）

- [ ] **Step 5: 更新 `agent-orchestrator.ts`：删除本地实现，改为导入**

删除 [agent-orchestrator.ts:106-110](apps/electron/src/main/lib/agent-orchestrator.ts) 的本地 `normalizeAgentRuntime` 定义。

在 import 区（`isAgentCompatibleProvider, CLAUDE_RUNTIME_ENABLED` 那一条 `@luxcoder/shared` 具名 import，[agent-orchestrator.ts:24-36](apps/electron/src/main/lib/agent-orchestrator.ts)）里，若 `CLAUDE_RUNTIME_ENABLED` 已不再被本文件其它地方直接使用，移除该具名导入（先用 `grep -n "CLAUDE_RUNTIME_ENABLED" apps/electron/src/main/lib/agent-orchestrator.ts` 确认没有其它引用再删，避免误删仍在用的导入）。

加入新导入：

```ts
import { normalizeAgentRuntime } from './agent-runtime-normalize'
```

更新调用处（原 [agent-orchestrator.ts:1000-1001](apps/electron/src/main/lib/agent-orchestrator.ts)，此时 `channel` 已在上文解析完毕）：

```ts
    const previousAgentRuntime = normalizeAgentRuntime(sessionMeta?.agentRuntime ?? 'claude', channel.provider)
    const agentRuntime = normalizeAgentRuntime(inputAgentRuntime ?? sessionMeta?.agentRuntime ?? 'claude', channel.provider)
```

- [ ] **Step 6: typecheck 确认调用处签名匹配、无残留死引用**

Run: `cd apps/electron && bun run typecheck`
Expected: 无 `normalizeAgentRuntime` 相关报错

- [ ] **Step 7: 回归跑一次 agent-sdk-auth-env / channel-runtime-api-key 测试，确认没有连带破坏**

Run: `cd apps/electron && bun test src/main/lib/agent-sdk-auth-env.test.ts src/main/lib/channel-runtime-api-key.test.ts src/main/lib/agent-runtime-normalize.test.ts`
Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
git add apps/electron/src/main/lib/agent-orchestrator.ts apps/electron/src/main/lib/agent-runtime-normalize.ts apps/electron/src/main/lib/agent-runtime-normalize.test.ts
git commit -m "refactor(electron): extract normalizeAgentRuntime, force claude runtime for anthropic-oauth"
```

---

## Task 9: `chat-service.ts` — Chat 模式 guard + 修正 Codex 现有文案

**Files:**
- Modify: `apps/electron/src/main/lib/chat-service.ts:214-223`（流式发送 guard）
- Modify: `apps/electron/src/main/lib/chat-service.ts` 约 602 行（标题生成 guard）
- Test: `apps/electron/src/main/lib/chat-service.test.ts`（若不存在则新建；先检查是否已有同名测试文件）

- [ ] **Step 1: 检查是否已有 `chat-service.test.ts`，确定新增测试的落点**

Run: `ls apps/electron/src/main/lib/chat-service.test.ts 2>&1`

若文件存在，在其已有的相关 `describe` 块（搜索 `openai-codex` 关键字定位）里追加用例；若不存在，创建新文件，最小化只测这两个 guard 分支（不需要覆盖 chat-service.ts 全部职责）：

```ts
import { describe, expect, test, mock } from 'bun:test'
```

- [ ] **Step 2: 写失败测试**

创建 `apps/electron/src/main/lib/chat-service.test.ts`（真实导出是 `sendMessage(input: ChatSendInput, webContents: WebContents): Promise<void>`，定义于 [chat-service.ts:193](apps/electron/src/main/lib/chat-service.ts)；`ChatSendInput` 必填字段为 `conversationId`/`userMessage`/`messageHistory`/`channelId`/`modelId`，定义于 `packages/shared/src/types/chat.ts:193`）：

```ts
import { describe, expect, mock, test } from 'bun:test'
import { CHAT_IPC_CHANNELS } from '@luxcoder/shared'
import type { WebContents } from 'electron'

const sendMock = mock(() => undefined)

// chat-service.ts 间接 import conversation-manager / attachment-service 等模块，
// 这些模块可能在加载时触碰 Electron API（对齐 channel-runtime-api-key.test.ts
// 的既有防御性做法，避免非 Electron 环境下 bun test 因缺失全局对象而在 import
// 阶段就崩溃）。
mock.module('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/luxcoder-test' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
  shell: { openExternal: async () => undefined },
}))

mock.module('./channel-manager', () => ({
  listChannels: () => [
    {
      id: 'claude-oauth-1',
      provider: 'anthropic-oauth',
      name: 'Claude Pro/Max',
      baseUrl: '',
      apiKey: '',
      models: [],
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  resolveChannelRuntimeApiKey: mock(async () => 'unused'),
}))

describe('Chat 模式 anthropic-oauth guard', () => {
  test('Given anthropic-oauth 渠道 When 发消息 Then 直接拒绝并引导切换 Code 模式，不解密 apiKey', async () => {
    const { sendMessage } = await import('./chat-service')
    const webContents = { send: sendMock } as unknown as WebContents

    await sendMessage(
      {
        conversationId: 'conv-1',
        userMessage: 'hi',
        messageHistory: [],
        channelId: 'claude-oauth-1',
        modelId: 'claude-sonnet-5',
      },
      webContents,
    )

    expect(sendMock).toHaveBeenCalledWith(
      CHAT_IPC_CHANNELS.STREAM_ERROR,
      expect.objectContaining({
        conversationId: 'conv-1',
        error: expect.stringContaining('Code 模式'),
      }),
    )
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd apps/electron && bun test src/main/lib/chat-service.test.ts`
Expected: FAIL——理想情况下是 `anthropic-oauth` 渠道落到"解密 API Key"分支而不是被拒绝。若实际报错是模块加载阶段的异常（例如 `chat-service.ts` 间接 import 的其它模块还需要更多 electron API mock），先把缺的部分加进上面的 `mock.module('electron', ...)`，直到测试能跑到断言那一步、并且是因为断言不匹配而失败，而不是因为 import 崩溃而失败——这是本 Step 允许的正常 TDD 迭代，不是偏离计划。

- [ ] **Step 4: 加 guard 分支 + 修正 Codex 现有文案**

修改 [chat-service.ts:214-223](apps/electron/src/main/lib/chat-service.ts)：

```ts
  // Codex OAuth uses the ChatGPT-specific Responses protocol, which Chat does
  // not currently implement. Keep this guard for historical conversations that
  // still reference a formerly selectable Codex model.
  if (channel.provider === 'openai-codex') {
    webContents.send(CHAT_IPC_CHANNELS.STREAM_ERROR, {
      conversationId,
      error: 'Chat 模式暂不支持 ChatGPT 订阅（Codex OAuth），请切换到 Code 模式使用。',
    })
    return
  }

  // anthropic-oauth 渠道只在 Agent（Code）模式下可用：其 apiKey 字段存储的是
  // CLAUDE_CODE_OAUTH_TOKEN，只能喂给真实 claude 二进制，Chat 走的裸 Messages
  // API 请求无法使用它。
  if (channel.provider === 'anthropic-oauth') {
    webContents.send(CHAT_IPC_CHANNELS.STREAM_ERROR, {
      conversationId,
      error: 'Chat 模式暂不支持 Claude 订阅登录，请切换到 Code 模式使用。',
    })
    return
  }
```

（原来的 "请切换到 Agent 模式使用" 改成 "请切换到 Code 模式使用"——这是本次顺带修正的既有措辞问题，见设计文档 4.1 节之外的第 8 节说明。）

修改标题生成 guard（约 [chat-service.ts:602-606](apps/electron/src/main/lib/chat-service.ts)）：

```ts
  if (channel.provider === 'openai-codex') {
    const fallbackTitle = createFallbackTitle(userMessage)
    console.log('[标题生成] ChatGPT OAuth 渠道使用本地标题:', fallbackTitle)
    return fallbackTitle
  }

  if (channel.provider === 'anthropic-oauth') {
    const fallbackTitle = createFallbackTitle(userMessage)
    console.log('[标题生成] Claude 订阅 OAuth 渠道使用本地标题:', fallbackTitle)
    return fallbackTitle
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/electron && bun test src/main/lib/chat-service.test.ts`
Expected: PASS

- [ ] **Step 6: 全局搜索确认没有遗漏"请切换到 Agent 模式"的其它出现位置**

Run: `grep -rn "切换到 Agent 模式" apps/electron/src`
Expected: 无匹配（若还有其它文件命中，本 Task 范围内一并改成"Code 模式"，因为这是同一个用词问题的延伸，不算跨范围改动）

- [ ] **Step 7: 提交**

```bash
git add apps/electron/src/main/lib/chat-service.ts apps/electron/src/main/lib/chat-service.test.ts
git commit -m "fix(electron): guard anthropic-oauth in Chat mode, fix Code-mode wording"
```

---

## Task 10: `ChannelForm.tsx` + `model-logo.ts` + `context-window.ts` — UI 与穷尽表补全

**Files:**
- Modify: `apps/electron/src/renderer/lib/model-logo.ts`（`PROVIDER_LOGO_MAP` 补键，解决 Task 1 Step 5 遗留的编译错误）
- Modify: `packages/shared/src/utils/context-window.ts`（`AGENT_SDK_1M_CONTEXT_PROVIDER_RULES` 补键）
- Modify: `apps/electron/src/renderer/components/settings/ChannelForm.tsx`（新增下拉项、排序、登录按钮、过期提醒）

这一层是渲染层交互，逻辑简单但涉及大量既有 JSX 结构比对，没有独立单测（现有代码库对 `ChannelForm.tsx` 本身也没有组件测试覆盖，遵循既有约定），靠 Step 6 的手动验证收口。

- [ ] **Step 1: 补 `model-logo.ts` 的 `PROVIDER_LOGO_MAP`**

在 `apps/electron/src/renderer/lib/model-logo.ts:244` 后插入：

```ts
  'anthropic-oauth': ClaudeLogo,
```

Run: `cd apps/electron && bun run typecheck 2>&1 | grep model-logo`
Expected: 无输出（Task 1 Step 5 记录的报错已消失）

- [ ] **Step 2: 补 `context-window.ts` 的 1M 上下文规则**

在 `packages/shared/src/utils/context-window.ts:52-68` 的 `AGENT_SDK_1M_CONTEXT_PROVIDER_RULES` 里，`anthropic: AGENT_SDK_1M_CONTEXT_RULES.claude,` 之后插入：

```ts
  'anthropic-oauth': AGENT_SDK_1M_CONTEXT_RULES.claude,
```

Run: `cd packages/shared && bun test src/utils/context-window.test.ts`
Expected: PASS（新增键不影响现有用例，纯新增行为）

补一条断言到 `packages/shared/src/utils/context-window.test.ts`（在 "支持 1M 的 Agent 模型" 那个 test 的断言列表里追加一行，与既有的 `kimi-api`/`kimi-coding` 断言同构）：

```ts
    expect(resolveAgentSdkModelId('claude-sonnet-5', 'anthropic-oauth')).toBe('claude-sonnet-5[1m]')
```

Run: `cd packages/shared && bun test src/utils/context-window.test.ts`
Expected: PASS

- [ ] **Step 3: `ChannelForm.tsx` — provider 下拉排序 + 聚合平台标注**

修改 [ChannelForm.tsx:77](apps/electron/src/renderer/components/settings/ChannelForm.tsx) 的 `PROVIDER_OPTIONS` 数组，替换成按设计文档第 5 节确认的顺序：

```ts
const PROVIDER_OPTIONS: ProviderType[] = ['anthropic', 'anthropic-compatible', 'anthropic-oauth', 'openai', 'openai-responses', 'openai-codex', 'google', 'deepseek', 'kimi-api', 'kimi-coding', 'zhipu', 'zhipu-coding', 'zhipu-coding-team', 'qwen', 'qwen-anthropic', 'qwen-token-plan', 'minimax', 'ark-coding-plan', 'doubao', 'xiaomi', 'xiaomi-token-plan', 'openrouter', 'nuwa', 'custom']
```

修改 `PROVIDER_LABELS` 里 `openrouter` / `nuwa` 两条（这两条定义在 `packages/shared/src/types/channel.ts:97-98`，不是 ChannelForm 本地）：

```ts
  openrouter: 'OpenRouter（聚合平台）',
  nuwa: 'NUWA（聚合平台）',
```

- [ ] **Step 4: `ChannelForm.tsx` — 新增 `isClaudeOAuthProvider` 派生状态与 `hasRequiredSecret`/`baseUrl` 相关判定**

在 [ChannelForm.tsx:246-255](apps/electron/src/renderer/components/settings/ChannelForm.tsx) 附近，`isCodexProvider` 定义之后加入：

```ts
  const isClaudeOAuthProvider = provider === 'anthropic-oauth'
  // Claude 订阅登录：apiKey state 存的是登录后拿到的凭据 JSON；能解析出有效凭据即视为已登录。
  const claudeOAuthCredentials = isClaudeOAuthProvider ? parseClaudeOAuthCredentials(apiKey) : null
```

修改 `hasRequiredSecret` 的三元链，加入 Claude OAuth 分支：

```ts
  const hasRequiredSecret = isZhipuTeamProvider
    ? Boolean(zhipuTeamSecret.apiKey.trim())
    : isCodexProvider
      ? Boolean(codexCredentials)
      : isClaudeOAuthProvider
        ? Boolean(claudeOAuthCredentials)
        : Boolean(apiKey.trim())
```

文件顶部 import 区，把 `parseCodexCredentials` 那条从 `@luxcoder/shared` 的 import 扩展为同时引入 `parseClaudeOAuthCredentials, serializeClaudeOAuthCredentials, isClaudeOAuthCredentialStale`。

- [ ] **Step 5: `ChannelForm.tsx` — 新增精选模型预设 + `handleClaudeOAuthLogin`**

在 `handleCodexLogin` 定义（[ChannelForm.tsx:446-501](apps/electron/src/renderer/components/settings/ChannelForm.tsx)）之后追加：

```ts
  /** Claude Pro/Max 订阅登录成功后的精选模型预设，与 context-window.ts 的 AGENT_SDK_1M_CONTEXT_RULES.claude 同源 */
  const CLAUDE_OAUTH_MODEL_PRESETS: ChannelModel[] = [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', enabled: true },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: true },
    { id: 'claude-fable-5', name: 'Claude Fable 5', enabled: true },
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', enabled: false },
  ]

  /** 发起 Claude Pro/Max 订阅 OAuth 登录：spawn 真实 claude 二进制走 setup-token，成功后把凭据写入 apiKey */
  const handleClaudeOAuthLogin = async (): Promise<void> => {
    setClaudeOAuthLoggingIn(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.claudeOAuthLogin()
      if (!result.success || !result.credentials) {
        toast.error(result.message ?? 'Claude 登录失败，请重试')
        return
      }
      const credentials = result.credentials
      setApiKey(credentials)
      setModels(CLAUDE_OAUTH_MODEL_PRESETS)

      // 与 handleCodexLogin 同样的理由：OAuth 流程中用户很容易在浏览器授权后
      // 直接关闭表单，来不及点「创建」而丢失凭据。登录成功即明确的保存意图。
      if (isEdit) {
        toast.success('Claude 账号登录成功')
      } else {
        const input: ChannelCreateInput = {
          name: name.trim() || PROVIDER_LABELS['anthropic-oauth'],
          provider,
          baseUrl,
          apiKey: credentials,
          models: CLAUDE_OAUTH_MODEL_PRESETS,
          enabled,
        }
        const saved = await window.electronAPI.createChannel(input)
        if (isAgentEligibleChannel(saved)) {
          await onAgentEligibilityChange?.(saved, true)
        }
        toast.success('Claude 订阅渠道已创建')
        onSaved(saved)
      }
    } catch (error) {
      console.error('[模型配置表单] Claude 登录失败:', error)
      toast.error('Claude 登录失败，请重试')
    } finally {
      setClaudeOAuthLoggingIn(false)
    }
  }
```

在 state 声明区（[ChannelForm.tsx:221](apps/electron/src/renderer/components/settings/ChannelForm.tsx) `codexLoggingIn` 之后）加入：

```ts
  const [claudeOAuthLoggingIn, setClaudeOAuthLoggingIn] = React.useState(false)
```

- [ ] **Step 6: `ChannelForm.tsx` — JSX：baseUrl 输入框隐藏 + 登录按钮渲染 + 过期提醒**

修改 [ChannelForm.tsx:720-729](apps/electron/src/renderer/components/settings/ChannelForm.tsx) 的 baseUrl 输入条件：

```tsx
          {/* ChatGPT (Codex) / Claude Pro/Max 订阅登录的请求地址由官方二进制/SDK 内置管理，无需用户填写 */}
          {!isCodexProvider && !isClaudeOAuthProvider && (
            <SettingsInput
              label={getUrlInputLabel(provider)}
              value={baseUrl}
              onChange={setBaseUrl}
              placeholder={getUrlInputPlaceholder(provider)}
              description={baseUrl.trim() ? `预览：${buildPreviewUrl(baseUrl, provider)}` : undefined}
            />
          )}
```

修改 [ChannelForm.tsx:730-754](apps/electron/src/renderer/components/settings/ChannelForm.tsx) 的标题与测试按钮显隐：

```tsx
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground">
                {isCodexProvider
                  ? 'ChatGPT 登录'
                  : isClaudeOAuthProvider
                    ? 'Claude 账号登录'
                    : isZhipuTeamProvider
                      ? '智谱团队版凭证'
                      : 'API Key'}
              </div>
              {/* codex / Claude 订阅登录无 baseUrl/apiKey，测试连接不适用，隐藏测试按钮 */}
              {!isCodexProvider && !isClaudeOAuthProvider && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !hasRequiredSecret || !baseUrl.trim()}
                  className="h-7 text-xs"
                >
                  {testing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  <span>测试连接</span>
                </Button>
              )}
            </div>
```

在 `isCodexProvider ? (...) : isZhipuTeamProvider ? (...) : (...)` 三元链（[ChannelForm.tsx:755](apps/electron/src/renderer/components/settings/ChannelForm.tsx) 起）插入 Claude OAuth 分支，放在 `isCodexProvider` 分支之后：

```tsx
            {isCodexProvider ? (
              <div className="space-y-2">
                {/* ...既有 Codex 分支不变... */}
              </div>
            ) : isClaudeOAuthProvider ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleClaudeOAuthLogin}
                  disabled={claudeOAuthLoggingIn}
                  className="w-full"
                >
                  {claudeOAuthLoggingIn ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Zap size={14} />
                  )}
                  <span>
                    {claudeOAuthLoggingIn
                      ? '等待浏览器授权…'
                      : hasRequiredSecret
                        ? '重新登录 Claude 账号'
                        : '登录 Claude 账号'}
                  </span>
                </Button>
                {hasRequiredSecret ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 size={12} className="shrink-0" />
                      <span>已登录 Claude Pro/Max 订阅</span>
                    </div>
                    {claudeOAuthCredentials && isClaudeOAuthCredentialStale(claudeOAuthCredentials) && (
                      <div className="text-xs text-amber-600">
                        订阅登录已使用较久，建议重新登录以避免过期中断。
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    使用 Claude Pro/Max/Team/Enterprise 订阅登录，通过官方浏览器授权，无需 API Key。仅支持 Code 模式。
                  </div>
                )}
              </div>
            ) : isZhipuTeamProvider ? (
              /* ...既有分支不变... */
```

> 注：`isCodexProvider` 分支的既有内容原样保留，此处只是标出插入点；实现该 Step 的 subagent 需要用 Edit 工具精确定位插入，不要整段重写导致误删既有 Codex 逻辑。

- [ ] **Step 7: 手动验证（无法自动化，需要真实浏览器登录）**

1. `bun run dev` 启动应用
2. 设置 → 模型配置 → 添加模型配置，确认下拉列表顺序与第 5 节一致，且看到「Claude Pro/Max（订阅登录）」在 Anthropic 兼容格式之后、OpenAI 之前
3. 选中该 provider，确认 Base URL 输入框消失，「测试连接」按钮消失，显示"登录 Claude 账号"按钮
4. 点击登录，确认系统浏览器打开 `claude.ai` 官方授权页；用一个有 Pro/Max/Team/Enterprise 订阅的账号完成授权
5. 确认登录成功后：模型列表自动填充 4 个精选模型（3 个默认启用）、渠道自动创建（新建模式）或 toast 成功（编辑模式）
6. 切到 Code 模式，用这个新渠道发一条真实消息，确认能正常收到回复（验证 `CLAUDE_CODE_OAUTH_TOKEN` 链路整体打通）
7. 切到 Chat 模式，选中同一渠道发消息，确认看到"Chat 模式暂不支持 Claude 订阅登录，请切换到 Code 模式使用。"且没有发起任何请求
8. 用一个**没有**订阅的账号重试步骤 4，确认失败时 toast 显示的诊断信息可读（即便文案不是精确预期的那句，只要不是一坨乱码/undefined 即可）
9. 记录本次真实登录时 `claude setup-token` 的实际 stdout 内容（截图或复制文本），核对 Task 4 里 `TOKEN_PATTERN`/`AUTH_URL_PATTERN` 是否与实际输出匹配；若不匹配，回到 Task 4 调整正则并补充对应测试用例，而不是在这里绕过

- [ ] **Step 8: 提交**

```bash
git add apps/electron/src/renderer/lib/model-logo.ts \
  packages/shared/src/utils/context-window.ts \
  packages/shared/src/utils/context-window.test.ts \
  apps/electron/src/renderer/components/settings/ChannelForm.tsx \
  packages/shared/src/types/channel.ts
git commit -m "feat(electron): add Claude Pro/Max OAuth login UI to ChannelForm"
```

---

## Task 11: 全量回归

**Files:** 无新改动，纯验证

- [ ] **Step 1: 全量 typecheck**

Run: `cd /Users/admin/Workspace/ClaudeCode/LuxAgents && bun run typecheck`
Expected: 全部包 0 错误

- [ ] **Step 2: 全量测试**

Run: `cd /Users/admin/Workspace/ClaudeCode/LuxAgents && bun test`
Expected: 全部 PASS，无 skip 之外的失败

- [ ] **Step 3: 确认没有遗漏的 "Agent 模式" 用户可见文案**

Run: `grep -rn "切换到 Agent 模式\|Agent 模式使用" apps/electron/src/renderer apps/electron/src/main`
Expected: 无匹配（Task 9 Step 6 应该已经清理干净，这里是最终收口确认）

- [ ] **Step 4: 确认设计文档与最终实现一致，更新文档状态**

打开 `docs/superpowers/specs/2026-07-24-claude-subscription-oauth-login-design.md`，把文档头部「状态：已评审（brainstorming）」改成「状态：已实现」，若实现过程中有偏离设计（例如 Task 4 Step 7 手动验证发现 `setup-token` 输出格式与预期不同并做了调整），在文档末尾补一节"实现偏差记录"简述。

```bash
git add docs/superpowers/specs/2026-07-24-claude-subscription-oauth-login-design.md
git commit -m "docs: mark Claude OAuth login spec as implemented"
```
