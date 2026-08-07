import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta, TaskGeneratedEventPayload } from '@myyoda/shared'
import { TaskSpecSchema } from '@myyoda/shared/tasks/schema'
import {
  buildTaskEditorSubmission,
  createTaskEditorDraft,
  resolveGeneratedTaskEvent,
  resolveTaskEditorTarget,
  taskSpecToEditorDraft,
  validateTaskDraft,
} from '../task-editor-model'
import type { KanbanItem, TaskEditorTarget } from '../types'

function createItem(session: AgentSessionMeta): KanbanItem {
  return {
    id: session.id,
    title: session.title,
    columnId: session.kanbanColumn ?? 'todo',
    session,
    project: null,
    subtasks: [],
  }
}

const session: AgentSessionMeta = {
  id: 'session-1',
  title: '发布任务',
  createdAt: 1,
  updatedAt: 2,
}

describe('resolveTaskEditorTarget', () => {
  test('普通会话（无 taskSlug）：编辑目标不带 taskSlug，带上当前标题/模型供起草新表单', () => {
    expect(resolveTaskEditorTarget(createItem(session))).toEqual({
      mode: 'edit',
      sessionId: 'session-1',
      initialTitle: '发布任务',
    })
  })

  test('spec-backed 卡片：编辑目标带上既有 taskSlug（编辑器据此读取既有 spec）', () => {
    expect(resolveTaskEditorTarget(createItem({ ...session, taskSlug: 'release-task', modelId: 'model-a' }))).toEqual({
      mode: 'edit',
      sessionId: 'session-1',
      taskSlug: 'release-task',
      initialTitle: '发布任务',
      initialModel: 'model-a',
    })
  })
})

describe('TaskEditor draft and submission', () => {
  test('create task 缺少 projectId 时作为 Workspace Task 通过校验', () => {
    expect(validateTaskDraft({
      title: '发布',
      projectId: '',
      subtasks: [{ prompt: '做发布' }],
    }).ok).toBe(true)
  })

  test('从 spec 预填项目、路由、权限和依赖关系', () => {
    const spec = TaskSpecSchema.parse({
      id: 'release-task',
      title: '发布任务',
      goal: '完成发布',
      project: 'project-a',
      defaults: { model: 'model-a', llmConnection: 'connection-a', permissionMode: 'ask' },
      nodes: [
        { id: 'build', title: '构建', prompt: '构建产物' },
        { id: 'verify', title: '验证', prompt: '验证产物', depends_on: ['build'] },
      ],
    })

    const draft = taskSpecToEditorDraft(spec, { mode: 'edit', sessionId: 'session-1', taskSlug: 'release-task' }, 'fallback')

    expect(draft.projectId).toBe('project-a')
    expect(draft.orchModel).toBe('model-a')
    expect(draft.orchConnection).toBe('connection-a')
    expect(draft.permissionMode).toBe('ask')
    expect(draft.subtasks[1]?.dependsOn[0]).toBe(draft.subtasks[0]?.uid)
  })

  test('从渐进式 Composer 进入完整编辑器时保留标题、目标与 Project 归属', () => {
    const createTarget: TaskEditorTarget = {
      mode: 'create',
      initialProjectId: 'project-a',
      initialTitle: '发布准备',
      initialGoal: '完成构建并验证产物',
    }

    const draft = createTaskEditorDraft(createTarget, 'model-a')

    expect(draft.title).toBe('发布准备')
    expect(draft.goal).toBe('完成构建并验证产物')
    expect(draft.projectId).toBe('project-a')
  })

  test('创建时采用生成草稿，编辑时绑定原 session 并固定 slug', () => {
    const createTarget: TaskEditorTarget = { mode: 'create', initialProjectId: 'project-a' }
    const draft = createTaskEditorDraft(createTarget, 'model-a')
    draft.title = '发布任务'
    draft.goal = '完成发布'
    draft.subtasks = [{ uid: 'node-row', title: '执行', prompt: '执行发布', dependsOn: [] }]

    const created = buildTaskEditorSubmission(draft, createTarget, 'draft-session', new Map())
    expect(created.request).toEqual(expect.objectContaining({ orchestratorSessionId: 'draft-session' }))

    const editTarget: TaskEditorTarget = { mode: 'edit', sessionId: 'session-1', taskSlug: 'existing-slug' }
    const edited = buildTaskEditorSubmission(draft, editTarget, null, new Map())
    expect(edited.request).toEqual(expect.objectContaining({ attachToExistingSessionId: 'session-1' }))
    expect(JSON.parse(edited.request.yaml).id).toBe('existing-slug')
  })

  test('编辑普通会话（无 taskSlug）：草稿用 initialTitle/initialModel 起草，提交生成新 slug 并绑定回同一会话', () => {
    const promoteTarget: TaskEditorTarget = {
      mode: 'edit',
      sessionId: 'session-1',
      initialTitle: '临时聊了几句',
      initialModel: 'model-b',
    }
    const draft = createTaskEditorDraft(promoteTarget, 'fallback-model')
    expect(draft.title).toBe('临时聊了几句')
    expect(draft.orchModel).toBe('model-b')

    draft.goal = '把这个会话变成正式任务'
    draft.projectId = 'project-a'
    draft.subtasks = [{ uid: 'node-row', title: '执行', prompt: '继续推进', dependsOn: [] }]

    const submission = buildTaskEditorSubmission(draft, promoteTarget, null, new Map())
    expect(submission.request).toEqual(expect.objectContaining({ attachToExistingSessionId: 'session-1' }))
    // 没有 fixedId：buildSpec 从标题生成一个新 slug，而不是报错或留空。
    expect(JSON.parse(submission.request.yaml).id).toBeTruthy()
    expect(JSON.parse(submission.request.yaml).id).not.toBe('existing-slug')
  })
})

