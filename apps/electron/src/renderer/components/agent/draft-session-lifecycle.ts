/**
 * Draft Session 生命周期判定（纯函数）
 */

export function canBindProjectBeforeSend(input: {
  projectId?: string
  isDraft: boolean
}): boolean {
  return input.isDraft
}

export function shouldDiscardDraftOnLeave(input: {
  isDraft: boolean
  hasUserMessage: boolean
}): boolean {
  return input.isDraft && !input.hasUserMessage
}
