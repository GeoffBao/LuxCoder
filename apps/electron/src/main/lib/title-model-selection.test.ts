import { describe, expect, test } from 'bun:test'
import { resolveTitleChannel, resolveTitleModel } from './title-model-selection'

describe('title model selection', () => {
  test('默认跟随会话渠道，指定供应商时选择该供应商的已启用渠道', () => {
    const channels = [
      { id: 'kimi', provider: 'kimi-api', enabled: true },
      { id: 'codex', provider: 'openai-codex', enabled: true },
    ] as never[]

    expect(resolveTitleChannel(channels, 'codex', 'session')?.id).toBe('codex')
    expect(resolveTitleChannel(channels, 'codex', 'kimi-api')?.id).toBe('kimi')
  })
  test('Codex 优先选择同一渠道中已启用的轻量模型', () => {
    expect(resolveTitleModel({
      provider: 'openai-codex',
      defaultModelId: 'gpt-5.6-luna',
      models: [
        { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', enabled: true },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', enabled: true },
      ],
    })).toBe('gpt-5.4-mini')
  })

  test('没有可识别轻量模型时保留当前默认模型', () => {
    expect(resolveTitleModel({
      provider: 'kimi-api',
      defaultModelId: 'kimi-k2.6',
      models: [{ id: 'kimi-k2.6', name: 'Kimi K2.6', enabled: true }],
    })).toBe('kimi-k2.6')
  })

  test('不选择被禁用的轻量模型', () => {
    expect(resolveTitleModel({
      provider: 'openai-codex',
      defaultModelId: 'gpt-5.6-luna',
      models: [
        { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', enabled: true },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', enabled: false },
      ],
    })).toBe('gpt-5.6-luna')
  })
})
