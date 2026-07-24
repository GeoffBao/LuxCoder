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
