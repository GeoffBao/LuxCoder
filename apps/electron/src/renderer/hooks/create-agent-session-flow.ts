/**
 * Agent 会话创建流程纯函数 — 供 useCreateSession / 测试共用
 */

export interface CreateAgentSessionFlowInput {
  /** 未传时默认 true（未发送不进侧栏） */
  draft?: boolean
  projectId?: string
  channelId?: string
  modelId?: string
  workspaceId?: string
}

/** Spec：全局/项目新会话默认 Draft，除非显式 draft: false */
export function shouldMarkDraft(input: CreateAgentSessionFlowInput): boolean {
  return input.draft !== false
}

export function resolveCreateAgentWorkspaceId(
  input: CreateAgentSessionFlowInput,
  currentWorkspaceId: string | null,
): string | undefined {
  return input.workspaceId ?? currentWorkspaceId ?? undefined
}
