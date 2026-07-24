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
