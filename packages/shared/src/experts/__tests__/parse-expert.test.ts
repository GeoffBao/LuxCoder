import { describe, expect, test } from 'bun:test'
import { parseExpertJson, BUILTIN_EXPERT_DEFINITIONS, BUILTIN_EXPERT_TEAM_DEFINITIONS } from '../index'

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
    expect(manifest.kind).toBe('expert')
  })

  test('解析 team 专家包并读取 roleLabels', () => {
    const manifest = parseExpertJson(JSON.stringify({
      id: 'dev-team',
      label: '软件研发全流程团',
      kind: 'team',
      roleLabels: ['需求分析', '架构设计'],
      skillSlugs: [],
      mcpIds: [],
      channelBindings: [],
    }))
    expect(manifest.kind).toBe('team')
    expect(manifest.roleLabels).toEqual(['需求分析', '架构设计'])
  })

  test('非法 JSON 抛错', () => {
    expect(() => parseExpertJson('{')).toThrow()
  })

  test('内置专家目录含 5 个 slug', () => {
    expect(BUILTIN_EXPERT_DEFINITIONS.map((d) => d.id)).toEqual([
      'general', 'architect', 'qa', 'reviewer', 'delivery-manager',
    ])
  })

  test('内置专家团目录含 2 个 team slug', () => {
    expect(BUILTIN_EXPERT_TEAM_DEFINITIONS.map((d) => d.id)).toEqual(['dev-team', 'quality-team'])
    for (const team of BUILTIN_EXPERT_TEAM_DEFINITIONS) {
      expect(team.kind).toBe('team')
      expect((team.roleLabels ?? []).length).toBeGreaterThan(0)
    }
  })
})
