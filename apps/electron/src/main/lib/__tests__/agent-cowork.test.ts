import { describe, expect, test } from 'bun:test'
import { extractFinalText } from '../agent-cowork-utils'
import type { AgentMessage } from '@myyoda/shared'

function message(role: AgentMessage['role'], content: string, createdAt = 1): AgentMessage {
  return { id: `${role}-${createdAt}`, role, content, createdAt }
}

describe('extractFinalText', () => {
  test('取最后一条非空 assistant 消息', () => {
    const messages = [
      message('user', '你好'),
      message('assistant', '第一轮回复'),
      message('user', '继续'),
      message('assistant', '最终结果'),
    ]
    expect(extractFinalText(messages)).toBe('最终结果')
  })

  test('跳过尾部空 assistant 消息', () => {
    const messages = [
      message('user', '你好'),
      message('assistant', '结果'),
      message('assistant', ''),
    ]
    expect(extractFinalText(messages)).toBe('结果')
  })

  test('无 assistant 消息返回空串', () => {
    expect(extractFinalText([message('user', '只有用户')])).toBe('')
    expect(extractFinalText(undefined)).toBe('')
    expect(extractFinalText([])).toBe('')
  })

  test('tool/status 消息不影响提取', () => {
    const messages = [
      message('user', '目标'),
      message('tool', '工具调用'),
      message('assistant', '基于工具结果'),
      message('status', '状态'),
    ]
    expect(extractFinalText(messages)).toBe('基于工具结果')
  })
})
