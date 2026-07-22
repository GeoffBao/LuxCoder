import type { TaskGeneratedEventPayload } from '@luxcodex/shared'
import type { TaskSpec } from '@luxcodex/shared/tasks/schema'
import { buildSpec, specToSubtasks, type SpecForm } from './task-spec-form'
import type { KanbanItem, TaskEditorTarget } from './types'

export interface TaskEditorDraft extends SpecForm {}

export interface TaskEditorCreateRequest {
  yaml: string
  orchestratorSessionId?: string
  attachToExistingSessionId?: string
}

export interface TaskEditorSubmission {
  spec: TaskSpec
  request: TaskEditorCreateRequest
}

export type KanbanItemOpenAction =
  | { kind: 'session'; sessionId: string }
  | { kind: 'editor'; target: TaskEditorTarget }

export type GeneratedTaskEventAction =
  | { kind: 'ignore' }
  | { kind: 'load'; slug: string }
  | { kind: 'error'; message: string }

export function resolveKanbanItemOpen(item: KanbanItem): KanbanItemOpenAction {
  if (!item.session.taskSlug) return { kind: 'session', sessionId: item.session.id }
  return {
    kind: 'editor',
    target: { mode: 'edit', sessionId: item.session.id, taskSlug: item.session.taskSlug },
  }
}

export function createTaskEditorDraft(
  target: TaskEditorTarget,
  defaultModel: string,
  initialExpertId?: string,
): TaskEditorDraft {
  return {
    title: '',
    goal: '',
    projectId: target.mode === 'create' ? target.initialProjectId ?? '' : '',
    orchModel: defaultModel,
    permissionMode: 'allow-all',
    ...(initialExpertId ? { expertId: initialExpertId } : {}),
    subtasks: [],
  }
}

export function taskSpecToEditorDraft(
  spec: TaskSpec,
  target: TaskEditorTarget,
  defaultModel: string,
): TaskEditorDraft {
  return {
    title: spec.title,
    goal: spec.goal,
    acceptanceCriteria: spec.acceptance_criteria,
    maxRepairs: spec.max_iterations,
    projectId: spec.project ?? (target.mode === 'create' ? target.initialProjectId ?? '' : ''),
    boundProjectId: spec.project,
    orchModel: spec.defaults?.model ?? defaultModel,
    orchConnection: spec.defaults?.llmConnection,
    permissionMode: spec.defaults?.permissionMode ?? 'allow-all',
    expertId: spec.defaults?.expertId,
    subtasks: specToSubtasks(spec.nodes),
    cwd: spec.cwd,
    sourceSlugs: spec.sources,
    skillSlugs: spec.skills,
    fixedId: target.mode === 'edit' ? target.taskSlug : undefined,
  }
}

export function buildTaskEditorSubmission(
  draft: TaskEditorDraft,
  target: TaskEditorTarget,
  generatedDraftSessionId: string | null,
  modelToConnection: Map<string, string>,
): TaskEditorSubmission {
  const spec = buildSpec(
    { ...draft, fixedId: target.mode === 'edit' ? target.taskSlug : draft.fixedId },
    modelToConnection,
  )
  return {
    spec,
    request: {
      yaml: JSON.stringify(spec, null, 2),
      ...(target.mode === 'edit'
        ? { attachToExistingSessionId: target.sessionId }
        : generatedDraftSessionId
          ? { orchestratorSessionId: generatedDraftSessionId }
          : {}),
    },
  }
}

export function resolveGeneratedTaskEvent(
  event: TaskGeneratedEventPayload,
  workspaceId: string,
  pendingSessionId: string | null,
): GeneratedTaskEventAction {
  if (event.workspaceId !== workspaceId || event.orchestratorSessionId !== pendingSessionId) {
    return { kind: 'ignore' }
  }
  if (event.status === 'saved' && event.slug) return { kind: 'load', slug: event.slug }
  const issue = event.errors?.[0]
  const message = issue
    ? `${issue.path ? `${issue.path}: ` : ''}${issue.message}`
    : event.status === 'invalid'
      ? '生成的任务定义无效'
      : '生成任务失败'
  return { kind: 'error', message }
}
