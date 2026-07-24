import { TaskSpecSchema } from '@luxcoder/shared/tasks/schema'
import { slugify } from '@luxcoder/shared/utils'

export interface QuickTaskDraft {
  title: string
  goal: string
  projectId: string
}

export interface QuickTaskCreateRequest {
  yaml: string
}

export interface SubmitQuickTaskInput {
  draft: QuickTaskDraft
  fallbackId: string
  create: (request: QuickTaskCreateRequest) => Promise<unknown>
}

export type SubmitQuickTaskResult =
  | { ok: true; draft: QuickTaskDraft }
  | { ok: false; draft: QuickTaskDraft; error: string }

export const EMPTY_QUICK_TASK_DRAFT: QuickTaskDraft = { title: '', goal: '', projectId: '' }

export function buildQuickTaskRequest(draft: QuickTaskDraft, fallbackId: string): QuickTaskCreateRequest {
  const title = draft.title.trim()
  const goal = draft.goal.trim()
  const projectId = draft.projectId.trim()
  if (!projectId) throw new Error('请选择项目')
  if (!title) throw new Error('请输入任务标题')
  if (!goal) throw new Error('请输入任务目标')

  const spec = TaskSpecSchema.parse({
    id: slugify(title) || slugify(fallbackId) || 'quick-task',
    title,
    goal,
    project: projectId,
    nodes: [{ id: 'execute', title: '执行任务', prompt: goal }],
  })
  // JSON 是 YAML 1.2 的合法子集，避免 renderer 额外引入序列化依赖。
  return { yaml: JSON.stringify(spec, null, 2) }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '创建任务失败'
}

export async function submitQuickTask(input: SubmitQuickTaskInput): Promise<SubmitQuickTaskResult> {
  try {
    const request = buildQuickTaskRequest(input.draft, input.fallbackId)
    await input.create(request)
    return { ok: true, draft: EMPTY_QUICK_TASK_DRAFT }
  } catch (cause) {
    return { ok: false, draft: input.draft, error: toErrorMessage(cause) }
  }
}
