/**
 * Bash 工具默认超时注入的纯函数模块。
 *
 * 背景：模型发起 Bash 命令时往往不传 timeout，遇到死循环命令（如 awk 读到 EOF 后
 * while 条件永真）会无限空转、SDK 子进程永不返回，导致整个会话永久卡在运行中。
 * 这里在 canUseTool 阶段给「未显式指定 timeout」的 Bash 注入默认超时。
 *
 * 关键：不同 runtime 的 Bash timeout 单位不一致，注入前必须换算——
 *   - Pi runtime：timeout 单位是「秒」（Pi 的 bash 工具 resolveTimeoutMs 按 秒×1000）
 *   - Claude runtime：timeout 单位是「毫秒」（Claude SDK BashInput.timeout）
 *
 * 抽成独立轻量模块的目的：避免把纯函数留在 agent-orchestrator 内，导致 bun test
 * 因 orchestrator 的 electron import 链（shell 等）而报 SyntaxError（见 MEMORY 中
 * vision-relay-roots 的教训）。本模块无任何运行时依赖，可被单测直接覆盖。
 */

/** Bash 默认超时（毫秒）：120s，覆盖绝大多数正常命令（git status/编译/测试）。 */
export const BASH_DEFAULT_TIMEOUT_MS = 120_000

/** Agent runtime 判别：Pi 与 Claude 的单位不同。 */
export type AgentRuntimeKind = 'pi' | 'claude'

/**
 * 判断 Bash 入参是否已显式指定有效 timeout。
 * 模型自带 timeout（有限正数）时尊重原值，不覆盖。
 */
export function hasExplicitBashTimeout(input: Record<string, unknown>): boolean {
  const raw = input.timeout
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
}

/**
 * 计算注入给 Bash 工具的 timeout 值（按 runtime 换算单位）。
 * - pi：返回秒（BASH_DEFAULT_TIMEOUT_MS / 1000）
 * - claude：返回毫秒（BASH_DEFAULT_TIMEOUT_MS）
 */
export function resolveBashDefaultTimeout(agentRuntime: AgentRuntimeKind): number {
  return agentRuntime === 'pi' ? Math.round(BASH_DEFAULT_TIMEOUT_MS / 1000) : BASH_DEFAULT_TIMEOUT_MS
}

/**
 * 在 Bash 工具入参上注入默认 timeout（若未显式指定）。
 * 返回新的入参对象；已显式指定 timeout 时原样返回。
 */
export function injectBashDefaultTimeout(
  input: Record<string, unknown>,
  agentRuntime: AgentRuntimeKind,
): Record<string, unknown> {
  if (hasExplicitBashTimeout(input)) return input
  return { ...input, timeout: resolveBashDefaultTimeout(agentRuntime) }
}
