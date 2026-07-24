# Claude Pro/Max 订阅登录（Agent 模式）设计

日期：2026-07-24
状态：已实现（代码完成，待人工浏览器登录验证——见实施计划 Task 10 Step 7）
范围：仅 Code/Agent 模式；不改动 Chat 模式的 Anthropic 请求路径

## 1. 问题

LuxCoder 的 Anthropic 渠道目前只支持 API Key 认证，用户无法像 craft-agents-oss 那样直接用 Claude Pro/Max/Team/Enterprise 订阅账号登录、按订阅额度使用 Agent（Code）模式，只能去 Console 开 API Key 按量付费。

## 2. 决策摘要（已锁定）

| 决策点 | 定案 |
|--------|------|
| 覆盖范围 | 仅 Code/Agent 模式；Chat 模式选中该渠道时明确拒绝并引导切换 |
| 登录机制 | spawn 已打包的**真实官方 `claude` 二进制**执行 `setup-token`，不复用 Pi SDK 的第三方 OAuth 重新实现 |
| 计费/合规 | 请求全程由官方二进制发出，与用户本机直接跑 `claude` 无差异，不存在被判定为「第三方 extra usage」的风险 |
| Provider 建模 | 新增独立 `ProviderType`：`'anthropic-oauth'`，与现有 `openai-codex` 平级，不改动 `anthropic` provider 本身 |
| 凭据结构 | `ClaudeOAuthCredentials { token, obtainedAt, accountId? }`，无 refresh token（`setup-token` 不支持刷新，过期需重新登录） |
| 模型列表 | 登录成功后静态填充精选 Claude 模型预设（不走 `/v1/models` 动态拉取） |

## 3. 目标行为

```
用户在「模型配置」新建渠道 → 选择「Claude Pro/Max（订阅登录）」
  → 点击「登录 Claude 账号」
  → 主进程 spawn <bundled claude binary> setup-token
  → 该命令自行打开系统浏览器 → claude.ai 官方授权页
  → 用户批准 → 命令进程 stdout 打印长效 token 并退出
  → 主进程捕获 token → 加密存入 Channel.apiKey（JSON 序列化）
  → 渲染层自动填充精选模型列表（全部启用）→ 创建模式自动落库
  → Agent/Code 模式选中该渠道发消息
    → buildSdkEnv() 设置 CLAUDE_CODE_OAUTH_TOKEN（不设置 ANTHROPIC_API_KEY）
    → agentRuntime 固定为 'claude'（真实二进制路径）
    → 真实 claude 二进制自行完成鉴权与请求，按订阅额度计费
```

Chat 模式选中该渠道发消息：直接返回错误提示，引导切换到 **Code 模式**（UI 顶栏用户可见名称；与 `openai-codex` 现有行为一致，且顺带修正该现有文案同样的用词问题——现网写的是"Agent 模式"，用户在界面上看到的入口名叫「Code」，不是「Agent」）。

## 4. 组件边界

| 单元 | 位置 | 职责 |
|------|------|------|
| `ProviderType: 'anthropic-oauth'` | `packages/shared/src/types/channel.ts` | 新增枚举值 + `PROVIDER_DEFAULT_URLS`/`PROVIDER_LABELS` 条目（baseUrl 留空，同 `openai-codex`） |
| `ClaudeOAuthCredentials` / `serializeClaudeCredentials` / `parseClaudeCredentials` / `isClaudeCredentialStale` | `packages/shared/src/types/channel.ts` | 凭据结构与序列化，对齐 `CodexOAuthCredentials` 一套函数命名 |
| `AGENT_COMPATIBLE_PROVIDERS` | 同上 | 加入 `'anthropic-oauth'`，使其可被 Agent 模式识别为兼容 provider |
| `claude-oauth-service.ts`（新建） | `apps/electron/src/main/lib/` | 封装「spawn 真实二进制 setup-token → 捕获 stdout → 解析 token → 打开浏览器 → 取消支持」，对齐 `codex-oauth-service.ts` 的接口形状（`loginClaudeOAuth(callbacks)`） |
| `resolveSDKCliPath()` 复用 | `agent-orchestrator.ts` | `claude-oauth-service.ts` 复用同一路径解析逻辑定位二进制，避免重复实现 |
| `buildSdkEnv()` 分支（经 `applyAgentSdkAuthEnv`） | `apps/electron/src/main/lib/agent-sdk-auth-env.ts` | `provider === 'anthropic-oauth'` 时设置 `target.CLAUDE_CODE_OAUTH_TOKEN = apiKey`，不设置 `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` |
| `resolveChannelRuntimeApiKey()` 分支 | `channel-manager.ts` | 新增 `resolveClaudeOAuthAccessToken(channelId)`，对齐 `resolveCodexAccessToken` 的位置，从加密的 `apiKey` 字段解析出 `ClaudeOAuthCredentials.token` |
| **`normalizeAgentRuntime()` 例外分支（关键，见第 4.1 节）** | `agent-orchestrator.ts:106` | `provider === 'anthropic-oauth'` 时强制返回 `'claude'`，绕过全局 `CLAUDE_RUNTIME_ENABLED` 开关 |
| Chat 模式 guard | `chat-service.ts` | 仿 `openai-codex` 现有 guard，新增 `channel.provider === 'anthropic-oauth'` 分支 |
| IPC：`CLAUDE_OAUTH_LOGIN` / `CLAUDE_OAUTH_CANCEL` | `channel.ts` + `ipc.ts` + `preload/index.ts` | 对齐 `CODEX_OAUTH_LOGIN` / `CODEX_OAUTH_CANCEL` |
| `ChannelForm.tsx` UI | `renderer/components/settings/` | 新增下拉项 + 登录按钮 + 过期提醒条，逻辑对齐 `handleCodexLogin` |

