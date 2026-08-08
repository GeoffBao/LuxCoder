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
 *
 * 两个 runtime 的默认值不对称，是刻意的：
 *   - Claude runtime 的 120s 对齐 Anthropic 官方 CLI Bash 工具本来就有的默认超时
 *     （不传 timeout 时官方 CLI 自身默认 120s），这次注入只是把已有行为显式化，
 *     不是新增限制。
 *   - Pi runtime 的原生 bash 工具在未传 timeout 时是「完全不设超时、无限等待」
 *     （resolveTimeoutMs 对 undefined 直接 return undefined，不 setTimeout），
 *     这正是最初 awk 死循环卡死会话的根因。给 Pi 补默认值属于真正新增的限制，
 *     若定得太紧（如同 Claude 的 120s）会误伤 Android/iOS 之类正常需要几分钟的
 *     编译/测试命令。经与用户确认，Pi 默认值定得更宽松（600s），
 *     真正的死循环兜底交给会话级看门狗（15min 零 SDK 消息），
 *     两者互相独立，不会因为放宽 Bash 超时而失去死循环防护。
 */

/** Claude runtime 默认超时（毫秒）：对齐官方 CLI 本来就有的 120s 默认值。 */
export const BASH_DEFAULT_TIMEOUT_MS = 120_000

/** Pi runtime 默认超时（毫秒）：600s，避免误杀长编译/长测试，死循环由会话级看门狗兜底。 */
export const BASH_DEFAULT_TIMEOUT_MS_PI = 600_000

/** Agent runtime 判别：Pi 与 Claude 的单位不同，默认值也不同。 */
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
 * 计算注入给 Bash 工具的 timeout 值（按 runtime 换算单位，各自使用不同默认值）。
 * - pi：返回秒（BASH_DEFAULT_TIMEOUT_MS_PI / 1000）
 * - claude：返回毫秒（BASH_DEFAULT_TIMEOUT_MS）
 */
export function resolveBashDefaultTimeout(agentRuntime: AgentRuntimeKind): number {
  return agentRuntime === 'pi' ? Math.round(BASH_DEFAULT_TIMEOUT_MS_PI / 1000) : BASH_DEFAULT_TIMEOUT_MS
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
