import { describe, expect, test } from 'bun:test'
import {
  createLatestSuggestionRequestGuard,
  shouldSuppressEscTrigger,
  type EscSuppressedTrigger,
} from './mention-popup-utils'

describe('Esc 触发抑制', () => {
  test('同一片段延续（继续输入）时继续抑制', () => {
    const suppressed: EscSuppressedTrigger = { from: 5, text: '@qq' }
    expect(shouldSuppressEscTrigger(suppressed, { from: 5, text: '@qqx' })).toBe(true)
  })

  test('触发符位置后移（重新触发）时不抑制', () => {
    const suppressed: EscSuppressedTrigger = { from: 5, text: '@qq' }
    expect(shouldSuppressEscTrigger(suppressed, { from: 9, text: 'xyz@qq' })).toBe(false)
  })

  test('片段删除后重新输入不同内容时不抑制', () => {
    const suppressed: EscSuppressedTrigger = { from: 5, text: '@qq' }
    expect(shouldSuppressEscTrigger(suppressed, { from: 5, text: '#mc' })).toBe(false)
  })

  test('无抑制状态时不抑制', () => {
    expect(shouldSuppressEscTrigger(null, { from: 5, text: '@qq' })).toBe(false)
  })
})

describe('Suggestion 请求竞态守卫', () => {
  test('最早请求的结果不是最新时被拒绝', () => {
    const guard = createLatestSuggestionRequestGuard<string>()
    const id1 = guard.startRequest()
    const items1 = guard.attachResult(id1, [])
    const id2 = guard.startRequest()
    const items2 = guard.attachResult(id2, ['a'])

    expect(guard.isLatest(items1)).toBe(false)
    expect(guard.isLatest(items2)).toBe(true)
  })

  test('单请求即是最新', () => {
    const guard = createLatestSuggestionRequestGuard<string>()
    const id = guard.startRequest()
    const items = guard.attachResult(id, ['a'])
    expect(guard.isLatest(items)).toBe(true)
  })
})
