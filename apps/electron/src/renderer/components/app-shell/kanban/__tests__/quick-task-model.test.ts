import { describe, expect, test } from 'bun:test'
import { TaskSpecSchema } from '@myyoda/shared/tasks/schema'
import {
  buildQuickTaskRequest,
  submitQuickTask,
  toTaskEditorTarget,
  type QuickTaskDraft,
} from '../quick-task-model'

const draft: QuickTaskDraft = {
  title: '发布准备',
  goal: '完成构建并验证发布产物',
  projectId: 'project-a',
}

describe('buildQuickTaskRequest', () => {
  test('生成可由共享 schema 校验的最小任务 spec', () => {
    const request = buildQuickTaskRequest(draft, 'quick-42')
    const spec = TaskSpecSchema.parse(JSON.parse(request.yaml))

    expect(spec.id).toBe('quick-42')
    expect(spec.title).toBe('发布准备')
    expect(spec.project).toBe('project-a')
    expect(spec.goal).toBe('完成构建并验证发布产物')
    expect(spec.nodes).toEqual([
      expect.objectContaining({ id: 'execute', prompt: '完成构建并验证发布产物' }),
    ])
  })

  test('projectId 可空以创建 Workspace Task；标题 / 目标仍必填', () => {
    const workspaceSpec = TaskSpecSchema.parse(JSON.parse(buildQuickTaskRequest({ ...draft, projectId: ' ' }, 'quick-42').yaml))
    expect(workspaceSpec.project).toBeUndefined()
    expect(() => buildQuickTaskRequest({ ...draft, title: ' ' }, 'quick-42')).toThrow('请输入任务标题')
    expect(() => buildQuickTaskRequest({ ...draft, goal: ' ' }, 'quick-42')).toThrow('请输入任务目标')
  })
})

describe('toTaskEditorTarget', () => {
  test('把 Composer 草稿完整带入 canonical TaskEditor', () => {
    expect(toTaskEditorTarget({
      title: ' 发布准备 ',
      goal: '',
      projectId: 'project-a',
    })).toEqual({
      mode: 'create',
      initialProjectId: 'project-a',
      initialTitle: '发布准备',
      initialGoal: '发布准备',
    })
  })

  test('Workspace Task 不写入 project identity', () => {
    expect(toTaskEditorTarget({ title: '整理资料', goal: '输出清单', projectId: '' })).toEqual({
      mode: 'create',
      initialTitle: '整理资料',
      initialGoal: '输出清单',
    })
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
        return { taskId: 'task-1', slug: 'release', orchestratorSessionId: 'session-1', valid: true as const }
      },
    })

    expect(TaskSpecSchema.safeParse(JSON.parse(submittedYaml)).success).toBe(true)
    expect(result).toEqual({
      ok: true,
      draft: { title: '', goal: '', projectId: '' },
      created: { taskId: 'task-1', slug: 'release', orchestratorSessionId: 'session-1', valid: true },
    })
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
