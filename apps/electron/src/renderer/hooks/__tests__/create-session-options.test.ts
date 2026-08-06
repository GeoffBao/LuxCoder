import { describe, expect, test } from 'bun:test'
import {
  findRecallableDraftSession,
  resolveCreateAgentWorkspaceId,
  shouldMarkDraft,
  type DraftSessionCandidate,
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

describe('findRecallableDraftSession', () => {
  const base: DraftSessionCandidate[] = [
    { id: 'a', title: '新 Agent 会话', workspaceId: 'ws-1', createdAt: 100 },
    { id: 'b', title: '新 Agent 会话', workspaceId: 'ws-1', createdAt: 200 },
    { id: 'c', title: '新 Agent 会话', workspaceId: 'ws-2', createdAt: 300 },
    { id: 'd', title: '新 Agent 会话', workspaceId: 'ws-1', projectId: 'proj-1', createdAt: 400 },
  ]

  test('无候选草稿时返回 null', () => {
    const result = findRecallableDraftSession({
      candidates: base,
      draftSessionIds: new Set(),
      draftTexts: new Map(),
      workspaceId: 'ws-1',
    })
    expect(result).toBeNull()
  })

  test('草稿存在但输入为空时不回收（空草稿不算"找不回的内容"）', () => {
    const result = findRecallableDraftSession({
      candidates: base,
      draftSessionIds: new Set(['a']),
      draftTexts: new Map([['a', '   ']]),
      workspaceId: 'ws-1',
    })
    expect(result).toBeNull()
  })

  test('同工作区多个候选取 createdAt 最新的一个', () => {
    const result = findRecallableDraftSession({
      candidates: base,
      draftSessionIds: new Set(['a', 'b']),
      draftTexts: new Map([['a', '写了一半'], ['b', '最新草稿']]),
      workspaceId: 'ws-1',
    })
    expect(result?.id).toBe('b')
  })

  test('跨工作区草稿不匹配', () => {
    const result = findRecallableDraftSession({
      candidates: base,
      draftSessionIds: new Set(['c']),
      draftTexts: new Map([['c', '别的工作区的内容']]),
      workspaceId: 'ws-1',
    })
    expect(result).toBeNull()
  })

  test('绑定 projectId 的草稿不参与回收', () => {
    const result = findRecallableDraftSession({
      candidates: base,
      draftSessionIds: new Set(['d']),
      draftTexts: new Map([['d', '项目下的草稿']]),
      workspaceId: 'ws-1',
    })
    expect(result).toBeNull()
  })
})
