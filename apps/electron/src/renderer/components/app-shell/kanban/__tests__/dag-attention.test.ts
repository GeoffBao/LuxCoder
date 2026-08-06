import { describe, expect, test } from 'bun:test'
import { resolveDagAttention, shouldShowDoneColumnAttention } from '../dag-attention'
import type { KanbanSubtask } from '../types'

function row(runState: KanbanSubtask['runState'], id?: string): KanbanSubtask {
  return { id: id ?? runState, title: id ?? runState, runState, model: 'm' }
}

describe('resolveDagAttention', () => {
  test('全 done 无注意力', () => {
    expect(resolveDagAttention([row('done', 'a'), row('done', 'b')])).toBeNull()
  })

  test('有失败优先于未跑完', () => {
    expect(resolveDagAttention([
      row('done', 'a'),
      row('failed', 'b'),
      row('pending', 'c'),
    ])).toEqual({ kind: 'has-failed', label: '执行失败' })
  })

  test('有失败时携带失败原因', () => {
    expect(resolveDagAttention(
      [row('done', 'a'), row('failed', 'b')],
      undefined,
      '节点 b 执行异常：SDK 超时',
    )).toEqual({ kind: 'has-failed', label: '执行失败', reason: '节点 b 执行异常：SDK 超时' })
  })

  test('needs-review 为待验收（优先于未跑完）', () => {
    expect(resolveDagAttention([
      row('done', 'a'),
      row('needs-review', 'b'),
      row('pending', 'c'),
    ])).toEqual({ kind: 'needs-review', label: '待验收' })
  })

  test('仅 pending/running 为未跑完', () => {
    expect(resolveDagAttention([row('done', 'a'), row('pending', 'b')], 2))
      .toEqual({ kind: 'incomplete', label: '未跑完' })
  })

  test('total 大于已揭示时补 pending 也算未跑完', () => {
    expect(resolveDagAttention([row('done', 'a')], 3))
      .toEqual({ kind: 'incomplete', label: '未跑完' })
  })
})

describe('shouldShowDoneColumnAttention', () => {
  test('done 与 needs-review 列展示', () => {
    const attention = { kind: 'incomplete' as const, label: '未跑完' }
    expect(shouldShowDoneColumnAttention('done', attention)).toBe(true)
    expect(shouldShowDoneColumnAttention('needs-review', attention)).toBe(true)
    expect(shouldShowDoneColumnAttention('in-progress', attention)).toBe(false)
    expect(shouldShowDoneColumnAttention('done', null)).toBe(false)
  })
})
