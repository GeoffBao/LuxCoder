import { describe, expect, test } from 'bun:test'
import {
  normalizeReasoningLevel,
  resolveReasoningCapability,
  resolveReasoningProfile,
} from './reasoning-profile'

describe('reasoning profiles', () => {
  test('keeps transport-specific profiles isolated', () => {
    expect(resolveReasoningProfile({ modelId: 'gpt-5.6-luna', transport: 'openai-responses' })?.id).toBe('openai-reasoning-max')
    expect(resolveReasoningProfile({ modelId: 'gpt-5.6-luna', transport: 'anthropic-messages' })).toBeUndefined()
    expect(resolveReasoningProfile({ modelId: 'gpt-5.6-chat-latest', transport: 'openai-responses' })).toBeUndefined()
  })

  test('normalizes model-specific levels without losing off', () => {
    const profile = resolveReasoningProfile({ modelId: 'kimi-k3', transport: 'openai-completions' })
    expect(profile?.id).toBe('kimi-k3')
    expect(normalizeReasoningLevel(profile, 'medium')).toBe('high')
    expect(normalizeReasoningLevel(profile, 'off')).toBe('off')
  })

  test('prefers an explicit profile over catalog capability', () => {
    const profile = resolveReasoningProfile({ modelId: 'glm-5.2', transport: 'openai-completions' })
    const capability = resolveReasoningCapability({
      profile,
      catalog: { reasoning: true, thinkingLevelMap: { off: 'none', low: 'low' } },
    })
    expect(capability?.source).toBe('profile')
    expect(capability?.levels).toContain('max')
  })
})