### 4.1 `CLAUDE_RUNTIME_ENABLED` 例外（写计划前发现，已与用户确认）

`packages/shared/src/types/agent-provider.ts:21` 当前是 `export const CLAUDE_RUNTIME_ENABLED = false`——这是此前为避免在对话框里暴露"Claude SDK / Pi"双内核选择、让普通用户困惑而特意关闭的（用户已确认此前动机）。这个开关不只影响前端 UI，`agent-orchestrator.ts:106` 的 `normalizeAgentRuntime()` 在后端**硬编码强制**：只要开关是 false，不管调用方传什么 runtime，一律返回 `'pi'`，包括历史会话。

若不处理，`anthropic-oauth` 渠道的会话会被摁回 Pi runtime 执行——Pi 不理解 `CLAUDE_CODE_OAUTH_TOKEN`，也不会 spawn 真实 claude 二进制，功能直接失效。

**修复**：`normalizeAgentRuntime()` 增加 `provider` 参数，仅为 `anthropic-oauth` 开例外，不改动全局开关、不影响其它任何渠道：

```ts
function normalizeAgentRuntime(value: unknown, provider?: ProviderType): AgentRuntime {
  if (provider === 'anthropic-oauth') return 'claude'
  if (!CLAUDE_RUNTIME_ENABLED) return 'pi'
  return value === 'pi' ? 'pi' : 'claude'
}
```

调用处（`agent-orchestrator.ts:1000-1001`）在 `channel` 已解析的作用域内，补上 `channel.provider` 实参即可。

**回归确认**：`openai-codex` 不在 `AGENT_COMPATIBLE_PROVIDERS` 里、也不会命中新分支，改动前后都解析为 `'pi'`（因为 Codex 本来就是靠 Pi runtime 跑的），Codex 订阅登录行为不受影响。

## 5. Provider 下拉排序与文案调整

响应用户反馈：把主流大模型厂商前置，聚合平台后置并加注释。新的 `PROVIDER_OPTIONS` 顺序：

```
anthropic
anthropic-compatible
anthropic-oauth          ← 新增
openai
openai-responses
openai-codex
google
deepseek
kimi-api
kimi-coding
zhipu / zhipu-coding / zhipu-coding-team
qwen / qwen-anthropic / qwen-token-plan
minimax
ark-coding-plan
doubao
xiaomi / xiaomi-token-plan
openrouter                ← 标签改为 "OpenRouter（聚合平台）"
nuwa                       ← 标签改为 "NUWA（聚合平台）"
custom
```

`PROVIDER_LABELS['anthropic-oauth']` = `'Claude Pro/Max（订阅登录）'`。

## 6. 登录 UI 交互

选中「Claude Pro/Max（订阅登录）」后，API Key 输入框整体替换为「登录 Claude 账号」按钮，行为对齐 `handleCodexLogin`（[ChannelForm.tsx:446](../../../apps/electron/src/renderer/components/settings/ChannelForm.tsx)）：

1. 点击 → 按钮进入 loading 态，调用 `window.electronAPI.claudeOAuthLogin()`
2. 主进程打开系统浏览器；渲染层可选展示"请在浏览器完成登录"提示
3. 成功 → 凭据 JSON 写入 `apiKey` state → 静态填充精选模型列表（全部启用）→ 创建模式自动落库并 toast；编辑模式仅 toast
4. 失败/取消 → toast 错误信息，按钮恢复可点击

**过期提醒**：`obtainedAt` 距今 ≥ 335 天（近似 1 年减 30 天缓冲）时，渠道详情/列表位置显示提示条："订阅登录即将过期，建议重新登录"，点击后复用同一登录按钮重新走一遍流程（覆盖旧凭据）。不做自动刷新（无 refresh token）。

## 7. 精选模型预设

