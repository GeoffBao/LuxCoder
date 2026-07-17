import { describe, expect, it } from 'bun:test'
import { resolveNodeStatePill } from '../node-state-pill'

describe('resolveNodeStatePill', () => {
  it('用不同主题样式和中文标签区分完成与失败', () => {
    const done = resolveNodeStatePill('done')
    const failed = resolveNodeStatePill('failed')

    expect(done.className).not.toBe(failed.className)
    expect(done.className).toContain('primary')
    expect(failed.className).toContain('destructive')
    expect(done.label).toBe('已完成')
    expect(failed.label).toBe('失败')
  })

  it('取消状态保持中性，避免被误读为失败', () => {
    const cancelled = resolveNodeStatePill('cancelled')
    const pending = resolveNodeStatePill('pending')

    expect(cancelled.className).toBe(pending.className)
    expect(cancelled.className).not.toContain('destructive')
    expect(cancelled.className).not.toContain('primary')
    expect(cancelled.label).toBe('已取消')
  })

  it('未知状态回退到无标签的中性样式', () => {
    const unknown = resolveNodeStatePill('some-future-state')
    const pending = resolveNodeStatePill('pending')

    expect(unknown.className).toBe(pending.className)
    expect(unknown.label).toBeNull()
  })

  it('为每个 NodeRunState 字面量提供中文标签', () => {
    const expected = new Map([
      ['pending', '等待中'],
      ['running', '运行中'],
      ['done', '已完成'],
      ['failed', '失败'],
      ['cancelled', '已取消'],
      ['skipped', '已跳过'],
    ])

    for (const [state, label] of expected) {
      expect(resolveNodeStatePill(state).label).toBe(label)
    }
  })
})
