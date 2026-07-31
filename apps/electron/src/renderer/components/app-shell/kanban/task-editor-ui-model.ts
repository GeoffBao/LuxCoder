export type TaskEditorMode = 'manual' | 'generate'

/** 任务专家选项（与 Agent 专家模块同源：id = expert slug） */
export interface TaskExpertOption {
  id: string
  label: string
  description?: string
}

/** 回退目录（IPC 失败时）；文案与 BUILTIN_EXPERT_DEFINITIONS / BUILTIN_EXPERT_TEAM_DEFINITIONS 对齐 */
export const FALLBACK_TASK_EXPERT_OPTIONS: readonly TaskExpertOption[] = [
  { id: 'general', label: '通用软件专家', description: '适合跨领域任务，使用工作区默认能力。' },
  { id: 'architect', label: '软件架构师', description: '聚焦架构决策、模块边界与技术演进。' },
  { id: 'qa', label: '软件测试', description: '聚焦测试策略、用例设计与质量保障。' },
  { id: 'reviewer', label: '代码审查', description: '聚焦代码质量、规范与可维护性审查。' },
  { id: 'delivery-manager', label: '软件交付经理', description: '聚焦版本计划、风险与交付协调。' },
  { id: 'dev-team', label: '软件研发全流程团', description: '按需求分析→架构设计→编码实现→测试验收四阶段协作交付。' },
  { id: 'quality-team', label: '代码质量攻坚团', description: '按架构评审→安全审计→性能优化→测试补全四视角体检代码。' },
]

/** @deprecated 使用 FALLBACK_TASK_EXPERT_OPTIONS；保留别名避免旧测试 import 断裂 */
export const TASK_EXPERT_OPTIONS = FALLBACK_TASK_EXPERT_OPTIONS

export function getTaskExpertOption(
  id: string,
  options: readonly TaskExpertOption[] = FALLBACK_TASK_EXPERT_OPTIONS,
): TaskExpertOption {
  return options.find((expert) => expert.id === id) ?? options[0] ?? FALLBACK_TASK_EXPERT_OPTIONS[0]!
}
