/**
 * draft-recall-model — 侧边栏"未发送草稿"区块的纯函数
 *
 * 草稿会话（未发送过消息）默认从侧边栏所有列表中过滤掉，避免每次点"新会话"
 * 但没发送都留一个空条目。但如果草稿里已经输入了内容，用户需要一个入口找回它，
 * 否则会出现"输入了内容却再也点不回去"的问题（见 draft-session-atoms.ts 注释）。
 */

export interface DraftSessionSourceItem {
  id: string
  title: string
  workspaceId?: string
  createdAt: number
}

export interface DraftSessionWithContent {
  id: string
  title: string
  /** 草稿输入框的纯文本内容（已 trim），用于列表展示预览 */
  text: string
  createdAt: number
}

/**
 * 从会话列表中选出「当前工作区、已输入内容但未发送」的草稿会话，按 createdAt 倒序。
 *
 * @param excludeSessionId 排除当前正打开的会话（用户已经在这个草稿里，不需要在列表里再列一遍）
 * @param maxItems 最多展示条数，默认 3——这是找回入口，不是完整草稿箱
 */
export function selectDraftSessionsWithContent(params: {
  sessions: DraftSessionSourceItem[]
  draftSessionIds: Set<string>
  draftTexts: Map<string, string>
  workspaceId: string | undefined
  excludeSessionId?: string | null
  maxItems?: number
}): DraftSessionWithContent[] {
  const { sessions, draftSessionIds, draftTexts, workspaceId, excludeSessionId, maxItems = 3 } = params

  return sessions
    .filter((session) => (
      draftSessionIds.has(session.id)
      && session.workspaceId === workspaceId
      && session.id !== excludeSessionId
    ))
    .map((session) => ({
      id: session.id,
      title: session.title,
      text: (draftTexts.get(session.id) ?? '').trim(),
      createdAt: session.createdAt,
    }))
    .filter((session) => session.text.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxItems)
}
