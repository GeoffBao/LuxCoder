import { z } from 'zod';

export const TASK_RECORD_SCHEMA_VERSION = 1 as const;

/** 任务业务类型（对齐 workbuddy 设计的列内二级分组） */
export const TASK_TYPES = ['activity', 'requirement', 'bug', 'task', 'checklist', 'hardware'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  activity: '活动',
  requirement: '需求',
  bug: '缺陷',
  task: '任务',
  checklist: 'Checklist',
  hardware: '硬件单',
};

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
  expectedRevision?: number;
}

export const TaskRecordSchema = z.object({
  schemaVersion: z.literal(TASK_RECORD_SCHEMA_VERSION),
  taskId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'task slug 必须是小写 URL-safe slug'),
  revision: z.number().int().positive(),
  workflow: TaskWorkflowSchema,
  /** 业务类型：activity/requirement/bug/task/checklist/hardware；旧记录缺省 undefined，读取时用 record.type ?? 'task' 兜底 */
  type: z.enum(TASK_TYPES).optional(),
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
  /** 业务类型：activity/requirement/bug/task/checklist/hardware（旧任务缺省） */
  type?: TaskType;
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
