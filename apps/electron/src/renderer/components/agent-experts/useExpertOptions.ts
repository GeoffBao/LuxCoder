/**
 * useExpertOptions — 专家下拉选项（Hub / 项目详情共用）
 *
 * 优先从 IPC experts.list 拉取；失败时回退内置常量。
 */

import * as React from 'react'
import {
  BUILTIN_EXPERT_OPTIONS,
  type ExpertOption,
} from '@/components/work/projects-hub-model'

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
