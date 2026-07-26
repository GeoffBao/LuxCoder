import { describe, expect, test } from 'bun:test'
import { resolvePiThinkingLevel } from './agent-thinking-level'

describe('Pi thinking level resolver', () => {
  test('Given session override When resolving Then uses the per-session level for any provider', () => {
    expect(resolvePiThinkingLevel(
      { agentThinking: { type: 'adaptive' }, agentEffort: 'medium' },
      { thinkingLevel: 'off' },
      'anthropic',
    )).toBe('off')

    expect(resolvePiThinkingLevel(
      { agentThinking: { type: 'adaptive' }, agentEffort: 'medium' },
      { openAIThinkingLevel: 'xhigh' },
      'openai-codex',
    )).toBe('xhigh')
  })

  test('Given thinkingLevel and legacy openAIThinkingLevel When both set Then prefers thinkingLevel', () => {
    expect(resolvePiThinkingLevel(
      {},
      { thinkingLevel: 'low', openAIThinkingLevel: 'high' },
      'anthropic',
    )).toBe('low')
  })

  test.each(['openai', 'openai-responses', 'custom', 'anthropic'] as const)(
    'Given %s GPT-5.6 When session has max override Then uses it',
    (provider) => {
      expect(resolvePiThinkingLevel(
        { agentThinking: { type: 'adaptive' }, agentEffort: 'medium' },
        { thinkingLevel: 'max' },
        provider,
        'gpt-5.6-terra',
      )).toBe('max')
    },
  )

  test('Given a persisted max override When switching to a non GPT-5.6 model Then clamps it to xhigh', () => {
    expect(resolvePiThinkingLevel(
      { agentThinking: { type: 'adaptive' }, agentEffort: 'medium' },
      { thinkingLevel: 'max' },
      'custom',
      'gpt-5.5',
    )).toBe('xhigh')
  })

  test('Given no session override When defaultThinkingLevel is set Then uses app default', () => {
    expect(resolvePiThinkingLevel(
      { defaultThinkingLevel: 'medium', agentEffort: 'high' },
      undefined,
      'anthropic',
    )).toBe('medium')
  })

  test('Given defaultThinkingLevel=max on a non GPT-5.6 model When resolving Then maps it to xhigh', () => {
    expect(resolvePiThinkingLevel(
      { defaultThinkingLevel: 'max', agentEffort: 'high' },
      undefined,
      'custom',
      'gpt-5.5',
    )).toBe('xhigh')
  })

  test('Given no session override When global max effort is selected Then maps it to xhigh', () => {
    expect(resolvePiThinkingLevel(
      { agentThinking: { type: 'adaptive' }, agentEffort: 'max' },
      undefined,
      'openai-responses',
    )).toBe('xhigh')
  })

  test('Given agentThinking disabled and no session override Then returns off', () => {
    expect(resolvePiThinkingLevel(
      { agentThinking: { type: 'disabled' }, agentEffort: 'high' },
      undefined,
      'anthropic',
    )).toBe('off')
  })
})
