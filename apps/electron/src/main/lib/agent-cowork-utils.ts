/**
 * agent-cowork 纯函数（无 electron import 链，可独立单测）
 */
import type { AgentMessage } from '@myyoda/shared'

/** 从 AgentMessage[] 提取最终文本（最后一条非空 assistant 消息） */
export function extractFinalText(messages: AgentMessage[] | undefined): string {
  if (!messages) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message) continue
    if (message.role === 'assistant' && message.content.trim()) {
      return message.content
    }
  }
  return ''
}

/** cowork 子会话在 AgentSessionMeta 中的委派角色集合（区别于 collaboration explore/research 等） */
export const COWORK_DELEGATION_ROLES = new Set([
  'expert-cowork',
  'team-leader',
  'team-member',
  'team-summary',
])

export function isCoworkDelegationRole(role: string | undefined): boolean {
  return typeof role === 'string' && COWORK_DELEGATION_ROLES.has(role)
}
