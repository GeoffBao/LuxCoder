import { describe, expect, test } from 'bun:test'
import { buildProgressSegments, formatProgressLabel } from '../SubtaskProgress'
import type { KanbanSubtask } from '../types'

function row(runState: KanbanSubtask['runState'], id?: string): KanbanSubtask {
  return { id: id ?? runState, title: id ?? runState, runState, model: 'm' }
}

describe('buildProgressSegments', () => {
  test('按节点状态分段，不足 total 时补 pending', () => {
    expect(buildProgressSegments([
      row('done', 'a'),
      row('running', 'b'),
      row('pending', 'c'),
    ], 5)).toEqual(['done', 'running', 'pending', 'pending', 'pending'])
  })

  test('total 缺省时等于 subtasks 长度', () => {
    expect(buildProgressSegments([row('failed'), row('done')])).toEqual(['failed', 'done'])
  })

  test('空列表返回空', () => {
    expect(buildProgressSegments([], 0)).toEqual([])
  })
})

describe('formatProgressLabel', () => {
  test('无失败时保持 done/total', () => {
    expect(formatProgressLabel(['done', 'pending', 'pending'])).toBe('1/3')
  })

  test('有失败时露出 ✓/✗', () => {
    expect(formatProgressLabel(['done', 'failed', 'pending', 'pending', 'pending'])).toBe('1✓1✗/5')
  })
})
