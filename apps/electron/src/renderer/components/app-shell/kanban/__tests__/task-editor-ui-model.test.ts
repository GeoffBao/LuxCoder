import { describe, expect, test } from 'bun:test'
import { getTaskExpertOption, TASK_EXPERT_OPTIONS } from '../task-editor-ui-model'

describe('TaskEditor Agent 专家 UI', () => {
  test('提供通用、驱动、系统、应用和通信五类专家', () => {
    expect(TASK_EXPERT_OPTIONS.map((expert) => expert.id)).toEqual([
      'general',
      'driver',
      'system',
      'application',
      'communication',
    ])
  })

  test('未知专家回退到通用专家', () => {
    expect(getTaskExpertOption('missing').id).toBe('general')
  })
})
