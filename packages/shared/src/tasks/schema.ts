/**
 * task.yaml schema — 声明式 DAG Spec 的 Zod Schema
 *
 * 参照 OSS: packages/shared/src/tasks/schema.ts
 * 适配: PermissionMode 类型改为从 PERMISSION_MODES 数组推断（替代 OSS 的 mode-types.ts 导入）
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// 枚举常量
// ---------------------------------------------------------------------------

export const PERMISSION_MODES = ['safe', 'ask', 'allow-all'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const NODE_KINDS = [
  'session', 'orchestrator',
  'route', 'parallel', 'map', 'loop', 'approval',
  'synthesize', 'verify', 'judge', 'filter', 'aggregate', 'finally',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const AGGREGATE_MODES = ['concat', 'vote', 'majority', 'filter', 'synthesize'] as const;
export const TRIGGER_RULES = ['all_success', 'none_failed_min_one_success', 'one_success', 'all_done'] as const;
export const PARAM_TYPES = ['string', 'number', 'boolean', 'enum', 'json', 'text'] as const;
export const OUTPUT_KINDS = ['param', 'artifact'] as const;
export const RETRY_WHEN = ['error', 'empty', 'invalid'] as const;
export const CACHE_MODES = ['pure', 'off'] as const;
export const TASK_RUNNERS = ['conduct', 'orchestrate'] as const;

export const DEFAULT_REPAIR_ATTEMPTS = 3;
export const MAX_REPAIR_ATTEMPTS_CAP = 10;

// ---------------------------------------------------------------------------
// 基础验证
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const slug = (label: string) =>
  z.string().regex(SLUG_RE, `${label} 必须是小写 slug（a-z, 0-9, 连字符；不能以连字符开头）`);

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ident = (label: string) =>
  z.string().regex(IDENT_RE, `${label} 必须是标识符（字母、数字、下划线；不能以数字开头）`);

// ---------------------------------------------------------------------------
// 子 Schema
// ---------------------------------------------------------------------------

export const InputRefSchema = z.union([
  z.string(),
  z.object({ from: z.string().min(1), summarize: z.boolean().optional() }),
]);

export const OutputDeclSchema = z.object({
  name: ident('output name'),
  kind: z.enum(OUTPUT_KINDS).optional(),
  type: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

export const LoopSchema = z.object({
  until: z.string().min(1),
  max: z.number().int().positive(),
  else: z.string().optional(),
  carry: z.string().optional(),
});

export const RetrySchema = z.object({
  limit: z.number().int().min(0),
  backoff: z.object({
    base: z.number().positive().optional(),
    factor: z.number().positive().optional(),
    max: z.number().positive().optional(),
  }).optional(),
  when: z.enum(RETRY_WHEN).optional(),
});

export const TaskParamSchema = z.object({
  name: ident('param name'),
  type: z.enum(PARAM_TYPES).optional(),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
});

export const TaskDefaultsSchema = z.object({
  model: z.string().min(1).optional(),
  llmConnection: z.string().min(1).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  /** Agent 专家 slug；Kanban TaskRunner 注入 IDENTITY/SOUL/RULES + 合并 skill 引用 */
  expertId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// 节点 Schema
// ---------------------------------------------------------------------------

const TaskNodeObject = z.object({
  id: slug('node id'),
  title: z.string().min(1).optional(),
  prompt: z.string().optional(),
  kind: z.enum(NODE_KINDS).default('session'),

  model: z.string().min(1).optional(),
  llmConnection: z.string().min(1).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  labels: z.array(z.string()).optional(),
  status: z.string().optional(),

  depends_on: z.array(slug('depends_on entry')).optional(),
  inputs: z.record(z.string(), InputRefSchema).optional(),
  outputs: z.array(OutputDeclSchema).optional(),

  // 控制流（P4 执行，当前仅解析）
  when: z.string().optional(),
  trigger: z.enum(TRIGGER_RULES).optional(),
  replicas: z.number().int().positive().optional(),
  aggregate: z.enum(AGGREGATE_MODES).optional(),
  loop: LoopSchema.optional(),
  for_each: z.string().optional(),
  max_parallel: z.number().int().positive().optional(),
  retry: RetrySchema.optional(),
  timeout: z.number().positive().optional(),
  cache: z.enum(CACHE_MODES).optional(),
  approval: z.boolean().optional(),
});

/** 节点 Schema，带 type→kind 别名兼容预处理 */
export const TaskNodeSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (r.kind === undefined && typeof r.type === 'string') {
      const { type: _legacyType, ...rest } = r;
      return { ...rest, kind: r.type };
    }
  }
  return raw;
}, TaskNodeObject);

// ---------------------------------------------------------------------------
// 任务 Schema
// ---------------------------------------------------------------------------

export const TaskSpecSchema = z
  .object({
    id: slug('task id'),
    title: z.string().min(1),
    goal: z.string().min(1),
    acceptance_criteria: z.string().min(1).optional(),
    project: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    runner: z.enum(TASK_RUNNERS).default('conduct'),
    sources: z.array(z.string().min(1)).optional(),
    skills: z.array(z.string().min(1)).optional(),
    defaults: TaskDefaultsSchema.optional(),
    params: z.array(TaskParamSchema).optional(),
    token_budget: z.number().int().positive().optional(),
    max_parallel: z.number().int().positive().optional(),
    max_iterations: z.number().int().min(0).max(MAX_REPAIR_ATTEMPTS_CAP).optional(),
    nodes: z.array(TaskNodeSchema).min(1, '任务必须定义至少一个节点'),
    outputs: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.nodes.forEach((node, i) => {
      if (seen.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `重复的节点 ID "${node.id}"`,
          path: ['nodes', i, 'id'],
        });
      }
      seen.add(node.id);
      if (node.kind === 'session' && (!node.prompt || node.prompt.trim() === '')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `节点 "${node.id}" 是 session 类型且必须包含非空的 prompt`,
          path: ['nodes', i, 'prompt'],
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// 推断类型
// ---------------------------------------------------------------------------

export type InputRef = z.infer<typeof InputRefSchema>;
export type OutputDecl = z.infer<typeof OutputDeclSchema>;
export type Loop = z.infer<typeof LoopSchema>;
export type Retry = z.infer<typeof RetrySchema>;
export type TaskParam = z.infer<typeof TaskParamSchema>;
export type TaskDefaults = z.infer<typeof TaskDefaultsSchema>;
export type TaskNode = z.infer<typeof TaskNodeSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

export function nodeDeps(node: TaskNode): string[] {
  return node.depends_on ?? [];
}

export function nodeTitle(node: TaskNode): string {
  return node.title ?? node.id;
}

export function parseTaskSpec(raw: unknown) {
  return TaskSpecSchema.safeParse(raw);
}

export { z } from 'zod';
