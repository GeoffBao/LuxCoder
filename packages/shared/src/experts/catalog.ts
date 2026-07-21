import type { ExpertDefinition } from './types.ts'

/** 内置专家目录（P0 固定 10 个 slug，与 spec §5.3 一致） */
export const BUILTIN_EXPERT_DEFINITIONS: readonly ExpertDefinition[] = [
  { id: 'general', label: '通用专家', identitySummary: '跨领域通用协作与问题拆解' },
  { id: 'driver', label: '驱动软件专家', identitySummary: '内核驱动、HAL 与底层软件栈' },
  { id: 'application', label: '应用软件专家', identitySummary: '应用层功能、交互与业务逻辑' },
  { id: 'system', label: '系统软件专家', identitySummary: '系统服务、框架与平台集成' },
  { id: 'communication', label: '通信软件专家', identitySummary: '协议栈、网络与通信中间件' },
  { id: 'delivery-manager', label: '软件交付经理', identitySummary: '版本计划、风险与交付协调' },
  { id: 'se', label: '软件 SE', identitySummary: '需求分析、方案设计与系统工程' },
  { id: 'architect', label: '软件架构师', identitySummary: '架构决策、模块边界与技术演进' },
  { id: 'qa', label: '软件测试', identitySummary: '测试策略、用例设计与质量保障' },
  { id: 'reviewer', label: '代码审查', identitySummary: '代码质量、规范与可维护性审查' },
]
