import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@myyoda/shared'
import {
  activeBoardItems,
  buildKanbanBoardModel,
  consumeFirstNotification,
  openKanbanItem,
} from '../board-model'
import type { KanbanItem } from '../types'

function createItem(id: string, columnId: string): KanbanItem {
  const session: AgentSessionMeta = {
    id,
    title: `会话 ${id}`,
    createdAt: 1,
    updatedAt: 1,
  }
  return {
    id,
    title: session.title,
    columnId,
    session,
    project: null,
    subtasks: [],
  }
}

describe('activeBoardItems', () => {
  test('默认活动看板排除 cancelled，显式筛选 cancelled 时才显示', () => {
    const active = createItem('active', 'todo')
    const cancelled = {
      ...createItem('cancelled', 'done'),
      task: { workflow: 'cancelled', legacyIdentity: false },
    } as KanbanItem

    expect(activeBoardItems([active, cancelled], 'all').map((item) => item.id)).toEqual(['active'])
    expect(activeBoardItems([cancelled], 'cancelled').map((item) => item.id)).toEqual(['cancelled'])
  })
})

describe('buildKanbanBoardModel', () => {
  test('默认提供待办、进行中、待验收、已完成四列（取消态不占活动列）', () => {
    const model = buildKanbanBoardModel([])

    expect(model.columns.map((column) => column.id)).toEqual([
      'todo',
      'in-progress',
      'needs-review',
      'done',
    ])
  })

  test('历史 inbox 卡片自动归入第一列（存量迁移）', () => {
    const model = buildKanbanBoardModel([createItem('legacy', 'inbox')])

    expect(model.columns.map((column) => column.id)).toEqual(['todo', 'in-progress', 'needs-review', 'done'])
    expect(model.columns[0]?.items.map((item) => item.id)).toEqual(['legacy'])
  })

  test('Board 分组和 List 均保持输入卡片顺序', () => {
    const items = [
      createItem('first', 'todo'),
      createItem('second', 'done'),
      createItem('third', 'todo'),
    ]
    const model = buildKanbanBoardModel(items)

    expect(model.listItems.map((item) => item.id)).toEqual(['first', 'second', 'third'])
    expect(model.columns.find((column) => column.id === 'todo')?.items.map((item) => item.id)).toEqual([
      'first',
      'third',
    ])
  })

  test('项目自定义列完整替换默认列（历史 inbox 自定义列被剔除）', () => {
    const model = buildKanbanBoardModel(
      [createItem('review-card', 'review'), createItem('unknown-card', 'missing')],
      [
        { id: 'inbox', name: '收件箱' },
        { id: 'backlog', name: '待规划' },
        { id: 'review', name: '待评审', color: '#8b5cf6' },
      ],
    )

    expect(model.columns.map((column) => column.id)).toEqual(['backlog', 'review'])
    expect(model.columns.find((column) => column.id === 'review')?.items[0]?.id).toBe('review-card')
    // 未知列回退到第一列（backlog）
    expect(model.columns.find((column) => column.id === 'backlog')?.items[0]?.id).toBe('unknown-card')
  })
})

describe('kanban board interactions', () => {
  test('打开卡片时将完整 item 交给调用方', () => {
    const item = createItem('open-me', 'todo')
    let opened: KanbanItem | undefined

    openKanbanItem(item, (next) => {
      opened = next
    })

    expect(opened).toBe(item)
  })

  test('一次只消费一条通知', () => {
    const result = consumeFirstNotification([
      { level: 'error', message: '第一次失败' },
      { level: 'error', message: '第二次失败' },
    ])

    expect(result.notification?.message).toBe('第一次失败')
    expect(result.remaining.map((notification) => notification.message)).toEqual(['第二次失败'])
  })
})
