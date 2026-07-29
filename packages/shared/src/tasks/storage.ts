/**
 * Task + 运行状态持久化
 *
 * 磁盘结构:
 *   {workspaceRoot}/tasks/<slug>/task.yaml                    — 可编辑的 spec
 *   {workspaceRoot}/tasks/<slug>/runs/<runId>/run-log.jsonl   — 仅追加的运行日志
 *   {workspaceRoot}/tasks/<slug>/runs/<runId>/nodes/<id>.json — 每节点输出
 *
 * 参照 OSS: packages/shared/src/tasks/storage.ts
 * 适配: yaml 包引用改为 js-yaml；atomicWriteFileSync → writeFileSync + renameSync
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync, renameSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { validateTaskInput } from './validate.ts';
import { z, type TaskSpec } from './schema.ts';
import { NodeOutputSchema, type NodeOutput } from './refs.ts';
import {
  TASK_RECORD_SCHEMA_VERSION,
  TaskRecordSchema,
  type TaskRecord,
  type TaskRecordLoadResult,
} from './task-record.ts';
import type { ValidationResult, ValidationIssue } from './validate.ts';

const TASKS_DIR = 'tasks';
const TASK_FILE = 'task.yaml';
const TASK_RECORD_FILE = 'task.json';
const RUNS_DIR = 'runs';
const RUN_LOG = 'run-log.jsonl';
const NODES_DIR = 'nodes';

// ---------------------------------------------------------------------------
// 运行状态类型
// ---------------------------------------------------------------------------

export type NodeRunState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export type RunLogEntry = { seq?: number } & (
  | {
      t: string;
      kind: 'run-started';
      taskId: string;
      taskSlug?: string;
      runId: string;
      orchestratorSessionId?: string;
      effectiveCwd?: string;
      effectiveCwdSource?: 'task' | 'project' | 'workspace';
      params?: Record<string, unknown>;
      verifyOnComplete?: boolean;
    }
  | { t: string; kind: 'node-scheduled'; nodeId: string }
  | { t: string; kind: 'node-dispatch-intent'; nodeId: string; attempt: number; correlationKey: string }
  | { t: string; kind: 'node-spawned'; nodeId: string; sessionId: string }
  | { t: string; kind: 'node-finished'; nodeId: string; sessionId: string; state: NodeRunState; reason?: string }
  | { t: string; kind: 'node-retry'; nodeId: string; attempt: number; reason: string }
  | { t: string; kind: 'run-paused' | 'run-resumed' | 'run-stopped' | 'run-completed' | 'run-failed' | 'run-verifying' }
  | { t: string; kind: 'verdict'; result: 'pass' | 'fail' | 'unparsed'; reason?: string; nodes?: string[] }
  | { t: string; kind: 'budget-breach'; metric: 'tokens' | 'parallel' | 'iterations'; value: number; limit: number }
);

export interface RehydratedNodeState {
  state: NodeRunState;
  sessionId?: string;
  attempt: number;
}

const RunLogPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    t: z.string(),
    kind: z.literal('run-started'),
    taskId: z.string(),
    taskSlug: z.string().optional(),
    runId: z.string(),
    orchestratorSessionId: z.string().optional(),
    effectiveCwd: z.string().optional(),
    effectiveCwdSource: z.enum(['task', 'project', 'workspace']).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    verifyOnComplete: z.boolean().optional(),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('node-scheduled'),
    nodeId: z.string(),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('node-dispatch-intent'),
    nodeId: z.string(),
    attempt: z.number().int().positive(),
    correlationKey: z.string().min(1),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('node-spawned'),
    nodeId: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('node-finished'),
    nodeId: z.string(),
    sessionId: z.string(),
    state: z.enum(['pending', 'running', 'done', 'failed', 'cancelled', 'skipped']),
    reason: z.string().optional(),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('node-retry'),
    nodeId: z.string(),
    attempt: z.number(),
    reason: z.string(),
  }),
  z.object({
    t: z.string(),
    kind: z.enum(['run-paused', 'run-resumed', 'run-stopped', 'run-completed', 'run-failed', 'run-verifying']),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('verdict'),
    result: z.enum(['pass', 'fail', 'unparsed']),
    reason: z.string().optional(),
    nodes: z.array(z.string()).optional(),
  }),
  z.object({
    t: z.string(),
    kind: z.literal('budget-breach'),
    metric: z.enum(['tokens', 'parallel', 'iterations']),
    value: z.number(),
    limit: z.number(),
  }),
]);

const RunLogEntrySchema = z.intersection(
  z.object({ seq: z.number().int().positive().optional() }),
  RunLogPayloadSchema,
);

// ---------------------------------------------------------------------------
// 路径辅助
// ---------------------------------------------------------------------------

export function tasksRoot(workspaceRoot: string): string {
  return join(workspaceRoot, TASKS_DIR);
}
export function taskDir(workspaceRoot: string, slug: string): string {
  return join(workspaceRoot, TASKS_DIR, slug);
}
export function taskYamlPath(workspaceRoot: string, slug: string): string {
  return join(taskDir(workspaceRoot, slug), TASK_FILE);
}
export function taskRecordPath(workspaceRoot: string, slug: string): string {
  return join(taskDir(workspaceRoot, slug), TASK_RECORD_FILE);
}
export function runDir(workspaceRoot: string, slug: string, runId: string): string {
  return join(taskDir(workspaceRoot, slug), RUNS_DIR, runId);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 原子写入（写临时文件后 rename） */
