import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxagents/shared'
import {
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
  }
}

describe('buildKanbanBoardModel', () => {
  test('默认提供 Inbox、待办、进行中和已完成四列', () => {
    const model = buildKanbanBoardModel([])

    expect(model.columns.map((column) => column.id)).toEqual([
      'inbox',
      'todo',
      'in-progress',
      'done',
    ])
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

  test('项目自定义列替换默认流程列，并保留 Inbox', () => {
    const model = buildKanbanBoardModel(
      [createItem('review-card', 'review'), createItem('unknown-card', 'missing')],
      [
        { id: 'backlog', name: '待规划' },
        { id: 'review', name: '待评审', color: '#8b5cf6' },
      ],
    )

    expect(model.columns.map((column) => column.id)).toEqual(['inbox', 'backlog', 'review'])
    expect(model.columns.find((column) => column.id === 'review')?.items[0]?.id).toBe('review-card')
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
