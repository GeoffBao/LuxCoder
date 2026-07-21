import type { AppMode } from '@/atoms/app-mode'

export interface ExpertOption {
  id: string
  label: string
}

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
