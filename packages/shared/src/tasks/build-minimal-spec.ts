import { slugify } from '../utils/slug.ts'
import { TaskSpecSchema, type TaskSpec } from './schema.ts'

export interface BuildMinimalTaskSpecInput {
  title: string
  description: string
  acceptanceCriteria?: string
  sources?: string[]
  skills?: string[]
  llmConnection?: string
  model?: string
  workingDirectory?: string
  projectId?: string
}

/**
 * 从简单字段构建单节点 TaskSpec：description 同时作为 goal 与唯一节点的 prompt。
 * 节点 kind 不显式设置，走 schema 默认值 'session'（与 task-spec-form.ts 的 buildSpec
 * 对手写节点的既有约定一致）。供 create_task Agent 工具使用；不支持多节点 DAG——
 * 需要编排多个节点时应走现有 TaskEditor 手动/生成流程，不是本函数的场景。
 */
export function buildMinimalTaskSpec(input: BuildMinimalTaskSpecInput): TaskSpec {
  const title = input.title.trim()
  const description = input.description.trim()
  const acceptanceCriteria = input.acceptanceCriteria?.trim()
  const defaults: Record<string, unknown> = {}
  if (input.model) defaults.model = input.model
  if (input.llmConnection) defaults.llmConnection = input.llmConnection

  return TaskSpecSchema.parse({
    id: slugify(title) || 'untitled-task',
    title: title || 'Untitled task',
    goal: description || title || 'Untitled task',
    ...(acceptanceCriteria ? { acceptance_criteria: acceptanceCriteria } : {}),
    ...(input.projectId ? { project: input.projectId } : {}),
    ...(input.workingDirectory ? { cwd: input.workingDirectory } : {}),
    ...(input.sources?.length ? { sources: input.sources } : {}),
    ...(input.skills?.length ? { skills: input.skills } : {}),
    ...(Object.keys(defaults).length ? { defaults } : {}),
    nodes: [{ id: 'main', prompt: description || title || 'Untitled task' }],
  })
}
