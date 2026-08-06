import { z } from 'zod';

export const TASK_RECORD_SCHEMA_VERSION = 1 as const;

export const TaskWorkflowSchema = z.enum([
  'todo',
  'in-progress',
  'needs-review',
  'done',
  'cancelled',
]);

export type TaskWorkflow = z.infer<typeof TaskWorkflowSchema>;

export interface TaskMetadataPatch {
  title?: string;
  archived?: boolean;
  labelIds?: string[];
  /** 独立于 workflow 的看板列位置（项目自定义列时使用），与状态徽标解耦 */
  kanbanColumn?: string;
  expectedRevision?: number;
}

export const TaskRecordSchema = z.object({
  schemaVersion: z.literal(TASK_RECORD_SCHEMA_VERSION),
  taskId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'task slug 必须是小写 URL-safe slug'),
  revision: z.number().int().positive(),
  workflow: TaskWorkflowSchema,
  /** 独立于 workflow 的看板列位置（可选，无自定义列时缺省，列即状态） */
  kanbanColumn: z.string().min(1).optional(),
  labelIds: z.array(z.string().min(1)),
  orchestratorSessionId: z.string().min(1).optional(),
  archivedAt: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export type TaskRecord = z.infer<typeof TaskRecordSchema>;

/** Renderer-facing TaskRepository projection. The stable Task record is authoritative; spec supplies display content and optional Project scope. */
export interface TaskAggregateSummary {
  taskId: string;
  taskSlug: string;
  title: string;
  goal?: string;
  scope: { kind: 'workspace' } | { kind: 'project'; projectId: string };
  workflow: TaskWorkflow;
  kanbanColumn?: string;
  revision?: number;
  labelIds: string[];
  orchestratorSessionId?: string;
  archivedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  runCount: number;
  latestRunId?: string;
  legacyIdentity: boolean;
  health: 'ready' | 'warning' | 'error';
  diagnostics: Array<{
    code: string;
    severity: 'warning' | 'error';
    message: string;
  }>;
}

export type TaskRecordLoadResult =
  | { kind: 'missing' }
  | { kind: 'valid'; record: TaskRecord }
  | { kind: 'invalid'; message: string }
  | { kind: 'unsupported'; schemaVersion: number };
