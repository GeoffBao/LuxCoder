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
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { validateTaskInput } from './validate.ts';
import { z, type TaskSpec } from './schema.ts';
import { NodeOutputSchema, type NodeOutput } from './refs.ts';
import type { ValidationResult, ValidationIssue } from './validate.ts';

const TASKS_DIR = 'tasks';
const TASK_FILE = 'task.yaml';
const RUNS_DIR = 'runs';
const RUN_LOG = 'run-log.jsonl';
const NODES_DIR = 'nodes';

// ---------------------------------------------------------------------------
// 运行状态类型
// ---------------------------------------------------------------------------

export type NodeRunState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export type RunLogEntry =
  | {
      t: string;
      kind: 'run-started';
      taskId: string;
      runId: string;
      orchestratorSessionId?: string;
      params?: Record<string, unknown>;
      verifyOnComplete?: boolean;
    }
  | { t: string; kind: 'node-scheduled'; nodeId: string }
  | { t: string; kind: 'node-spawned'; nodeId: string; sessionId: string }
  | { t: string; kind: 'node-finished'; nodeId: string; sessionId: string; state: NodeRunState; reason?: string }
  | { t: string; kind: 'node-retry'; nodeId: string; attempt: number; reason: string }
  | { t: string; kind: 'run-paused' | 'run-resumed' | 'run-stopped' | 'run-completed' | 'run-failed' | 'run-verifying' }
  | { t: string; kind: 'verdict'; result: 'pass' | 'fail' | 'unparsed'; reason?: string; nodes?: string[] }
  | { t: string; kind: 'budget-breach'; metric: 'tokens' | 'parallel' | 'iterations'; value: number; limit: number };

export interface RehydratedNodeState {
  state: NodeRunState;
  sessionId?: string;
  attempt: number;
}

const RunLogEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    t: z.string(),
    kind: z.literal('run-started'),
    taskId: z.string(),
    runId: z.string(),
    orchestratorSessionId: z.string().optional(),
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

// ---------------------------------------------------------------------------
// 运行日志
// ---------------------------------------------------------------------------

/** 追加一条运行日志条目（首次写入时自动创建 run 目录） */
export function appendRunLog(workspaceRoot: string, slug: string, runId: string, entry: RunLogEntry): void {
  const dir = runDir(workspaceRoot, slug, runId);
  ensureDir(dir);
  appendFileSync(join(dir, RUN_LOG), JSON.stringify(entry) + '\n', 'utf-8');
}

/** 读取运行日志（按追加顺序） */
export function readRunLog(workspaceRoot: string, slug: string, runId: string): RunLogEntry[] {
  const path = join(runDir(workspaceRoot, slug, runId), RUN_LOG);
  if (!existsSync(path)) return [];
  const out: RunLogEntry[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = RunLogEntrySchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        out.push(parsed.data);
      }
    } catch {
      // 跳过损坏/截断的行
    }
  }
  return out;
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

// ---------------------------------------------------------------------------
// 运行 spec 快照
// ---------------------------------------------------------------------------

const RUN_SPEC = 'spec.json';

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
