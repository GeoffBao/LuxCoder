import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@myyoda/shared'
import {
  sessionMatchesLabelFilter,
  sessionTreeMatchesLabelFilter,
} from '../session-facet-filter'

function session(overrides: Partial<AgentSessionMeta>): AgentSessionMeta {
  return {
    id: 's1',
    title: '测试',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('sessionMatchesLabelFilter', () => {
  test('空筛选不过滤', () => {
    expect(sessionMatchesLabelFilter(session({ labelIds: ['a'] }), undefined, undefined)).toBe(true)
    expect(sessionMatchesLabelFilter(session({ labelIds: [] }), [], undefined)).toBe(true)
  })

  test('多标签 OR 命中', () => {
    expect(sessionMatchesLabelFilter(session({ labelIds: ['a', 'b'] }), ['a', 'c'], false)).toBe(true)
    expect(sessionMatchesLabelFilter(session({ labelIds: ['c'] }), ['a', 'b'], false)).toBe(false)
  })

  test('includeUnlabeled 能兜底无标签会话', () => {
    expect(sessionMatchesLabelFilter(session({ labelIds: [] }), ['a'], true)).toBe(true)
    expect(sessionMatchesLabelFilter(session({ labelIds: [] }), ['a'], false)).toBe(false)
    expect(sessionMatchesLabelFilter(session({ labelIds: ['x'] }), ['a'], true)).toBe(false)
  })
})

describe('sessionTreeMatchesLabelFilter', () => {
  test('父命中则整棵保留', () => {
    const parent = session({ id: 'p', labelIds: ['a'] })
    const child = session({ id: 'c', parentSessionId: 'p', labelIds: ['b'] })
    expect(sessionTreeMatchesLabelFilter(parent, new Map([['p', [child]]]), ['a'], false)).toBe(true)
  })

  test('仅 child 命中也保留整棵', () => {
    const parent = session({ id: 'p', labelIds: ['x'] })
    const child = session({ id: 'c', parentSessionId: 'p', labelIds: ['a'] })
    expect(sessionTreeMatchesLabelFilter(parent, new Map([['p', [child]]]), ['a'], false)).toBe(true)
  })

  test('都不命中则排除', () => {
    const parent = session({ id: 'p', labelIds: ['x'] })
    const child = session({ id: 'c', parentSessionId: 'p', labelIds: ['y'] })
    expect(sessionTreeMatchesLabelFilter(parent, new Map([['p', [child]]]), ['a'], false)).toBe(false)
  })
})