function atomicWriteSync(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

/** 去除 BOM */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// task.yaml
// ---------------------------------------------------------------------------

/** 解析 task.yaml 字符串 → 验证后的 spec。不抛出异常。 */
export function parseTaskYaml(yamlText: string): ValidationResult & { spec?: TaskSpec } {
  let raw: unknown;
  try {
    raw = parseYaml(stripBom(yamlText));
  } catch (e) {
    return {
      valid: false,
      errors: [{ file: TASK_FILE, path: 'root', message: `YAML 解析错误: ${(e as Error).message}`, severity: 'error' as const }],
      warnings: [],
    };
  }
  return validateTaskInput(raw);
}

/** 序列化 spec 为 task.yaml 字符串 */
export function serializeTaskYaml(spec: TaskSpec): string {
  return stringifyYaml(spec);
}

/** 加载 + 验证 task.yaml。文件不存在时返回 null。 */
export function loadTaskSpec(workspaceRoot: string, slug: string): (ValidationResult & { spec?: TaskSpec }) | null {
  const path = taskYamlPath(workspaceRoot, slug);
  if (!existsSync(path)) return null;
  return parseTaskYaml(readFileSync(path, 'utf-8'));
}

/** 写入 spec 到磁盘。先通过 Zod 验证格式。 */
export function saveTaskSpec(workspaceRoot: string, spec: TaskSpec): void {
  const validation = validateTaskInput(spec);
  if (!validation.valid || !validation.spec) {
    const messages = validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`拒绝保存无效的 task spec: ${messages}`);
  }
  ensureDir(taskDir(workspaceRoot, validation.spec.id));
  atomicWriteSync(taskYamlPath(workspaceRoot, validation.spec.id), serializeTaskYaml(validation.spec));
}

/** 列出所有 task slug（包含 task.yaml 的 tasks/ 子目录） */
export function listTaskSlugs(workspaceRoot: string): string[] {
  const root = tasksRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, TASK_FILE)))
    .map((d) => d.name)
    .sort();
}

/** 列出可参与 Task 聚合/恢复的目录；保留 listTaskSlugs 的旧语义。 */
export function listTaskAggregateSlugs(workspaceRoot: string): string[] {
  const root = tasksRoot(workspaceRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => (
      existsSync(join(root, entry.name, TASK_FILE))
      || existsSync(join(root, entry.name, TASK_RECORD_FILE))
    ))
    .map((entry) => entry.name)
    .sort();
}

/** 读取 task.json；未知高版本只返回诊断，避免旧客户端降级覆盖。 */
export function loadTaskRecord(workspaceRoot: string, slug: string): TaskRecordLoadResult {
  const path = taskRecordPath(workspaceRoot, slug);
  if (!existsSync(path)) return { kind: 'missing' };

  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(readFileSync(path, 'utf-8')));
  } catch (error) {
    return { kind: 'invalid', message: `task.json 解析错误: ${(error as Error).message}` };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const schemaVersion = Reflect.get(raw, 'schemaVersion');
    if (typeof schemaVersion === 'number' && schemaVersion > TASK_RECORD_SCHEMA_VERSION) {
      return { kind: 'unsupported', schemaVersion };
    }
  }

  const parsed = TaskRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'invalid', message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
  }
  if (parsed.data.slug !== slug) {
    return { kind: 'invalid', message: `task.json slug 与目录不一致: ${parsed.data.slug} != ${slug}` };
  }
  return { kind: 'valid', record: parsed.data };
}

