/**
 * task.yaml 图级别验证
 *
 * Zod（schema.ts）覆盖字段形状；此模块覆盖图的结构：
 * 环检测、悬空 depends_on、未解析的 ${...} 引用、大小上限
 *
 * 参照 OSS: packages/shared/src/tasks/validate.ts
 * 适配: 替换 OSS config/ 类型为本地定义（LuxCoder 无对应模块）
 */

import { extractRefs } from './refs.ts';
import { parseTaskSpec, nodeDeps, type TaskSpec, type TaskNode } from './schema.ts';

// ---------------------------------------------------------------------------
// 本地验证类型（替代 OSS 的 config/validators.ts）
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const TASK_CAPS = {
  maxNodes: 64,
  maxDepth: 24,
  maxWidth: 24,
  maxLoopIterations: 50,
} as const;

const TASK_FILE = 'task.yaml';

function err(path: string, message: string, suggestion?: string): ValidationIssue {
  return { file: TASK_FILE, path, message, severity: 'error', ...(suggestion ? { suggestion } : {}) };
}
function warn(path: string, message: string, suggestion?: string): ValidationIssue {
  return { file: TASK_FILE, path, message, severity: 'warning', ...(suggestion ? { suggestion } : {}) };
}
function result(errors: ValidationIssue[], warnings: ValidationIssue[]): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// 验证
// ---------------------------------------------------------------------------

export function validateTaskSpec(spec: TaskSpec): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const byId = new Map<string, TaskNode>();
  for (const node of spec.nodes) byId.set(node.id, node);

  const declaredParams = new Set((spec.params ?? []).map((p) => p.name));
  const deps = materializeDeps(spec);

  for (const node of spec.nodes) {
    const path = `nodes.${node.id}`;

    for (const dep of nodeDeps(node)) {
      if (dep === node.id) {
        errors.push(err(`${path}.depends_on`, `节点 "${node.id}" 依赖自身`));
        continue;
      }
      if (!byId.has(dep)) {
        errors.push(err(`${path}.depends_on`, `节点 "${node.id}" 依赖未知节点 "${dep}"`));
        continue;
      }
    }

    const refStrings: string[] = [];
    if (node.prompt) refStrings.push(node.prompt);
    for (const ref of Object.values(node.inputs ?? {})) {
      refStrings.push(typeof ref === 'string' ? ref : ref.from);
    }
    for (const text of refStrings) {
      for (const ref of extractRefs(text)) {
        if (ref.kind === 'node') {
          if (ref.nodeId === node.id) {
            errors.push(err(`${path}.inputs`, `节点 "${node.id}" 引用自身的输出`));
            continue;
          }
          if (!byId.has(ref.nodeId)) {
            errors.push(err(`${path}.inputs`, `引用 ${ref.raw} 指向未知节点 "${ref.nodeId}"`));
            continue;
          }
          if (!nodeDeps(node).includes(ref.nodeId)) {
            warnings.push(
              warn(`${path}.depends_on`,
                `节点 "${node.id}" 引用了 "${ref.nodeId}" 的输出但未在 depends_on 中声明`,
                `在 ${node.id}.depends_on 中添加 "${ref.nodeId}"`,
              ),
            );
          }
        } else if (!declaredParams.has(ref.name)) {
          errors.push(err(`${path}.inputs`, `引用 ${ref.raw} 使用了未声明的参数 "${ref.name}"`));
        }
      }
    }

    if (node.loop && node.loop.max > TASK_CAPS.maxLoopIterations) {
      errors.push(err(`${path}.loop.max`, `Loop max ${node.loop.max} 超过上限 ${TASK_CAPS.maxLoopIterations}`));
    }
    if (node.loop?.else && !byId.has(node.loop.else)) {
      errors.push(err(`${path}.loop.else`, `loop.else 指向未知节点 "${node.loop.else}"`));
    }
  }

  for (const [name, refStr] of Object.entries(spec.outputs ?? {})) {
    for (const ref of extractRefs(refStr)) {
      if (ref.kind === 'node' && !byId.has(ref.nodeId)) {
        errors.push(err(`outputs.${name}`, `输出 "${name}" 引用未知节点 "${ref.nodeId}"`));
      }
      if (ref.kind === 'param' && !declaredParams.has(ref.name)) {
        errors.push(err(`outputs.${name}`, `输出 "${name}" 引用未声明的参数 "${ref.name}"`));
      }
    }
  }

  const cycle = findCycle(spec.nodes, deps);
  if (cycle) {
    errors.push(err('nodes', `依赖循环检测到: ${cycle.join(' -> ')}`));
  } else {
    const { depth, width } = graphMetrics(spec.nodes, deps);
    if (depth > TASK_CAPS.maxDepth) {
      errors.push(err('nodes', `图深度 ${depth} 超过上限 ${TASK_CAPS.maxDepth}`));
    }
    if (width > TASK_CAPS.maxWidth) {
      errors.push(err('nodes', `图宽度 ${width} 超过上限 ${TASK_CAPS.maxWidth}`));
    }
  }

  if (spec.nodes.length > TASK_CAPS.maxNodes) {
    errors.push(err('nodes', `任务有 ${spec.nodes.length} 个节点，超过上限 ${TASK_CAPS.maxNodes}`));
  }

  return result(errors, warnings);
}

