/**
 * TB 缺陷看板渲染层视图模型适配
 *
 * 复用 @yoda/shared/teambition-defect 纯函数（三区划分 / 授权 / 合法目标推导），
 * 这里只做 Browser 类型到共享类型的适配，避免在 UI 组件里直接 import 共享 deep path。
 */

import {
  analyzeTaskCompleteness as sharedAnalyzeCompleteness,
  canTransition as sharedCanTransition,
  classifyTbDefect as sharedClassify,
  deriveLegalTargets as sharedDeriveLegalTargets,
  isTbDefectOverdue as sharedIsOverdue,
  isTbDefectReopened as sharedIsReopened,
  resolveSkillMatches as sharedResolveSkillMatches,
} from '@yoda/shared/teambition-defect'
import type { TbDefectItem, TbRoleView, TbSection, TbSkillMatch, TbTaskDetail, TbWorkflow } from '@yoda/shared/teambition-defect'
import type { BrowserTbCompletenessResult, BrowserTbDefectItem, BrowserTbTaskDetail, BrowserTbWorkflow } from '@/../preload/index'

/** 渲染层 Skill 匹配结果（与 shared TbSkillMatch 对齐） */
export type BrowserTbSkillMatch = TbSkillMatch

/** Browser 缺陷项 → 共享模型输入（仅取 classify/授权所需字段） */
function toSharedItem(item: BrowserTbDefectItem): Pick<TbDefectItem, 'tfsId' | 'executorId' | 'involveMembers' | 'tfsName' | 'transitions' | 'dueDate'> {
  return {
    tfsId: item.tfsId,
    executorId: item.executorId,
    involveMembers: item.involveMembers,
    tfsName: item.tfsName,
    transitions: item.transitions,
    dueDate: item.dueDate,
  }
}

/** Browser 工作流 → 共享 TbWorkflow */
function toSharedWorkflow(workflow: BrowserTbWorkflow | undefined): TbWorkflow | undefined {
  if (!workflow) return undefined
  return {
    taskflowId: workflow.taskflowId,
    statuses: workflow.statuses.map((status) => ({
      id: status.id,
      name: status.name,
      kind: status.kind,
      pos: status.pos,
      rejectStatusIds: status.rejectStatusIds,
      stage: status.stage,
    })),
  }
}

export type { TbSection }

/** 三区划分（纯函数；按角色视图分类） */
export function classifyDefect(
  item: BrowserTbDefectItem,
  workflow: BrowserTbWorkflow | undefined,
  roleView: TbRoleView,
  currentUserId: string | undefined,
): TbSection {
  if (!currentUserId) return 'handed-off'
  return sharedClassify(toSharedItem(item), toSharedWorkflow(workflow), roleView, currentUserId)
}

/** 合法目标状态列表（空数组 = 不可流转） */
export function legalTargets(
  item: BrowserTbDefectItem,
  workflow: BrowserTbWorkflow | undefined,
  roleView: TbRoleView,
  currentUserId: string | undefined,
): Array<{ id: string; name: string; kind: 'start' | 'unset' | 'end' }> {
  if (!currentUserId) return []
  return sharedCanTransition(toSharedItem(item), toSharedWorkflow(workflow), roleView, currentUserId)
    .map((status) => ({ id: status.id, name: status.name, kind: status.kind }))
}

/** 当前用户是否可流转 */
export function canFlow(
  item: BrowserTbDefectItem,
  workflow: BrowserTbWorkflow | undefined,
  roleView: TbRoleView,
  currentUserId: string | undefined,
): boolean {
  return legalTargets(item, workflow, roleView, currentUserId).length > 0
}

/** Reopen 被打回高亮 */
export function isReopened(item: BrowserTbDefectItem, workflow: BrowserTbWorkflow | undefined): boolean {
  return sharedIsReopened(toSharedItem(item), toSharedWorkflow(workflow))
}

/** 逾期（非终态且 dueDate 已过） */
export function isOverdue(item: BrowserTbDefectItem, workflow: BrowserTbWorkflow | undefined): boolean {
  return sharedIsOverdue(toSharedItem(item), toSharedWorkflow(workflow), Date.now())
}

/** 任务详情 → 共享检测输入 */
function toSharedDetail(detail: BrowserTbTaskDetail | undefined): Pick<TbTaskDetail, 'note' | 'description' | 'attachments' | 'fields'> {
  if (!detail) return { note: '', description: '', attachments: [], fields: [] }
  return {
    note: detail.note,
    description: detail.description,
    attachments: detail.attachments,
    fields: detail.fields,
  }
}

/** 信息完整性检测（纯函数，供详情抽屉展示） */
export function analyzeCompleteness(detail: BrowserTbTaskDetail | undefined): BrowserTbCompletenessResult {
  return sharedAnalyzeCompleteness(toSharedDetail(detail))
}

/** 列表级 Skill 匹配（无详情，仅标题/类型；用于加入本地任务对话框的 AI 预勾选） */
export function resolveSkillMatchesForItem(
  item: Pick<BrowserTbDefectItem, 'content' | 'type'>,
  skills: Array<{ slug: string; name: string; description?: string; enabled: boolean }>,
): BrowserTbSkillMatch[] {
  return sharedResolveSkillMatches(
    { content: item.content, type: item.type },
    skills,
  )
}