登录成功后，模型列表直接使用固定预设（不发起 `/v1/models` 请求，因为 OAuth token 在该端点的鉴权行为未经验证，静态列表更稳定、体验更快）：

```
claude-opus-4-8      Claude Opus 4.8
claude-sonnet-5       Claude Sonnet 5
claude-fable-5        Claude Fable 5
claude-opus-4-7       Claude Opus 4.7（enabled: false，供选用）
```

与 `context-window.ts` 的 `AGENT_SDK_1M_CONTEXT_RULES.claude` 保持同源，避免两处模型名单漂移。

## 8. 错误处理

| 情况 | 行为 |
|------|------|
| 二进制路径解析失败/文件不存在 | 提示"未找到 Claude 运行时，请重装应用" |
| 用户账号无有效 Pro/Max/Team/Enterprise 订阅 | `setup-token` 授权后报错，原样透传（"此账号没有可用的 Claude 订阅"） |
| 用户中途取消/关闭浏览器 | 新增 `CLAUDE_OAUTH_CANCEL`，同一时刻仅允许一个登录流程（对齐 Codex 的 `activeLoginAbort`） |
| spawn 进程异常退出（非 0）且无 token | toast 通用失败提示 + 控制台记录 stderr |
| Chat 模式选中该渠道发消息 | 直接报错阻止发送，文案："Chat 模式暂不支持 Claude 订阅登录，请切换到 Code 模式使用。"（同时把 `openai-codex` 现有的同类文案从"请切换到 Agent 模式使用"改成"请切换到 Code 模式使用"，统一用词） |
| Agent 模式下 token 已过期（服务端 401） | 复用现有错误映射链路，提示重新登录（不做静默重试） |

## 9. 测试

**shared（纯函数）**
- `serializeClaudeCredentials` / `parseClaudeCredentials`：往返序列化、非法 JSON、缺字段
- `isClaudeCredentialStale`：边界值（334/335/336 天）
- `isAgentCompatibleProvider('anthropic-oauth')` → true

**electron 主进程**
- `claude-oauth-service.ts`：mock child_process，验证 stdout 解析 token 的正则/逻辑、取消流程、二进制缺失分支
- `agent-sdk-auth-env.ts` 的 `applyAgentSdkAuthEnv()`：`anthropic-oauth` 渠道 → 断言 `CLAUDE_CODE_OAUTH_TOKEN` 存在且 `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` 不存在
- `channel-manager.ts` 的 `resolveClaudeOAuthAccessToken()` / `resolveChannelRuntimeApiKey()`：正确从凭据 JSON 中取出 token
- `agent-orchestrator.ts` 的 `normalizeAgentRuntime()`：`provider === 'anthropic-oauth'` → 恒为 `'claude'`（`CLAUDE_RUNTIME_ENABLED` 为 true/false 均需覆盖）；`provider === 'openai-codex'` 或未传 provider → 行为与改动前一致（回归用例）
- `chat-service.ts`：选中 `anthropic-oauth` 渠道发消息 → 断言返回引导错误，不发起请求

**手动验证（需要真实浏览器登录，无法自动化）**
- 完整登录一次，确认 token 落库、模型自动填充、Agent 模式能正常发起真实请求
- 验证 Chat 模式选中该渠道时的报错文案

## 10. 风险

| 风险 | 缓解 |
|------|------|
| `setup-token` 实际 stdout 格式/交互方式与预期不符（未做过全流程实测，只验证过 `--help`） | 实现阶段先跑一次真实登录，确认输出格式后再定最终解析逻辑；若格式不稳定，保留"手动粘贴 token"兜底输入框 |
| 官方二进制版本升级后 `setup-token` 行为变化 | 与现有 SDK 升级检查清单（CLAUDE.md「SDK 版本升级注意事项」）合并复查 |
| 用户在无网络/浏览器环境下无法完成本地回调 | 沿用官方 CLI 自身的兜底交互（终端粘贴 code），LuxCoder 侧对此不做特殊处理，失败即提示重试 |
| 静态模型预设与官方模型上线节奏脱节 | 与 `context-window.ts` 同源维护，后续新模型上线时同一处更新即可 |

## 11. 预估触点文件

