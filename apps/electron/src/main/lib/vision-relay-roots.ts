import { homedir } from 'node:os'

/**
 * 视觉助手（VisionRelay）授权根：在附加目录基础上，把当前会话的实际工作目录
 * （项目 workingDirectory）也纳入——它是用户明确授权 Agent 读写的工作目录，
 * 用户解读的图片往往就放在这里，或由 Agent 在工作目录内生成。
 *
 * agentCwd 兜底为 homedir()（无 workspace 时），此时不无脑放宽整个主目录，直接返回原列表。
 */
export function appendVisionRelayAllowedRoot(
  baseRoots: string[],
  agentCwd: string | undefined,
  homeDir = homedir(),
): string[] {
  if (!agentCwd || agentCwd === homeDir) return baseRoots
  return baseRoots.includes(agentCwd) ? baseRoots : [...baseRoots, agentCwd]
}
