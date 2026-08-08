import type { TeamSquad } from './types.ts'

/**
 * 团长协调协议（Multica Squad Operating Protocol 的中文适配，硬编码注入）。
 * 注入团长编排节点的 preamble，职责是「拆解委派」，不是亲自实现。
 */
export function buildTeamLeaderProtocol(): string {
  return [
    '# 团长协调协议',
    '',
    '你是一个专家团的团长（LEADER）。你的职责是**协调与拆解委派**，不是亲自实现任务。',
    '',
    '工作方式：',
    '- 阅读任务目标、验收标准与可用上下文。',
    '- 按成员的 role 与 skills 匹配最合适的成员，把任务拆解为可执行的委派计划。',
    '- 委派计划必须以 task.yaml 格式输出：每个节点标注对应的成员（expertId）、任务说明与依赖关系。',
    '- 任务说明只写成员无法从共享上下文推断出的信息；不要重复成员已经掌握的背景。',
    '- 委派计划必须是可执行的 DAG：用 depends_on 表达依赖；互相独立的子任务不要互相依赖。',
    '- 在 DAG 尾部预留一个汇总节点（expertId 填你自己），用于验收成员产出并合并最终交付。',
    '',
    '边界：',
    '- 不擅自扩大任务范围；无法拆解或成员无法覆盖任务时，明确说明原因并请求人工介入。',
    '- 每个节点只做一件事；宁可多几个小节点，也不要一个节点塞多个职责。',
    '- 输出 ONLY 合法的 task.yaml —— 不要散文、不要解释、不要代码围栏。',
  ].join('\n')
}

export interface TeamMemberInfo {
  label: string
  /** 成员可用的 skill 名称列表（无 resolver 时用原始 slug） */
  skills?: string[]
}

export type TeamMemberResolver = (expertId: string) => TeamMemberInfo | null

/**
 * 生成团队名册（动态数据，注入团长编排节点）。
 * leader self-row + 每个成员 label / role / skills。
 */
export function buildTeamRoster(
  squad: TeamSquad,
  resolveMember: TeamMemberResolver,
): string {
  const lines: string[] = ['# 团队名册', '']

  const leader = resolveMember(squad.leaderExpertId)
  lines.push(`- 团长: ${leader?.label ?? squad.leaderExpertId}（你）`)

  if (squad.members.length === 0) {
    lines.push('- 成员: （无，单人模式）')
  } else {
    for (const member of squad.members) {
      const info = resolveMember(member.expertId)
      const role = member.role ? `［${member.role}］` : ''
      const skills = info?.skills?.length
        ? ` 可用技能: ${info.skills.join('、')}`
        : ''
      lines.push(`- 成员: ${info?.label ?? member.expertId} ${role}${skills}`)
    }
  }

  return lines.join('\n')
}

/**
 * 组装团长编排 briefing：协议 + 团队 instructions（用户定义协调策略）+ 名册 + 任务目标。
 * 注入团长节点 prompt 的开头，随后是任务目标原文。
 */
export function buildTeamBriefing(
  squad: TeamSquad,
  resolveMember: TeamMemberResolver,
  taskGoal: string,
): string {
  const sections = [
    buildTeamLeaderProtocol(),
    squad.instructions?.trim() ? `# 团长协调策略（团队定义）\n\n${squad.instructions.trim()}` : '',
    buildTeamRoster(squad, resolveMember),
    '# 任务目标',
    '',
    taskGoal,
  ].filter((section) => section !== '')

  return sections.join('\n\n')
}
