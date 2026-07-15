export type TaskEditorMode = 'manual' | 'generate'

export type TaskExpertId =
  | 'general'
  | 'driver'
  | 'system'
  | 'application'
  | 'communication'

export interface TaskExpertOption {
  id: TaskExpertId
  label: string
  description: string
}

export const TASK_EXPERT_OPTIONS: readonly TaskExpertOption[] = [
  {
    id: 'general',
    label: '通用专家',
    description: '适合跨领域任务，使用工作区默认能力。',
  },
  {
    id: 'driver',
    label: '驱动专家',
    description: '聚焦设备驱动、HAL、内核接口与硬件调试。',
  },
  {
    id: 'system',
    label: '系统专家',
    description: '聚焦操作系统、运行时、系统服务与稳定性。',
  },
  {
    id: 'application',
    label: '应用专家',
    description: '聚焦产品应用、界面体验与业务逻辑。',
  },
  {
    id: 'communication',
    label: '通信专家',
    description: '聚焦网络协议、IPC、连接与可靠传输。',
  },
]

export function getTaskExpertOption(id: string): TaskExpertOption {
  return TASK_EXPERT_OPTIONS.find((expert) => expert.id === id) ?? TASK_EXPERT_OPTIONS[0]!
}
