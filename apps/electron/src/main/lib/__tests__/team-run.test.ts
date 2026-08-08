import { describe, expect, test } from 'bun:test'
import type { TeamSquad } from '@myyoda/shared/experts'
import type { TaskSpec } from '@myyoda/shared/tasks/schema'
import {
  buildTeamExecutionSpec,
  buildLeaderPlanningPrompt,
  buildTeamSummaryPrompt,
  teamAllowedExpertIds,
} from '../team-run'

const team: TeamSquad = {
  id: 'dev-team',
  label: '软件研发全流程团',
  kind: 'team',
  leaderExpertId: 'delivery-manager',
  instructions: '按四阶段协作',
  members: [
    { expertId: 'architect', role: '架构设计' },
    { expertId: 'general', role: '编码实现' },
    { expertId: 'qa', role: '测试验收' },
  ],
}

const baseSpec: TaskSpec = {
  id: 'my-task',
  title: '我的任务',
  goal: '实现一个功能',
  acceptance_criteria: '功能可用',
  runner: 'conduct',
  project: 'proj-1',
  defaults: { teamId: 'dev-team', model: 'deepseek-v4-flash' },
  nodes: [{ id: 'seed', title: '占位', kind: 'session', prompt: '占位' }],
}

function leaderSpec(nodes: TaskSpec['nodes']): TaskSpec {
  return {
    id: 'my-task-plan',
    title: '委派计划',
    goal: '实现一个功能',
    runner: 'conduct',
    nodes,
  }
}

describe('teamAllowedExpertIds', () => {
  test('包含团长与全部成员', () => {
    const ids = teamAllowedExpertIds(team)
    expect(ids.has('delivery-manager')).toBe(true)
    expect(ids.has('architect')).toBe(true)
    expect(ids.has('general')).toBe(true)
    expect(ids.has('qa')).toBe(true)
    expect(ids.size).toBe(4)
  })
})

describe('buildTeamExecutionSpec', () => {
  test('合法展开：成员节点保留 expertId，追加团长汇总节点，清除 teamId', () => {
    const result = buildTeamExecutionSpec({
      team,
      leaderSpec: leaderSpec([
        { id: 'design', title: '设计', kind: 'session' as const, expertId: 'architect', prompt: '出架构' },
        { id: 'impl', title: '实现', kind: 'session' as const, expertId: 'general', prompt: '写代码', depends_on: ['design'] },
      ]),
      baseSpec,
    })
    expect(result.ok).toBe(true)
    const spec = result.spec!
    expect(spec.nodes).toHaveLength(3)
    expect(spec.nodes[0]?.expertId).toBe('architect')
    expect(spec.nodes[1]?.expertId).toBe('general')
    const summary = spec.nodes[2]!
    expect(summary.id).toBe('team-summary')
    expect(summary.expertId).toBe('delivery-manager')
    expect(summary.depends_on).toEqual(['design', 'impl'])
    expect(summary.prompt).toContain('${nodes.design.output}')
    expect(summary.prompt).toContain('${nodes.impl.output}')
    // 继承 + 防递归
    expect(spec.project).toBe('proj-1')
    expect(spec.defaults?.teamId).toBeUndefined()
    expect(spec.defaults?.model).toBe('deepseek-v4-flash')
    expect(spec.acceptance_criteria).toBe('功能可用')
  })

  test('缺省 expertId 的节点归团长', () => {
    const result = buildTeamExecutionSpec({
      team,
      leaderSpec: leaderSpec([{ id: 'review', title: '评审', kind: 'session' as const, prompt: '自己干' }]),
      baseSpec,
    })
    expect(result.ok).toBe(true)
    expect(result.spec!.nodes[0]!.expertId).toBe('delivery-manager')
  })

  test('空节点列表报错', () => {
    const result = buildTeamExecutionSpec({
      team,
      leaderSpec: leaderSpec([]),
      baseSpec,
    })
    expect(result.ok).toBe(false)
    expect(result.errors![0]).toContain('没有产出任何委派节点')
  })

  test('非团队成员 expertId 报错', () => {
    const result = buildTeamExecutionSpec({
      team,
      leaderSpec: leaderSpec([{ id: 'x', title: 'X', kind: 'session' as const, expertId: 'reviewer', prompt: '外人' }]),
      baseSpec,
    })
    expect(result.ok).toBe(false)
    expect(result.errors![0]).toContain('不在团队成员中')
    expect(result.errors![0]).toContain('reviewer')
  })

  test('汇总节点 id 与成员节点冲突时自动规避', () => {
    const result = buildTeamExecutionSpec({
      team,
      leaderSpec: leaderSpec([{ id: 'team-summary', title: '抢注', kind: 'session' as const, expertId: 'architect', prompt: 'X' }]),
      baseSpec,
    })
    expect(result.ok).toBe(true)
    const ids = result.spec!.nodes.map((n) => n.id)
    expect(ids).toContain('team-summary')
    const summary = result.spec!.nodes.find((n) => n.id !== 'team-summary')!
    expect(summary.id).toBe('team-summary-2')
    expect(summary.expertId).toBe('delivery-manager')
  })
})

describe('buildTeamSummaryPrompt / buildLeaderPlanningPrompt', () => {
  test('汇总 prompt 引用每个成员产出并标注团长身份', () => {
    const prompt = buildTeamSummaryPrompt(team, [
      { id: 'design', title: '设计', kind: 'session', expertId: 'architect', prompt: 'x' },
      { id: 'impl', title: '实现', kind: 'session', expertId: 'general', prompt: 'y' },
    ])
    expect(prompt).toContain('软件研发全流程团')
    expect(prompt).toContain('delivery-manager')
    expect(prompt).toContain('${nodes.design.output}')
    expect(prompt).toContain('${nodes.impl.output}')
    expect(prompt).toContain('成员产出 1')
    expect(prompt).toContain('成员产出 2')
  })

  test('团长编排指令包含协议、协调策略、名册、目标与验收标准', () => {
    const prompt = buildLeaderPlanningPrompt(team, baseSpec, (id) => {
      const labels: Record<string, { label: string; skills: string[] }> = {
        'delivery-manager': { label: '软件交付经理', skills: [] },
        architect: { label: '软件架构师', skills: ['brainstorming'] },
      }
      return labels[id] ?? null
    })
    expect(prompt).toContain('团长协调协议')
    expect(prompt).toContain('按四阶段协作')
    expect(prompt).toContain('软件架构师')
    expect(prompt).toContain('可用技能: brainstorming')
    expect(prompt).toContain('实现一个功能')
    expect(prompt).toContain('功能可用')
    expect(prompt).toContain('输出 ONLY 合法的 task.yaml')
  })
})