describe('resolveGeneratedTaskEvent', () => {
  const generatedSpec = {
    id: 'generated-task',
    title: 'Generated Task',
    goal: '生成任务',
    runner: 'conduct' as const,
    nodes: [{ id: 'main', kind: 'session' as const, prompt: '执行任务' }],
  }

  const saved: TaskGeneratedEventPayload = {
    kind: 'tasks:generated',
    workspaceId: 'workspace-a',
    orchestratorSessionId: 'draft-session',
    status: 'saved',
    slug: 'generated-task',
    spec: generatedSpec,
  }

  test('只接收当前 workspace 和生成会话的结果', () => {
    expect(resolveGeneratedTaskEvent(saved, 'workspace-b', 'draft-session')).toEqual({ kind: 'ignore' })
    expect(resolveGeneratedTaskEvent(saved, 'workspace-a', 'other-session')).toEqual({ kind: 'ignore' })
    expect(resolveGeneratedTaskEvent(saved, 'workspace-a', 'draft-session')).toEqual({ kind: 'apply', slug: 'generated-task', spec: generatedSpec })
  })

  test('saved 事件缺少 spec 时返回可展示错误，避免回读未确认 task.yaml', () => {
    const missingSpec: TaskGeneratedEventPayload = {
      kind: 'tasks:generated',
      workspaceId: 'workspace-a',
      orchestratorSessionId: 'draft-session',
      status: 'saved',
      slug: 'generated-task',
    }

    expect(resolveGeneratedTaskEvent(missingSpec, 'workspace-a', 'draft-session')).toEqual({
      kind: 'error',
      message: '生成结果缺少任务定义，请重试',
    })
  })

  test('无效生成结果返回可展示错误', () => {
    const invalid: TaskGeneratedEventPayload = {
      ...saved,
      status: 'invalid',
      slug: undefined,
      errors: [{ path: 'nodes.0.prompt', message: 'prompt 不能为空' }],
    }

    expect(resolveGeneratedTaskEvent(invalid, 'workspace-a', 'draft-session')).toEqual({
      kind: 'error',
      message: 'nodes.0.prompt: prompt 不能为空',
    })
  })
})
