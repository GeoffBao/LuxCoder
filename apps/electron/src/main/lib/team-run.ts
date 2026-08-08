/**
 * 专家团运行 —— 团长编排 → 展开执行
 *
 * 团长编排阶段（task-handlers 侧）：把任务目标 + 团长协议 + 团队名册 + 协调策略发给团长，
 * 团长输出委派 task.yaml（每个节点带成员 expertId）。
 * 本模块负责把团长输出「校验 + 展开」成可静态执行的完整 spec：
 * 成员节点（校验 expertId 归属）+ 自动追加的团长汇总节点。
 */
import type { TeamSquad } from '@myyoda/shared/experts'
import type { TaskSpec, TaskNode } from '@myyoda/shared/tasks/schema'
import { nodeTitle } from '@myyoda/shared/tasks/schema'
import { buildTeamBriefing, type TeamMemberResolver } from '@myyoda/shared/experts'

/** 汇总节点 id 前缀（团长输出不得占用；冲突时自动加数字后缀） */
const SUMMARY_NODE_PREFIX = 'team-summary'

/** 团队成员的合法 expertId 集合（含团长）；用于校验团长输出里的节点 expertId 归属 */
export function teamAllowedExpertIds(team: TeamSquad): Set<string> {
  const ids = new Set<string>([team.leaderExpertId])
  for (const member of team.members) ids.add(member.expertId)
  return ids
}

export interface BuildTeamExecutionSpecInput {
  team: TeamSquad
  /** 团长输出的 DAG spec（成员节点，可能部分节点缺省 expertId） */
  leaderSpec: TaskSpec
  /** 原任务 spec（继承 defaults/skills/sources/params/token_budget 等） */
  baseSpec: TaskSpec
}

export interface TeamExecutionBuildResult {
  ok: boolean
  spec?: TaskSpec
  errors?: string[]
}

/**
 * 把团长输出的委派 DAG 展开为可执行 spec：
 * - 校验节点数、expertId 归属（缺省归团长，非法 id 报错）
 * - 自动追加团长汇总节点（depends_on 全部成员节点，引用各节点输出）
 * - 继承原任务 defaults（清除 teamId 防递归）
 */
export function buildTeamExecutionSpec(input: BuildTeamExecutionSpecInput): TeamExecutionBuildResult {
  const { team, leaderSpec, baseSpec } = input
  const errors: string[] = []

  if (leaderSpec.nodes.length === 0) {
    return { ok: false, errors: ['团长没有产出任何委派节点'] }
  }

  const allowed = teamAllowedExpertIds(team)
  const nodes: TaskNode[] = leaderSpec.nodes.map((node) => {
    const expertId = node.expertId ?? team.leaderExpertId
    if (!allowed.has(expertId)) {
      errors.push(`节点 "${node.id}" 指派的专家不在团队成员中: ${expertId}`)
    }
    return { ...node, expertId }
  })

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // 汇总节点 id 冲突规避
  const taken = new Set(nodes.map((n) => n.id))
  let summaryId = SUMMARY_NODE_PREFIX
  let suffix = 2
  while (taken.has(summaryId)) {
    summaryId = `${SUMMARY_NODE_PREFIX}-${suffix}`
    suffix += 1
  }

  const summaryPrompt = buildTeamSummaryPrompt(team, nodes)
  const summaryNode: TaskNode = {
    id: summaryId,
    title: '团队汇总',
    kind: 'session',
    expertId: team.leaderExpertId,
    depends_on: nodes.map((n) => n.id),
    prompt: summaryPrompt,
  }

  const spec: TaskSpec = {
    id: baseSpec.id,
    title: baseSpec.title,
    goal: baseSpec.goal,
    acceptance_criteria: baseSpec.acceptance_criteria ?? leaderSpec.acceptance_criteria,
    project: baseSpec.project,
    cwd: baseSpec.cwd,
    runner: baseSpec.runner ?? 'conduct',
    sources: baseSpec.sources,
    skills: baseSpec.skills,
    defaults: baseSpec.defaults ? { ...baseSpec.defaults, teamId: undefined } : undefined,
    params: baseSpec.params,
    token_budget: baseSpec.token_budget,
    max_parallel: baseSpec.max_parallel,
    max_iterations: baseSpec.max_iterations,
    nodes: [...nodes, summaryNode],
    outputs: baseSpec.outputs,
  }

  return { ok: true, spec }
}

/** 汇总节点 prompt：团长验收各成员产出并合并交付 */
export function buildTeamSummaryPrompt(team: TeamSquad, nodes: TaskNode[]): string {
  const sections = [
    `你是专家团「${team.label}」的团长（${team.leaderExpertId}）。以下是团队成员产出的最终结果。`,
    '请逐份验收质量（对照任务目标与验收标准），合并为一份完整、可直接交付的最终答复。',
    '对明显缺失、错误或互相矛盾的部分明确标注，不掩盖问题；必要时指出需要返工的范围。',
    '',
    ...nodes.map((node, index) => {
      const ref = `\${nodes.${node.id}.output}`
      return `### 成员产出 ${index + 1}（${nodeTitle(node)}${node.expertId ? ` · ${node.expertId}` : ''}）\n${ref}`
    }),
  ]
  return sections.join('\n\n')
}

/** 团长编排阶段的完整指令（协议 + 团队协调策略 + 名册 + 任务目标与验收标准） */
export function buildLeaderPlanningPrompt(
  team: TeamSquad,
  baseSpec: TaskSpec,
  resolveMember: TeamMemberResolver,
): string {
  const goal = baseSpec.goal
  const acceptance = baseSpec.acceptance_criteria
    ? `\n\n# 验收标准\n\n${baseSpec.acceptance_criteria}`
    : ''
  const context = baseSpec.nodes.some((n) => n.prompt?.trim())
    ? `\n\n# 参考上下文\n\n任务自带以下节点描述（可忽略或参考）：\n${baseSpec.nodes
        .map((n) => `- ${nodeTitle(n)}${n.prompt?.trim() ? `: ${n.prompt.trim().slice(0, 200)}` : ''}`)
        .join('\n')}`
    : ''
  return `${buildTeamBriefing(team, resolveMember, `${goal}${acceptance}${context}`)}\n\n输出 ONLY 合法的 task.yaml。`
}
