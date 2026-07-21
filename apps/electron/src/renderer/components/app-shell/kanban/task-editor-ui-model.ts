export type TaskEditorMode = 'manual' | 'generate'

/** 任务专家选项（与 Agent 专家模块同源：id = expert slug） */
export interface TaskExpertOption {
  id: string
  label: string
  description?: string
}

/** 回退目录（IPC 失败时）；文案与 BUILTIN_EXPERT_DEFINITIONS 对齐 */
export const FALLBACK_TASK_EXPERT_OPTIONS: readonly TaskExpertOption[] = [
  { id: 'general', label: '通用软件专家', description: '适合跨领域任务，使用工作区默认能力。' },
  { id: 'driver', label: '驱动软件专家', description: '聚焦设备驱动、HAL、内核接口与硬件调试。' },
  { id: 'system', label: '系统软件专家', description: '聚焦操作系统、运行时、系统服务与稳定性。' },
  { id: 'application', label: '应用软件专家', description: '聚焦产品应用、界面体验与业务逻辑。' },
  { id: 'communication', label: '通信软件专家', description: '聚焦网络协议、IPC、连接与可靠传输。' },
  { id: 'delivery-manager', label: '软件交付经理', description: '聚焦版本计划、风险与交付协调。' },
  { id: 'se', label: '软件 SE', description: '聚焦需求分析、方案设计与系统工程。' },
  { id: 'architect', label: '软件架构师', description: '聚焦架构决策、模块边界与技术演进。' },
  { id: 'qa', label: '软件测试', description: '聚焦测试策略、用例设计与质量保障。' },
  { id: 'reviewer', label: '代码审查', description: '聚焦代码质量、规范与可维护性审查。' },
]

/** @deprecated 使用 FALLBACK_TASK_EXPERT_OPTIONS；保留别名避免旧测试 import 断裂 */
export const TASK_EXPERT_OPTIONS = FALLBACK_TASK_EXPERT_OPTIONS

export function getTaskExpertOption(
  id: string,
  options: readonly TaskExpertOption[] = FALLBACK_TASK_EXPERT_OPTIONS,
): TaskExpertOption {
  return options.find((expert) => expert.id === id) ?? options[0] ?? FALLBACK_TASK_EXPERT_OPTIONS[0]!
}
