# Claude Pro/Max 订阅登录（Agent 模式）设计

日期：2026-07-24
状态：已评审（brainstorming）
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

Chat 模式选中该渠道发消息：直接返回错误提示，引导切换到 Agent 模式（与 `openai-codex` 现有行为一致）。

## 4. 组件边界

| 单元 | 位置 | 职责 |
|------|------|------|
| `ProviderType: 'anthropic-oauth'` | `packages/shared/src/types/channel.ts` | 新增枚举值 + `PROVIDER_DEFAULT_URLS`/`PROVIDER_LABELS` 条目（baseUrl 留空，同 `openai-codex`） |
| `ClaudeOAuthCredentials` / `serializeClaudeCredentials` / `parseClaudeCredentials` / `isClaudeCredentialStale` | `packages/shared/src/types/channel.ts` | 凭据结构与序列化，对齐 `CodexOAuthCredentials` 一套函数命名 |
| `AGENT_COMPATIBLE_PROVIDERS` | 同上 | 加入 `'anthropic-oauth'`，使其可被 Agent 模式识别为兼容 provider |
| `claude-oauth-service.ts`（新建） | `apps/electron/src/main/lib/` | 封装「spawn 真实二进制 setup-token → 捕获 stdout → 解析 token → 打开浏览器 → 取消支持」，对齐 `codex-oauth-service.ts` 的接口形状（`loginClaudeOAuth(callbacks)`） |
| `resolveSDKCliPath()` 复用 | `agent-orchestrator.ts` | `claude-oauth-service.ts` 复用同一路径解析逻辑定位二进制，避免重复实现 |
| `buildSdkEnv()` 分支 | `agent-orchestrator.ts` | `channel.provider === 'anthropic-oauth'` 时设置 `CLAUDE_CODE_OAUTH_TOKEN`，跳过 `ANTHROPIC_API_KEY` |
| Chat 模式 guard | `chat-service.ts` | 仿 `openai-codex` 现有 guard，新增 `channel.provider === 'anthropic-oauth'` 分支 |
| IPC：`CLAUDE_OAUTH_LOGIN` / `CLAUDE_OAUTH_CANCEL` | `channel.ts` + `ipc.ts` + `preload/index.ts` | 对齐 `CODEX_OAUTH_LOGIN` / `CODEX_OAUTH_CANCEL` |
| `ChannelForm.tsx` UI | `renderer/components/settings/` | 新增下拉项 + 登录按钮 + 过期提醒条，逻辑对齐 `handleCodexLogin` |

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
| Chat 模式选中该渠道发消息 | 直接报错阻止发送，引导切换到 Agent 模式 |
| Agent 模式下 token 已过期（服务端 401） | 复用现有错误映射链路，提示重新登录（不做静默重试） |

## 9. 测试

**shared（纯函数）**
- `serializeClaudeCredentials` / `parseClaudeCredentials`：往返序列化、非法 JSON、缺字段
- `isClaudeCredentialStale`：边界值（334/335/336 天）
- `isAgentCompatibleProvider('anthropic-oauth')` → true

**electron 主进程**
- `claude-oauth-service.ts`：mock child_process，验证 stdout 解析 token 的正则/逻辑、取消流程、二进制缺失分支
- `buildSdkEnv()`：`anthropic-oauth` 渠道 → 断言 `CLAUDE_CODE_OAUTH_TOKEN` 存在且 `ANTHROPIC_API_KEY` 不存在
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
- `apps/electron/src/main/lib/claude-oauth-service.ts`（新建）
- `apps/electron/src/main/lib/claude-oauth-service.test.ts`（新建）
- `apps/electron/src/main/lib/agent-orchestrator.ts`（`buildSdkEnv()` 分支）
- `apps/electron/src/main/lib/chat-service.ts`（guard 分支）
- `apps/electron/src/main/lib/ipc.ts`（新增两个 IPC handler）
- `apps/electron/src/preload/index.ts`（暴露 `claudeOAuthLogin` / `claudeOAuthCancel`）
- `apps/electron/src/renderer/components/settings/ChannelForm.tsx`（下拉排序、标签、登录按钮、过期提醒）
- `packages/shared/package.json` / `apps/electron/package.json` patch +1

## 12. 开放项（已关闭）

- 覆盖范围 → 仅 Agent 模式（用户已确认）
- Provider 建模方式 → 独立 provider，对齐 Codex 先例（有代码先例支撑，未单独征求意见）
- 下拉排序 + 聚合平台标注 → 用户已确认第 5 节顺序
