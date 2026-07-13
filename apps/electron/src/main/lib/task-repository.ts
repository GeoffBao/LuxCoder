import { z } from 'zod'
import type { NodeOutput } from '../../../../../packages/shared/src/tasks/refs.ts'
import type { TaskSpec } from '../../../../../packages/shared/src/tasks/schema.ts'
import type { ValidationResult } from '../../../../../packages/shared/src/tasks/validate.ts'
import {
  appendRunLog as appendRunLogInStorage,
  listRunIds,
  listTaskSlugs,
  loadTaskSpec,
  readNodeOutput,
  readRunLog,
  readRunSpecSnapshot,
  rehydrateNodeStates,
  saveTaskSpec,
  writeNodeOutput as writeNodeOutputInStorage,
  writeRunSpecSnapshot as writeRunSpecSnapshotInStorage,
  type RehydratedNodeState,
  type RunLogEntry,
} from '../../../../../packages/shared/src/tasks/storage.ts'
import { validateTaskInput } from '../../../../../packages/shared/src/tasks/validate.ts'
import { getAgentWorkspace } from './agent-workspace-manager'
import { getAgentWorkspacePath } from './config-paths'

const WorkspaceIdSchema = z.string().min(1, 'workspaceId 必填')
const TaskSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'task slug 必须是 URL-safe slug')
const RunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'runId 必须是安全的路径片段')

export interface TaskRunState {
  taskSlug: string
  runId: string
  spec: TaskSpec | null
  log: RunLogEntry[]
  nodeStates: Record<string, RehydratedNodeState>
  nodeOutputs: Record<string, NodeOutput>
}

export interface TaskRepositoryOptions {
  resolveWorkspaceRoot?: (workspaceId: string) => string
}

export interface TaskValidationResult extends ValidationResult {
  spec?: TaskSpec
}

function resolveWorkspaceRootFromManager(workspaceId: string): string {
  const workspace = getAgentWorkspace(workspaceId)
  if (!workspace) {
    throw new Error(`工作区不存在: ${workspaceId}`)
  }
  return getAgentWorkspacePath(workspace.slug)
}

export class TaskRepository {
  constructor(private readonly options: TaskRepositoryOptions = {}) {}

  private resolveWorkspaceRoot(workspaceId: string): string {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId)
    return (this.options.resolveWorkspaceRoot ?? resolveWorkspaceRootFromManager)(parsedWorkspaceId)
  }

  private parseTaskSlug(taskSlug: string): string {
    return TaskSlugSchema.parse(taskSlug)
  }

  private parseRunId(runId: string): string {
    return RunIdSchema.parse(runId)
  }

  listTasks(workspaceId: string): string[] {
    return listTaskSlugs(this.resolveWorkspaceRoot(workspaceId))
  }

  getTask(workspaceId: string, taskSlug: string): TaskValidationResult | null {
    return loadTaskSpec(this.resolveWorkspaceRoot(workspaceId), this.parseTaskSlug(taskSlug))
  }

  validateTask(input: unknown): TaskValidationResult {
    return validateTaskInput(input)
  }

  saveTask(workspaceId: string, spec: TaskSpec): TaskSpec {
    saveTaskSpec(this.resolveWorkspaceRoot(workspaceId), spec)
    const loaded = this.getTask(workspaceId, spec.id)
    if (!loaded?.spec || !loaded.valid) {
      throw new Error(`任务保存后重读失败: ${spec.id}`)
    }
    return loaded.spec
  }

  listRuns(workspaceId: string, taskSlug: string): string[] {
    return listRunIds(this.resolveWorkspaceRoot(workspaceId), this.parseTaskSlug(taskSlug))
  }

  appendRunLog(workspaceId: string, taskSlug: string, runId: string, entry: RunLogEntry): void {
    appendRunLogInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseTaskSlug(taskSlug),
      this.parseRunId(runId),
      entry,
    )
  }

  writeRunSpecSnapshot(workspaceId: string, taskSlug: string, runId: string, spec: TaskSpec): void {
    writeRunSpecSnapshotInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseTaskSlug(taskSlug),
      this.parseRunId(runId),
      spec,
    )
  }

  writeNodeOutput(workspaceId: string, taskSlug: string, runId: string, nodeId: string, output: NodeOutput): void {
    writeNodeOutputInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseTaskSlug(taskSlug),
      this.parseRunId(runId),
      nodeId,
      output,
    )
  }

  getRunState(workspaceId: string, taskSlug: string, runId: string): TaskRunState | null {
    const workspaceRoot = this.resolveWorkspaceRoot(workspaceId)
    const slug = this.parseTaskSlug(taskSlug)
    const parsedRunId = this.parseRunId(runId)
    const spec = readRunSpecSnapshot(workspaceRoot, slug, parsedRunId)
      ?? loadTaskSpec(workspaceRoot, slug)?.spec
      ?? null
    const log = readRunLog(workspaceRoot, slug, parsedRunId)

    if (spec === null && log.length === 0) {
      return null
    }

    const nodeIds = spec?.nodes.map((node) => node.id) ?? []
    const nodeOutputs: Record<string, NodeOutput> = {}
    const nodeStates = rehydrateNodeStates(nodeIds, log, (nodeId) => {
      const output = readNodeOutput(workspaceRoot, slug, parsedRunId, nodeId)
      if (output) {
        nodeOutputs[nodeId] = output
      }
      return output
    })

    return {
      taskSlug: slug,
      runId: parsedRunId,
      spec,
      log,
      nodeStates,
      nodeOutputs,
    }
  }
}
