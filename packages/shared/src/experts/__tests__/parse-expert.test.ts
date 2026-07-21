import { describe, expect, test } from 'bun:test'
import { parseExpertJson, BUILTIN_EXPERT_DEFINITIONS } from '../index'

describe('parseExpertJson', () => {
  test('解析合法 expert.json', () => {
    const manifest = parseExpertJson(JSON.stringify({
      id: 'architect',
      label: '软件架构师',
      skillSlugs: ['brainstorming'],
      mcpIds: [],
      channelBindings: [],
    }))
    expect(manifest.id).toBe('architect')
    expect(manifest.skillSlugs).toEqual(['brainstorming'])
    expect(manifest.channelBindings).toEqual([])
  })

  test('非法 JSON 抛错', () => {
    expect(() => parseExpertJson('{')).toThrow()
  })

  test('内置目录含 10 个 slug', () => {
    expect(BUILTIN_EXPERT_DEFINITIONS.map((d) => d.id)).toEqual([
      'general', 'driver', 'application', 'system', 'communication',
      'delivery-manager', 'se', 'architect', 'qa', 'reviewer',
    ])
  })
})
