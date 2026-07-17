import { describe, expect, test } from 'bun:test'
import { TaskSpecSchema } from '@luxagents/shared/tasks/schema'
import {
  buildQuickTaskRequest,
  submitQuickTask,
  type QuickTaskDraft,
} from '../quick-task-model'

const draft: QuickTaskDraft = {
  title: '发布准备',
  goal: '完成构建并验证发布产物',
}

describe('buildQuickTaskRequest', () => {
  test('生成可由共享 schema 校验的最小任务 spec', () => {
    const request = buildQuickTaskRequest(draft, 'quick-42')
    const spec = TaskSpecSchema.parse(JSON.parse(request.yaml))

    expect(spec.id).toBe('quick-42')
    expect(spec.title).toBe('发布准备')
    expect(spec.goal).toBe('完成构建并验证发布产物')
    expect(spec.nodes).toEqual([
      expect.objectContaining({ id: 'execute', prompt: '完成构建并验证发布产物' }),
    ])
  })

  test('标题或目标为空时拒绝提交', () => {
    expect(() => buildQuickTaskRequest({ title: ' ', goal: draft.goal }, 'quick-42')).toThrow('请输入任务标题')
    expect(() => buildQuickTaskRequest({ title: draft.title, goal: ' ' }, 'quick-42')).toThrow('请输入任务目标')
  })
})

describe('submitQuickTask', () => {
  test('创建成功后清空草稿', async () => {
    let submittedYaml = ''
    const result = await submitQuickTask({
      draft,
      fallbackId: 'quick-42',
      create: async (request) => {
        submittedYaml = request.yaml
      },
    })

    expect(TaskSpecSchema.safeParse(JSON.parse(submittedYaml)).success).toBe(true)
    expect(result).toEqual({ ok: true, draft: { title: '', goal: '' } })
  })

  test('创建失败时保留用户输入并返回错误', async () => {
    const result = await submitQuickTask({
      draft,
      fallbackId: 'quick-42',
      create: async () => {
        throw new Error('磁盘写入失败')
      },
    })

    expect(result).toEqual({ ok: false, draft, error: '磁盘写入失败' })
  })
})
