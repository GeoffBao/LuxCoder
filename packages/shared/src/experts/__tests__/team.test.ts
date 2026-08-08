import { describe, expect, test } from 'bun:test'
import {
  parseTeamJson,
  validateTeamSquad,
  buildTeamLeaderProtocol,
  buildTeamRoster,
  buildTeamBriefing,
  type TeamSquad,
} from '../index'

const validSquad: TeamSquad = {
  id: 'dev-team',
  label: '软件研发全流程团',
  kind: 'team',
  leaderExpertId: 'delivery-manager',
  instructions: '按四阶段协作交付',
  members: [
    { expertId: 'architect', role: '架构设计' },
    { expertId: 'general', role: '编码实现' },
    { expertId: 'qa', role: '测试验收' },
  ],
}

describe('parseTeamJson', () => {
  test('解析合法 team.json', () => {
    const squad = parseTeamJson(JSON.stringify(validSquad))
    expect(squad.id).toBe('dev-team')
    expect(squad.kind).toBe('team')
    expect(squad.leaderExpertId).toBe('delivery-manager')
    expect(squad.members).toHaveLength(3)
    expect(squad.members[0]).toEqual({ expertId: 'architect', role: '架构设计' })
  })

  test('可选字段：description/avatar/instructions/skillSlugs/singleAgent', () => {
    const squad = parseTeamJson(JSON.stringify({
      ...validSquad,
      description: '全流程研发',
      avatar: { icon: 'Users', accent: 'primary' },
      skillSlugs: ['brainstorming'],
      singleAgent: true,
    }))
    expect(squad.description).toBe('全流程研发')
    expect(squad.avatar).toEqual({ icon: 'Users', accent: 'primary' })
    expect(squad.skillSlugs).toEqual(['brainstorming'])
    expect(squad.singleAgent).toBe(true)
  })

  test('非法 JSON 抛错', () => {
    expect(() => parseTeamJson('{')).toThrow('JSON 解析失败')
  })

  test('缺 leaderExpertId 抛错', () => {
    expect(() => parseTeamJson(JSON.stringify({ id: 't', label: 'T' }))).toThrow('leaderExpertId')
  })

  test('团长兼任成员抛错', () => {
    const raw = JSON.stringify({
      ...validSquad,
      members: [{ expertId: 'delivery-manager', role: '自己' }],
    })
    expect(() => parseTeamJson(raw)).toThrow('团长不能同时是团队成员')
  })

  test('成员中非法条目被过滤，role 缺省为空', () => {
    const squad = parseTeamJson(JSON.stringify({
      ...validSquad,
      members: [{ expertId: 'architect' }, { expertId: 42 }, {}],
    }))
    expect(squad.members).toEqual([{ expertId: 'architect' }])
  })
})

describe('validateTeamSquad', () => {
  const allExperts: Record<string, 'expert' | 'team' | null> = {
    'delivery-manager': 'expert',
    architect: 'expert',
    general: 'expert',
    qa: 'expert',
    'dev-team': 'team',
  }
  const resolveKind = (id: string) => allExperts[id] ?? null

  test('团长与成员都解析为专家时通过', () => {
    expect(validateTeamSquad(validSquad, resolveKind)).toEqual([])
  })

  test('团长不存在时报错', () => {
    const squad = { ...validSquad, leaderExpertId: 'ghost' }
    const issues = validateTeamSquad(squad, resolveKind)
    expect(issues.some((i) => i.path === 'leaderExpertId' && i.message.includes('不存在'))).toBe(true)
  })

  test('团长指向另一个团队时报错（拦截嵌套团队）', () => {
    const squad = { ...validSquad, leaderExpertId: 'dev-team' }
    const issues = validateTeamSquad(squad, resolveKind)
    expect(issues.some((i) => i.path === 'leaderExpertId' && i.message.includes('不能是另一个专家团'))).toBe(true)
  })

  test('成员指向团队时报错（拦截团队嵌套团队）', () => {
    const squad = {
      ...validSquad,
      members: [{ expertId: 'dev-team', role: '嵌套' }],
    }
    const issues = validateTeamSquad(squad, resolveKind)
    expect(issues.some((i) => i.path === 'members' && i.message.includes('不能嵌套专家团'))).toBe(true)
  })

  test('成员重复时报错', () => {
    const squad = {
      ...validSquad,
      members: [
        { expertId: 'architect', role: '架构' },
        { expertId: 'architect', role: '架构2' },
      ],
    }
    const issues = validateTeamSquad(squad, resolveKind)
    expect(issues.some((i) => i.path === 'members' && i.message.includes('重复'))).toBe(true)
  })
})

describe('team-protocol', () => {
  test('团长协议包含核心职责（协调不是亲自实现）', () => {
    const protocol = buildTeamLeaderProtocol()
    expect(protocol).toContain('团长')
    expect(protocol).toContain('拆解委派')
    expect(protocol).toContain('task.yaml')
    expect(protocol).toContain('depends_on')
  })

  test('名册包含团长 self-row 与成员 label/role/skills', () => {
    const roster = buildTeamRoster(validSquad, (id) => {
      const labels: Record<string, string> = {
        'delivery-manager': '软件交付经理',
        architect: '软件架构师',
        general: '通用软件专家',
        qa: '软件测试',
      }
      return labels[id] ? { label: labels[id]!, skills: [id] } : null
    })
    expect(roster).toContain('团长: 软件交付经理（你）')
    expect(roster).toContain('软件架构师 ［架构设计］')
    expect(roster).toContain('可用技能: architect')
  })

  test('成员无法解析时降级为原始 expertId', () => {
    const roster = buildTeamRoster(validSquad, () => null)
    expect(roster).toContain('团长: delivery-manager（你）')
    expect(roster).toContain('成员: architect ［架构设计］')
  })

  test('briefing 组装协议+策略+名册+目标，单人模式名册标注', () => {
    const solo: TeamSquad = { ...validSquad, members: [] }
    const briefing = buildTeamBriefing(solo, () => null, '做一个功能')
    expect(briefing).toContain('团长协调协议')
    expect(briefing).toContain('按四阶段协作交付')
    expect(briefing).toContain('（无，单人模式）')
    expect(briefing).toContain('# 任务目标')
    expect(briefing).toContain('做一个功能')
  })
})
