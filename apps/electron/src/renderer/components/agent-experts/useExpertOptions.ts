/**
 * useExpertOptions — 专家下拉选项（Hub / 项目详情共用）
 *
 * 优先从 IPC experts.list 拉取；失败时回退内置常量。
 */

import * as React from 'react'

export interface ExpertOption {
  id: string
  label: string
}

/** 内置专家选项 */
export const BUILTIN_EXPERT_OPTIONS: readonly ExpertOption[] = [
  { id: 'general', label: '通用软件专家' },
  { id: 'driver', label: '驱动软件专家' },
  { id: 'application', label: '应用软件专家' },
  { id: 'system', label: '系统软件专家' },
  { id: 'communication', label: '通信软件专家' },
  { id: 'delivery-manager', label: '软件交付经理' },
  { id: 'se', label: '软件 SE' },
  { id: 'architect', label: '软件架构师' },
  { id: 'qa', label: '软件测试' },
  { id: 'reviewer', label: '代码审查' },
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

    void window.electronAPI.experts.list()
      .then((experts) => {
        if (cancelled) return
        setOptions(experts.map((expert) => ({ id: expert.id, label: expert.label })))
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
