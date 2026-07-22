import { describe, expect, test } from 'bun:test'
import {
  canBindProjectBeforeSend,
  shouldDiscardDraftOnLeave,
} from '../draft-session-lifecycle.ts'

describe('draft-session-lifecycle', () => {
  test('未归类 draft 可在首条发送前绑定 projectId', () => {
    expect(canBindProjectBeforeSend({ projectId: undefined, isDraft: true })).toBe(true)
    expect(canBindProjectBeforeSend({ projectId: 'p1', isDraft: true })).toBe(true)
    expect(canBindProjectBeforeSend({ projectId: undefined, isDraft: false })).toBe(false)
  })

  test('离开未发送 draft 时应删除会话而非留空历史', () => {
    expect(shouldDiscardDraftOnLeave({ isDraft: true, hasUserMessage: false })).toBe(true)
    expect(shouldDiscardDraftOnLeave({ isDraft: true, hasUserMessage: true })).toBe(false)
    expect(shouldDiscardDraftOnLeave({ isDraft: false, hasUserMessage: false })).toBe(false)
  })
})