/** 保存 task.json；该文件不拥有 title/project/cwd/plan，避免与 task.yaml 双写。 */
export function saveTaskRecord(workspaceRoot: string, record: TaskRecord): void {
  const parsed = TaskRecordSchema.parse(record);
  ensureDir(taskDir(workspaceRoot, parsed.slug));
  atomicWriteSync(taskRecordPath(workspaceRoot, parsed.slug), `${JSON.stringify(parsed, null, 2)}\n`);
}

/**
 * 若 baseSlug 已被占用，追加数字后缀直到唯一（-2、-3...）。
 *
 * `saveTaskSpec` 对同 slug 直接覆盖已有 task.yaml，不做任何冲突检测——供"新建任务"场景
 * （而非编辑既有任务）的调用方在写入前调用本函数，避免静默覆盖一个已存在的任务定义（残留的
 * 旧 orchestrator 会话会变成孤儿）。调用方需保证本函数与随后的 saveTaskSpec 之间没有 await，
 * 否则会重新引入 TOCTOU 竞态。
 */
export function ensureUniqueTaskSlug(workspaceRoot: string, baseSlug: string): string {
  const existing = new Set(listTaskSlugs(workspaceRoot));
  if (!existing.has(baseSlug)) return baseSlug;
  let n = 2;
  let candidate = `${baseSlug}-${n}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// 运行日志
// ---------------------------------------------------------------------------

/** 追加一条运行日志条目（首次写入时自动创建 run 目录） */
export function appendRunLog(workspaceRoot: string, slug: string, runId: string, entry: RunLogEntry): void {
  const dir = runDir(workspaceRoot, slug, runId);
  ensureDir(dir);
  appendFileSync(join(dir, RUN_LOG), JSON.stringify(entry) + '\n', 'utf-8');
}

export interface RunLogIntegrityResult {
  entries: RunLogEntry[];
  recoveryRequired: boolean;
  tailTruncated: boolean;
  errors: Array<{ line: number; message: string }>;
}

/**
 * 读取并校验运行日志。只容忍最后一个非空行截断；中段损坏或新格式 sequence 断裂必须人工恢复。
 */
export function readRunLogIntegrity(workspaceRoot: string, slug: string, runId: string): RunLogIntegrityResult {
  const path = join(runDir(workspaceRoot, slug, runId), RUN_LOG);
  if (!existsSync(path)) return { entries: [], recoveryRequired: false, tailTruncated: false, errors: [] };

  const lines = readFileSync(path, 'utf-8').split('\n');
  const nonEmptyIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line.length > 0);
  const lastNonEmptyIndex = nonEmptyIndexes.at(-1)?.index ?? -1;
  const entries: RunLogEntry[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  let tailTruncated = false;

  for (const { line, index } of nonEmptyIndexes) {
    try {
      const parsed = RunLogEntrySchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '));
      }
      entries.push(parsed.data as RunLogEntry);
    } catch (error) {
      if (index === lastNonEmptyIndex) {
        tailTruncated = true;
      } else {
        errors.push({ line: index + 1, message: (error as Error).message });
      }
    }
  }

  let expectedSequence: number | undefined;
  for (const entry of entries) {
    if (entry.seq === undefined) {
      if (expectedSequence !== undefined) {
        errors.push({ line: -1, message: 'sequence 日志中出现缺失 seq 的条目' });
      }
      continue;
    }
    if (expectedSequence === undefined) expectedSequence = 1;
    if (entry.seq !== expectedSequence) {
      errors.push({ line: -1, message: `run-log sequence 断裂: 期望 ${expectedSequence}，实际 ${entry.seq}` });
      expectedSequence = entry.seq + 1;
    } else {
      expectedSequence += 1;
    }
  }

  return {
    entries,
    recoveryRequired: errors.length > 0,
    tailTruncated,
    errors,
  };
}

/** 兼容读取 API；恢复路径必须改用 readRunLogIntegrity 检查损坏状态。 */
export function readRunLog(workspaceRoot: string, slug: string, runId: string): RunLogEntry[] {
  return readRunLogIntegrity(workspaceRoot, slug, runId).entries;
}

/** 根据运行日志重建节点状态；缺失输出文件的 done 节点会回退为 pending */
export function rehydrateNodeStates(
  nodeIds: string[],
  log: RunLogEntry[],
  readOutput: (nodeId: string) => NodeOutput | null = () => null,
): Record<string, RehydratedNodeState> {
  const state: Record<string, RehydratedNodeState> = {};

  for (const nodeId of nodeIds) {
    state[nodeId] = { state: 'pending', attempt: 0 };
  }

  for (const entry of log) {
    if (entry.kind === 'node-scheduled') {
      const current = state[entry.nodeId];
      if (current) {
        current.attempt += 1;
      }
      continue;
    }

    if (entry.kind === 'node-spawned') {
      const current = state[entry.nodeId];
      if (current) {
        current.sessionId = entry.sessionId;
      }
      continue;
    }

    if (entry.kind === 'node-finished') {
      const current = state[entry.nodeId];
      if (current) {
        current.sessionId = entry.sessionId;
        current.state = entry.state;
      }
    }
  }

  for (const nodeId of nodeIds) {
    const current = state[nodeId];
    if (!current) {
      continue;
    }

    if (current.state === 'done' && readOutput(nodeId) === null) {
      current.state = 'pending';
      continue;
    }

    if (current.state === 'running' || current.state === 'cancelled') {
      current.state = 'pending';
    }
  }

  return state;
}

/** 列出任务的所有 run ID */
export function listRunIds(workspaceRoot: string, slug: string): string[] {
  const runs = join(taskDir(workspaceRoot, slug), RUNS_DIR);
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function getRunCreatedAt(workspaceRoot: string, slug: string, runId: string): number {
  const context = readRunContextSnapshot(workspaceRoot, slug, runId);
  const contextTime = context ? Date.parse(context.createdAt) : Number.NaN;
  if (Number.isFinite(contextTime)) return contextTime;
  const started = readRunLog(workspaceRoot, slug, runId).find((entry) => entry.kind === 'run-started');
  const startedTime = started ? Date.parse(started.t) : Number.NaN;
  if (Number.isFinite(startedTime)) return startedTime;
  try {
    return statSync(runDir(workspaceRoot, slug, runId)).mtimeMs;
  } catch {
    return 0;
  }
}

/** 返回真实最新 Run，不依赖 UUID/自定义 runId 的字典序。 */
export function getLatestRunId(workspaceRoot: string, slug: string): string | undefined {
  return listRunIds(workspaceRoot, slug)
    .map((runId) => ({ runId, createdAt: getRunCreatedAt(workspaceRoot, slug, runId) }))
    .sort((a, b) => b.createdAt - a.createdAt || b.runId.localeCompare(a.runId))[0]?.runId;
}

/** 运行日志是否仍可 resume（已 started 且尚未 completed/failed/stopped） */
export function isRunResumable(log: RunLogEntry[]): boolean {
  let started = false;
  let terminal = false;
  for (const entry of log) {
    if (entry.kind === 'run-started') {
      started = true;
      terminal = false;
      continue;
    }
    if (
      entry.kind === 'run-completed'
      || entry.kind === 'run-failed'
      || entry.kind === 'run-stopped'
    ) {
      terminal = true;
    }
  }
  return started && !terminal;
}

/** 扫描 workspace 下所有尚未结束、可冷启动恢复的 run */
export function listResumableRuns(workspaceRoot: string): Array<{ slug: string; runId: string }> {
  const result: Array<{ slug: string; runId: string }> = [];
  for (const slug of listTaskSlugs(workspaceRoot)) {
    for (const runId of listRunIds(workspaceRoot, slug)) {
      const integrity = readRunLogIntegrity(workspaceRoot, slug, runId);
      if (!integrity.recoveryRequired && isRunResumable(integrity.entries)) {
        result.push({ slug, runId });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 运行 spec 快照
// ---------------------------------------------------------------------------

const RUN_SPEC = 'spec.json';
const RUN_CONTEXT = 'context-snapshot.json';

export const RunContextSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().min(1),
  taskSlug: z.string().min(1),
  runId: z.string().min(1),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('workspace') }),
    z.object({ kind: z.literal('project'), projectId: z.string().min(1) }),
  ]),
  effectiveCwd: z.string().min(1).optional(),
  effectiveCwdSource: z.enum(['task', 'project', 'workspace']).optional(),
  orchestratorSessionId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  verifyOnComplete: z.boolean(),
}).superRefine((value, ctx) => {
  if (Boolean(value.effectiveCwd) !== Boolean(value.effectiveCwdSource)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'effectiveCwd 与 effectiveCwdSource 必须同时存在或同时缺失',
      path: ['effectiveCwd'],
    });
  }
});

export type RunContextSnapshot = z.infer<typeof RunContextSnapshotSchema>;

/**
 * 原子预留 runId，并在派发任何节点前写入 spec 与执行上下文。
 * 任一快照写失败会删除本次新建目录；已存在 runId 绝不覆盖。
 */
export function initializeRun(
  workspaceRoot: string,
  slug: string,
  runId: string,
  spec: TaskSpec,
  context: RunContextSnapshot,
): void {
  const validation = validateTaskInput(spec);
  if (!validation.valid || !validation.spec) {
    throw new Error(`拒绝初始化无效 Run spec: ${validation.errors.map((issue) => issue.message).join('; ')}`);
  }
  const parsedContext = RunContextSnapshotSchema.parse(context);
  if (parsedContext.taskSlug !== slug || parsedContext.runId !== runId) {
    throw new Error('Run context 的 taskSlug/runId 与目标目录不一致');
  }

  ensureDir(join(taskDir(workspaceRoot, slug), RUNS_DIR));
  const dir = runDir(workspaceRoot, slug, runId);
  try {
    mkdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`runId 已存在或被占用: ${slug}:${runId}`);
    }
    throw error;
  }

  try {
    atomicWriteSync(join(dir, RUN_SPEC), JSON.stringify(validation.spec, null, 2));
    atomicWriteSync(join(dir, RUN_CONTEXT), JSON.stringify(parsedContext, null, 2));
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

export function readRunContextSnapshot(
  workspaceRoot: string,
  slug: string,
  runId: string,
): RunContextSnapshot | null {
  const path = join(runDir(workspaceRoot, slug, runId), RUN_CONTEXT);
  if (!existsSync(path)) return null;
  try {
    const parsed = RunContextSnapshotSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 快照运行时的 spec，确保 Results 视图显示的是运行当时而非当前编辑后的节点 */
export function writeRunSpecSnapshot(workspaceRoot: string, slug: string, runId: string, spec: TaskSpec): void {
  const dir = runDir(workspaceRoot, slug, runId);
  ensureDir(dir);
  atomicWriteSync(join(dir, RUN_SPEC), JSON.stringify(spec, null, 2));
}

export function readRunSpecSnapshot(workspaceRoot: string, slug: string, runId: string): TaskSpec | null {
  const path = join(runDir(workspaceRoot, slug, runId), RUN_SPEC);
  if (!existsSync(path)) return null;
  try {
    const parsed = validateTaskInput(JSON.parse(readFileSync(path, 'utf-8')));
    return parsed.valid ? (parsed.spec ?? null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 节点输出
// ---------------------------------------------------------------------------

export function writeNodeOutput(workspaceRoot: string, slug: string, runId: string, nodeId: string, output: NodeOutput): void {
  const dir = join(runDir(workspaceRoot, slug, runId), NODES_DIR);
  ensureDir(dir);
  atomicWriteSync(join(dir, `${nodeId}.json`), JSON.stringify(output, null, 2));
}

export function readNodeOutput(workspaceRoot: string, slug: string, runId: string, nodeId: string): NodeOutput | null {
  const path = join(runDir(workspaceRoot, slug, runId), NODES_DIR, `${nodeId}.json`);
  if (!existsSync(path)) return null;
  try {
    const parsed = NodeOutputSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------

/** 永久删除 Task 目录（task.yaml + task.json + runs）。调用方应在删除前验证影响。 */
export function deleteTaskSpec(workspaceRoot: string, slug: string): void {
  const dir = taskDir(workspaceRoot, slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
