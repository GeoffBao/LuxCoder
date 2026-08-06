import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

/**
 * TB 任务 AI 预分析结果（taskId → 分析文本）
 *
 * 由会话/分析流程执行后写入；用户可在详情「AI 预分析」区查看并手动编辑优化。
 * 整体刷新时不清空（分析结果独立于同步状态）；仅当用户重新执行分析时覆盖。
 * 持久化到 localStorage（用户编辑的分析结果跨会话保留）。
 */
export const tbDefectAnalysisAtom = atomWithStorage<Record<string, string>>(
  'luxcoder-tb-defect-analysis',
  {},
)

/** 本地 Agent 任务执行状态（TB taskId → 执行状态），供 TB 详情「AI 预分析」联动展示 */
export type TbTaskExecutionStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface TbTaskExecutionState {
  /** 执行状态：idle 未执行 / running 执行中 / completed 已完成 / failed 执行失败 */
  status: TbTaskExecutionStatus
  /** 最近一次状态更新时间（本地任务/会话状态推断） */
  at: number
  /** 失败/完成摘要（失败原因或结果摘要），可选 */
  summary?: string
  /** 关联的本地任务 slug，便于跳转 */
  taskSlug?: string
}

/**
 * 从本地 Agent 看板任务/会话/运行快照派生的执行状态（TB taskId → 状态）。
 * 不持久化：随看板数据刷新重新派生，保证与 Agent 执行状态实时联动，
 * 也避免任务删除后 localStorage 残留旧状态。
 */
export const tbDefectExecutionAtom = atom<Record<string, TbTaskExecutionState>>({})
