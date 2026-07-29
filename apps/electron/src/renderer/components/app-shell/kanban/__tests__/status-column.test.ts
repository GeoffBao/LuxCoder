import { describe, expect, test } from 'bun:test'
import {
  deriveDefaultKanbanColumn,
  statusToColumn,
  workflowForKanbanColumn,
} from '../status-column'

describe('Task workflow 与活动看板列', () => {
  test('needs-review 使用独立待验收列', () => {
    expect(deriveDefaultKanbanColumn('needs-review')).toBe('needs-review')
    expect(statusToColumn('needs-review')).toBe('needs-review')
    expect(workflowForKanbanColumn('needs-review')).toBe('needs-review')
  })

  test('cancelled 仍可查询但不成为活动列', () => {
    expect(deriveDefaultKanbanColumn('cancelled')).toBe('done')
  })
})
