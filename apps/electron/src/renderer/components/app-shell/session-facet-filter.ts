import type { AgentSessionMeta } from '@myyoda/shared'

/**
 * 纯函数：检查单个会话是否命中当前 Label 筛选。
 *
 * 逻辑：
 * - workspaceLabelIds 为空 → 不过滤（显示全部）
 * - 当前会话 labelIds 不为空且与选中项有任何交集 → 命中
 * - 若 includeUnlabeled 为 true 且会话无标签 → 也命中
 */
export function sessionMatchesLabelFilter(
  session: AgentSessionMeta,
  workspaceLabelIds: string[] | undefined,
  includeUnlabeled: boolean | undefined,
): boolean {
  if (!workspaceLabelIds?.length) return true
  const sessionLabels = session.labelIds
  if (sessionLabels?.length) {
    return workspaceLabelIds.some((id) => sessionLabels.includes(id))
  }
  return includeUnlabeled === true
}

/**
 * 判断会话树中从根开始的任一节点是否命中 Label 筛选。
 * 父或任一 child 命中则保留整棵 family。
 */
export function sessionTreeMatchesLabelFilter(
  session: AgentSessionMeta,
  childrenByParent: Map<string, AgentSessionMeta[]>,
  workspaceLabelIds: string[] | undefined,
  includeUnlabeled: boolean | undefined,
): boolean {
  if (sessionMatchesLabelFilter(session, workspaceLabelIds, includeUnlabeled)) return true
  return (childrenByParent.get(session.id) ?? []).some((child) =>
    sessionTreeMatchesLabelFilter(child, childrenByParent, workspaceLabelIds, includeUnlabeled),
  )
}
