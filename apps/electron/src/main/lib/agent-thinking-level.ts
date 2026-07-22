import type { AgentSessionMeta, AgentThinkingLevel, ProviderType } from '@luxcoder/shared'
import {
  DEFAULT_AGENT_THINKING_LEVEL,
  getSessionThinkingLevel,
  isAgentThinkingLevel,
} from '@luxcoder/shared'
import type { AppSettings } from '../../types'

type ThinkingSettings = Pick<AppSettings, 'agentThinking' | 'agentEffort' | 'defaultThinkingLevel'>
type ThinkingSessionMeta = Pick<AgentSessionMeta, 'thinkingLevel' | 'openAIThinkingLevel'>

/**
 * 解析 Pi 会话本轮思考深度。
 *
 * 优先级（对齐 craft：session sticky > app default > 遗留全局 effort）：
 * 1. 会话 thinkingLevel / openAIThinkingLevel
 * 2. settings.defaultThinkingLevel
 * 3. agentThinking=disabled → off
 * 4. agentEffort（max → xhigh）
 * 5. DEFAULT_AGENT_THINKING_LEVEL
 */
export function resolvePiThinkingLevel(
  settings: ThinkingSettings,
  sessionMeta: ThinkingSessionMeta | undefined,
  _provider?: ProviderType,
): AgentThinkingLevel {
  const sessionLevel = getSessionThinkingLevel(sessionMeta)
  if (sessionLevel) return sessionLevel

  if (isAgentThinkingLevel(settings.defaultThinkingLevel)) {
    return settings.defaultThinkingLevel
  }

  if (settings.agentThinking?.type === 'disabled') return 'off'
  if (settings.agentEffort === 'max') return 'xhigh'
  if (settings.agentEffort === 'low' || settings.agentEffort === 'medium' || settings.agentEffort === 'high') {
    return settings.agentEffort
  }

  return DEFAULT_AGENT_THINKING_LEVEL
}
