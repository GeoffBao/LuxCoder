import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta, TaskGeneratedEventPayload } from '@luxcoder/shared'
import { TaskSpecSchema } from '@luxcoder/shared/tasks/schema'
import {
  buildTaskEditorSubmission,
  createTaskEditorDraft,
  resolveGeneratedTaskEvent,
  resolveKanbanItemOpen,
  taskSpecToEditorDraft,
} from '../task-editor-model'
import type { KanbanItem, TaskEditorTarget } from '../types'

function createItem(session: AgentSessionMeta): KanbanItem {
  return {
    id: session.id,
    title: session.title,
    columnId: session.kanbanColumn ?? 'inbox',
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

describe('resolveKanbanItemOpen', () => {
  test('普通会话打开既有会话视图', () => {
    expect(resolveKanbanItemOpen(createItem(session))).toEqual({ kind: 'session', sessionId: 'session-1' })
  })

  test('spec-backed 卡片打开绑定原会话的 TaskEditor', () => {
    expect(resolveKanbanItemOpen(createItem({ ...session, taskSlug: 'release-task' }))).toEqual({
      kind: 'editor',
      target: { mode: 'edit', sessionId: 'session-1', taskSlug: 'release-task' },
    })
  })
})

describe('TaskEditor draft and submission', () => {
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
})

describe('resolveGeneratedTaskEvent', () => {
  const saved: TaskGeneratedEventPayload = {
    kind: 'tasks:generated',
    workspaceId: 'workspace-a',
    orchestratorSessionId: 'draft-session',
    status: 'saved',
    slug: 'generated-task',
  }

  test('只接收当前 workspace 和生成会话的结果', () => {
    expect(resolveGeneratedTaskEvent(saved, 'workspace-b', 'draft-session')).toEqual({ kind: 'ignore' })
    expect(resolveGeneratedTaskEvent(saved, 'workspace-a', 'other-session')).toEqual({ kind: 'ignore' })
    expect(resolveGeneratedTaskEvent(saved, 'workspace-a', 'draft-session')).toEqual({ kind: 'load', slug: 'generated-task' })
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
