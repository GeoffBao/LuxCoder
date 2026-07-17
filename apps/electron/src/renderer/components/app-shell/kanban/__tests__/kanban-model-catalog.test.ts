import { describe, expect, test } from 'bun:test'
import type { Channel } from '@luxagents/shared'
import {
  buildKanbanModelCatalog,
  resolveKanbanModelName,
  resolveKanbanModelSelection,
} from '../kanban-model-catalog'

function channel(partial: Partial<Channel> & Pick<Channel, 'id' | 'name'>): Channel {
  return {
    provider: 'anthropic',
    baseUrl: 'https://api.example.com',
    apiKey: 'enc',
    models: [],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('buildKanbanModelCatalog', () => {
  test('按启用渠道分组，选项携带 channelId', () => {
    const { groups, modelToConnection } = buildKanbanModelCatalog([
      channel({
        id: 'ch-a',
        name: 'Anthropic',
        models: [
          { id: 'claude-sonnet', name: 'Sonnet', enabled: true },
          { id: 'disabled', name: 'Off', enabled: false },
        ],
      }),
      channel({
        id: 'ch-b',
        name: 'OpenAI',
        provider: 'openai',
        models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true }],
      }),
      channel({ id: 'ch-off', name: 'Disabled', enabled: false, models: [{ id: 'x', name: 'X', enabled: true }] }),
    ])

    expect(groups.map((group) => group.label)).toEqual(['Anthropic', 'OpenAI'])
    expect(groups[0]?.models).toEqual([
      { id: 'claude-sonnet', name: 'Sonnet', channelId: 'ch-a' },
    ])
    expect(modelToConnection.get('claude-sonnet')).toBe('ch-a')
    expect(modelToConnection.get('gpt-4o')).toBe('ch-b')
  })

  test('同 modelId 跨渠道时各自保留，回退 map 后写覆盖', () => {
    const { groups, modelToConnection } = buildKanbanModelCatalog([
      channel({
        id: 'ch-a',
        name: 'A',
        models: [{ id: 'shared', name: 'Shared A', enabled: true }],
      }),
      channel({
        id: 'ch-b',
        name: 'B',
        models: [{ id: 'shared', name: 'Shared B', enabled: true }],
      }),
    ])
    expect(groups.flatMap((group) => group.models.map((model) => model.channelId))).toEqual(['ch-a', 'ch-b'])
    expect(modelToConnection.get('shared')).toBe('ch-b')
  })
})

describe('resolveKanbanModelSelection', () => {
  const groups = [
    {
      provider: 'anthropic',
      label: 'A',
      models: [{ id: 'shared', name: 'Shared A', channelId: 'ch-a' }],
    },
    {
      provider: 'openai',
      label: 'B',
      models: [{ id: 'shared', name: 'Shared B', channelId: 'ch-b' }],
    },
  ]

  test('优先按 channelId 精确匹配', () => {
    expect(resolveKanbanModelSelection(groups, 'shared', 'ch-a')).toEqual({
      modelId: 'shared',
      channelId: 'ch-a',
    })
  })

  test('无 channelId 时回退到第一个同名模型', () => {
    expect(resolveKanbanModelSelection(groups, 'shared')).toEqual({
      modelId: 'shared',
      channelId: 'ch-a',
    })
  })
})

describe('resolveKanbanModelName', () => {
  test('命中显示名，否则回退 id', () => {
    const groups = [{ provider: 'anthropic', label: 'A', models: [{ id: 'm1', name: 'Sonnet', channelId: 'c1' }] }]
    expect(resolveKanbanModelName(groups, 'm1')).toBe('Sonnet')
    expect(resolveKanbanModelName(groups, 'unknown')).toBe('unknown')
  })
})
