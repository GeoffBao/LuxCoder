import { describe, expect, test } from 'bun:test'
import { PROVIDER_DEFAULT_URLS, PROVIDER_LABELS, isAgentCompatibleProvider } from './channel'

describe('Agent 渠道协议兼容性', () => {
  test('Given OpenAI Chat Completions 的自定义地址 When 判断 Claude Agent 兼容性 Then 不加入白名单', () => {
    expect(isAgentCompatibleProvider('custom')).toBe(false)
  })

  test('Given Anthropic Messages 兼容端点 When 判断 Claude Agent 兼容性 Then 可加入白名单', () => {
    expect(isAgentCompatibleProvider('anthropic-compatible')).toBe(true)
  })

  test.each(['openai-responses', 'openai-codex', 'openrouter'] as const)(
    'Given %s When 判断 Claude Agent 兼容性 Then 不加入白名单',
    (provider) => {
      expect(isAgentCompatibleProvider(provider)).toBe(false)
    },
  )
})

describe('anthropic-oauth provider 注册', () => {
  test('Given anthropic-oauth When 查 defaultUrls/labels Then 都有条目', () => {
    expect(PROVIDER_DEFAULT_URLS['anthropic-oauth']).toBe('')
    expect(PROVIDER_LABELS['anthropic-oauth']).toBe('Claude Pro/Max（订阅登录）')
  })

  test('Given anthropic-oauth When 判定 Agent 兼容性 Then true', () => {
    expect(isAgentCompatibleProvider('anthropic-oauth')).toBe(true)
  })
})
