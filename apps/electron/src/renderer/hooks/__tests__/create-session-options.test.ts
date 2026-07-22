import { describe, expect, test } from 'bun:test'
import {
  resolveCreateAgentWorkspaceId,
  shouldMarkDraft,
} from '../create-agent-session-flow.ts'

describe('create-agent-session-flow', () => {
  test('draft 默认 true，显式 false 才关闭', () => {
    expect(shouldMarkDraft({})).toBe(true)
    expect(shouldMarkDraft({ draft: true })).toBe(true)
    expect(shouldMarkDraft({ draft: false })).toBe(false)
  })

  test('workspaceId 优先于当前工作区', () => {
    expect(resolveCreateAgentWorkspaceId({ workspaceId: 'ws-b' }, 'ws-a')).toBe('ws-b')
    expect(resolveCreateAgentWorkspaceId({}, 'ws-a')).toBe('ws-a')
    expect(resolveCreateAgentWorkspaceId({}, null)).toBeUndefined()
  })
})
