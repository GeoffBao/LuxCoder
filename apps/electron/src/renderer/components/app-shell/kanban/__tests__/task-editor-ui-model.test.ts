import { describe, expect, test } from 'bun:test'
import { getTaskExpertOption, FALLBACK_TASK_EXPERT_OPTIONS, TASK_EXPERT_OPTIONS } from '../task-editor-ui-model'

describe('TaskEditor Agent 专家 UI', () => {
  test('回退目录含通用软件专家与完整内置 slug', () => {
    expect(FALLBACK_TASK_EXPERT_OPTIONS.map((expert) => expert.id)).toContain('general')
    expect(FALLBACK_TASK_EXPERT_OPTIONS[0]?.label).toBe('通用软件专家')
    expect(TASK_EXPERT_OPTIONS).toBe(FALLBACK_TASK_EXPERT_OPTIONS)
    expect(FALLBACK_TASK_EXPERT_OPTIONS).toHaveLength(10)
  })

  test('未知专家回退到通用软件专家', () => {
    expect(getTaskExpertOption('missing').id).toBe('general')
    expect(getTaskExpertOption('missing').label).toBe('通用软件专家')
  })

  test('可在自定义列表中解析', () => {
    expect(getTaskExpertOption('architect', [
      { id: 'architect', label: '软件架构师' },
    ]).label).toBe('软件架构师')
  })
})
