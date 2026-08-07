import { TaskSpecSchema } from '@myyoda/shared/tasks/schema'
import { slugify } from '@myyoda/shared/utils'
import type { TaskEditorTarget } from './types'

export interface QuickTaskDraft {
  title: string
  goal: string
  projectId: string
}

export interface QuickTaskCreateRequest {
  yaml: string
}

export interface SubmitQuickTaskInput<TResult = unknown> {
  draft: QuickTaskDraft
  fallbackId: string
  create: (request: QuickTaskCreateRequest) => Promise<TResult>
}

export type SubmitQuickTaskResult<TResult = unknown> =
  | { ok: true; draft: QuickTaskDraft; created: TResult }
  | { ok: false; draft: QuickTaskDraft; error: string }

export const EMPTY_QUICK_TASK_DRAFT: QuickTaskDraft = { title: '', goal: '', projectId: '' }

/** 将轻量输入平滑升级到唯一完整 TaskEditor，不能丢失用户已输入内容。 */
export function toTaskEditorTarget(draft: QuickTaskDraft): TaskEditorTarget {
  const title = draft.title.trim()
  const goal = draft.goal.trim() || title
  const projectId = draft.projectId.trim()
  return {
    mode: 'create',
    ...(projectId ? { initialProjectId: projectId } : {}),
    ...(title ? { initialTitle: title } : {}),
    ...(goal ? { initialGoal: goal } : {}),
  }
}

export function buildQuickTaskRequest(draft: QuickTaskDraft, fallbackId: string): QuickTaskCreateRequest {
  const title = draft.title.trim()
  const goal = draft.goal.trim()
  const projectId = draft.projectId.trim()
  if (!title) throw new Error('请输入任务标题')
  if (!goal) throw new Error('请输入任务目标')

  const spec = TaskSpecSchema.parse({
    id: slugify(title) || slugify(fallbackId) || 'quick-task',
    title,
    goal,
    ...(projectId ? { project: projectId } : {}),
    nodes: [{ id: 'execute', title: '执行任务', prompt: goal }],
  })
  // JSON 是 YAML 1.2 的合法子集，避免 renderer 额外引入序列化依赖。
  return { yaml: JSON.stringify(spec, null, 2) }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '创建任务失败'
}

export async function submitQuickTask<TResult>(input: SubmitQuickTaskInput<TResult>): Promise<SubmitQuickTaskResult<TResult>> {
  try {
    const request = buildQuickTaskRequest(input.draft, input.fallbackId)
    const created = await input.create(request)
    return { ok: true, draft: EMPTY_QUICK_TASK_DRAFT, created }
  } catch (cause) {
    return { ok: false, draft: input.draft, error: toErrorMessage(cause) }
  }
}
