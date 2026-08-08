/**
 * useExpertOptions — 专家下拉选项（Hub / 项目详情共用）
 *
 * 优先从 IPC experts.list 拉取；失败时回退内置常量。
 */

import * as React from 'react'

export interface ExpertOption {
  id: string
  label: string
  /** expert = 单角色专家；team = 专家团（团长编排） */
  kind?: 'expert' | 'team'
}

/** 内置专家选项（5 个专家 + 2 个专家团，与 BUILTIN_EXPERT_DEFINITIONS / BUILTIN_EXPERT_TEAM_DEFINITIONS 对齐） */
export const BUILTIN_EXPERT_OPTIONS: readonly ExpertOption[] = [
  { id: 'general', label: '通用软件专家', kind: 'expert' },
  { id: 'architect', label: '软件架构师', kind: 'expert' },
  { id: 'qa', label: '软件测试', kind: 'expert' },
  { id: 'reviewer', label: '代码审查', kind: 'expert' },
  { id: 'delivery-manager', label: '软件交付经理', kind: 'expert' },
  { id: 'dev-team', label: '软件研发全流程团', kind: 'team' },
  { id: 'quality-team', label: '代码质量攻坚团', kind: 'team' },
]

/** 根据 expertId 解析显示标签 */
export function resolveExpertLabel(
  expertId: string | undefined,
  experts: readonly ExpertOption[],
): string {
  if (!expertId) return '未设置'
  return experts.find((item) => item.id === expertId)?.label ?? '未设置'
}

export interface ExpertOptionsState {
  options: ExpertOption[]
  loading: boolean
}

export function useExpertOptions(): ExpertOptionsState {
  const [options, setOptions] = React.useState<ExpertOption[]>(() => [...BUILTIN_EXPERT_OPTIONS])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    void Promise.all([
      window.electronAPI.experts.list(),
      window.electronAPI.experts.listTeams(),
    ])
      .then(([experts, teams]) => {
        if (cancelled) return
        // 专家 + 团队合并（新结构团队只有 team.json，不在 experts.list 中）
        const merged = [
          ...experts
            .filter((expert) => (expert.kind ?? 'expert') !== 'team')
            .map((expert) => ({
              id: expert.id,
              label: expert.label,
              kind: 'expert' as const,
            })),
          ...teams.map((team) => ({ id: team.id, label: team.label, kind: 'team' as const })),
        ].sort((a, b) => a.id.localeCompare(b.id))
        setOptions(merged)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        console.error('[useExpertOptions] 加载专家列表失败，回退内置选项:', cause)
        setOptions([...BUILTIN_EXPERT_OPTIONS])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { options, loading }
}
