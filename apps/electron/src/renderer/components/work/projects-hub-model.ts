import type { AppMode } from '@/atoms/app-mode'

export interface ExpertOption {
  id: string
  label: string
}

/** 内置专家选项（Task 7 前 Hub / 详情页共用；后续可换 IPC 列表并回退此常量） */
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

export function shouldOpenProjectsHub(mode: AppMode): boolean {
  return mode === 'agent' || mode === 'cowork'
}

export function resolveExpertLabel(
  expertId: string | undefined,
  experts: readonly ExpertOption[],
): string {
  if (!expertId) return '未设置'
  return experts.find((e) => e.id === expertId)?.label ?? '未设置'
}