- `packages/shared/src/types/channel.ts`（新增 provider 枚举、凭据结构、常量）
- `packages/shared/src/types/channel.test.ts`（若无则新建，覆盖凭据序列化/过期判断）
- `packages/shared/src/types/agent-provider.test.ts`（若无则新建，或就近放在 orchestrator 测试里）
- `apps/electron/src/main/lib/claude-oauth-service.ts`（新建）
- `apps/electron/src/main/lib/claude-oauth-service.test.ts`（新建）
- `apps/electron/src/main/lib/agent-sdk-auth-env.ts`（`applyAgentSdkAuthEnv()` 新分支）
- `apps/electron/src/main/lib/channel-manager.ts`（新增 `resolveClaudeOAuthAccessToken`，`resolveChannelRuntimeApiKey` 加分支）
- `apps/electron/src/main/lib/agent-orchestrator.ts`（`normalizeAgentRuntime()` 加 `provider` 参数与例外分支，调用处传入 `channel.provider`）
- `apps/electron/src/main/lib/chat-service.ts`（guard 分支 + 修正 Codex 现有文案用词）
- `apps/electron/src/main/lib/ipc.ts`（新增两个 IPC handler）
- `apps/electron/src/preload/index.ts`（暴露 `claudeOAuthLogin` / `claudeOAuthCancel`）
- `apps/electron/src/renderer/components/settings/ChannelForm.tsx`（下拉排序、标签、登录按钮、过期提醒）
- `apps/electron/src/renderer/lib/model-logo.ts`（`PROVIDER_LOGO_MAP` 补 `anthropic-oauth` 条目，否则 `Record<ProviderType, string>` 编译报错）
- `packages/shared/src/utils/context-window.ts`（`AGENT_SDK_1M_CONTEXT_PROVIDER_RULES` 补 `anthropic-oauth` 复用 `.claude` 规则，否则该渠道拿不到 1M 上下文的 SDK `[1m]` 后缀）

不改动任何包的 `version` 字段（CLAUDE.md：日常功能 PR 不 bump version，等显式 release 时统一处理）。

## 12. 开放项（已关闭）

- 覆盖范围 → 仅 Agent 模式（用户已确认）
- Provider 建模方式 → 独立 provider，对齐 Codex 先例（有代码先例支撑，未单独征求意见）
- 下拉排序 + 聚合平台标注 → 用户已确认第 5 节顺序

## 13. 实现偏差记录

- **`normalizeAgentRuntime` 落点**：设计文档第 4.1 节原描述例外分支加在 `agent-orchestrator.ts` 内；实施阶段发现该文件依赖十几个 Electron 相关服务模块，为测试这一个纯函数需要拆到零依赖的新文件 `agent-runtime-normalize.ts`（对齐 Task 3 抽取 `resolveClaudeAgentBinaryPath` 的同一思路）。行为完全一致，只是物理位置变了。
- **`CLAUDE_CODE_OAUTH_TOKEN` 未纳入既有 env 清理列表**：实施 Task 6 时代码质量评审发现，`agent-orchestrator.ts` 里两处清理"上一次会话遗留的 Anthropic 认证变量"的位置（`buildSdkEnv()` 的 `cleanEnv` 过滤、以及 `process.env` 同步前的显式 `delete` 列表）都没有把新引入的 `CLAUDE_CODE_OAUTH_TOKEN` 算进去，会导致切换渠道后订阅 token 残留在进程环境变量里。设计文档未预见这一点，已在实现时一并修复（两处都补上 `CLAUDE_CODE_OAUTH_TOKEN` 的清理）。
- **`claude-oauth-service.ts` 的 URL 完整性正则**：Task 4 的参考实现最初给的 `AUTH_URL_PATTERN` 用 `(?=\s|$)` 判断"URL 后面是空白或字符串结尾才算完整"，实施时发现 `$` 在增量拼接 stdout 场景下会在"当前 buffer 恰好在截断点结束"时被误判为"字符串真的结束了"，等于完全没做防护。改为只接受 `(?=\s)`，接受的取舍：如果 CLI 进程退出前打印的最后一段 stdout 恰好就是 URL 本身、后面没有任何空白，`onAuthUrl` 不会触发——可接受，因为二进制自身会打开浏览器，这条路径只是兜底。
- **`bun test` 全量套件运行时的已知不稳定**：`Task 11 Step 2` 全量测试预期"全部 PASS"，但实测下全量跑（102 个文件一起跑）会有约 14 个测试因为 `mock.module('electron', ...)` 在多个测试文件间的模块缓存互相污染而报 `SyntaxError: Export named 'X' not found` 之类的错误。逐个隔离运行涉及的每一个文件（`chat-service.test.ts`、`claude-oauth-service.test.ts`、`channel-runtime-api-key.test.ts`、`agent-session-manager.test.ts` 等）均 100% 通过。这是这个代码库在本次改动之前就存在的 `bun test` 测试隔离架构问题（vanilla worktree、未改动任何代码时跑全量套件也有 3 fail + 1 error 的同类基线），不是本次功能引入的回归，但也没有在本次范围内修复（需要重新设计测试隔离方式，工作量超出本次功能范畴）。
- `CLAUDE_RUNTIME_ENABLED` 全局关闭导致的 runtime 强制回落问题 → 已定案，`normalizeAgentRuntime()` 按 provider 开例外，不动全局开关，Codex 不受影响（用户已确认）