/** 解析 + 图验证合一 */
export function validateTaskInput(raw: unknown): ValidationResult & { spec?: TaskSpec } {
  const parsed = parseTaskSpec(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map<ValidationIssue>((issue) => ({
      file: TASK_FILE,
      path: issue.path.join('.') || 'root',
      message: issue.message,
      severity: 'error',
    }));
    return { valid: false, errors, warnings: [] };
  }
  const graph = validateTaskSpec(parsed.data);
  return { ...graph, spec: parsed.data };
}

// ---------------------------------------------------------------------------
// 图工具
// ---------------------------------------------------------------------------

export function materializeDeps(spec: TaskSpec): Map<string, Set<string>> {
  const ids = new Set(spec.nodes.map((n) => n.id));
  const edges = new Map<string, Set<string>>();
  for (const node of spec.nodes) {
    const set = new Set<string>();
    const add = (dep: string) => { if (dep !== node.id && ids.has(dep)) set.add(dep); };
    for (const dep of nodeDeps(node)) add(dep);
    const refTexts: string[] = [];
    if (node.prompt) refTexts.push(node.prompt);
    for (const ref of Object.values(node.inputs ?? {})) refTexts.push(typeof ref === 'string' ? ref : ref.from);
    for (const text of refTexts) {
      for (const r of extractRefs(text)) if (r.kind === 'node') add(r.nodeId);
    }
    edges.set(node.id, set);
  }
  return edges;
}

function findCycle(nodes: TaskNode[], deps: Map<string, Set<string>>): string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);
  const stack: string[] = [];

  function dfs(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      const c = color.get(dep);
      if (c === GRAY) {
        const start = stack.indexOf(dep);
        return [...stack.slice(start), dep];
      }
      if (c === WHITE) {
        const found = dfs(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      const found = dfs(n.id);
      if (found) return found;
    }
  }
  return null;
}

function graphMetrics(nodes: TaskNode[], deps: Map<string, Set<string>>): { depth: number; width: number } {
  const level = new Map<string, number>();
  function levelOf(id: string): number {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    let max = 0;
    for (const dep of deps.get(id) ?? []) max = Math.max(max, levelOf(dep) + 1);
    level.set(id, max);
    return max;
  }
  for (const n of nodes) levelOf(n.id);

  let depth = 0;
  const perLevel = new Map<number, number>();
  for (const n of nodes) {
    const l = level.get(n.id) ?? 0;
    depth = Math.max(depth, l);
    perLevel.set(l, (perLevel.get(l) ?? 0) + 1);
  }
  let width = 0;
  for (const c of perLevel.values()) width = Math.max(width, c);
  return { depth: depth + 1, width };
}
