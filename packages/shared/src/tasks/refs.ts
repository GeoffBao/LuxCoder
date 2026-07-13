/**
 * task.yaml 输入绑定的引用语法
 *
 * 标准形式: `${nodes.<id>.output[.field]}` 和 `${params.<name>}`
 *
 * 两个消费者共享此模块：
 *  - validate.ts 使用 extractRefs() 构建边 + 检测悬空引用
 *  - Conductor 使用 interpolateRefs() 在调度前构建节点的 prompt
 *
 * 参照 OSS: packages/shared/src/tasks/refs.ts
 */

import { z, type InputRef } from './schema.ts';

export interface NodeRef {
  kind: 'node';
  nodeId: string;
  field?: string;
  raw: string;
}

export interface ParamRef {
  kind: 'param';
  name: string;
  raw: string;
}

export type Ref = NodeRef | ParamRef;

export interface NodeOutput {
  text: string;
  params?: Record<string, unknown>;
}

export const NodeOutputSchema = z.object({
  text: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export interface InterpolationContext {
  nodeOutputs: Record<string, NodeOutput>;
  params?: Record<string, unknown>;
}

export interface InterpolateOptions {
  onMissing?: (ref: Ref) => string;
}

export interface ResolveInputRefsOptions extends InterpolateOptions {
  summarize?: (text: string) => string | Promise<string>;
}

const REF_SOURCE = String.raw`\$\{\s*(?:nodes\.([a-z0-9][a-z0-9-]*)\.output(?:\.([a-zA-Z0-9_-]+))?|params\.([a-zA-Z_][a-zA-Z0-9_]*))\s*\}`;

function refRegex(): RegExp {
  return new RegExp(REF_SOURCE, 'g');
}

/** 从字符串中提取所有引用 */
export function extractRefs(text: string): Ref[] {
  if (!text) return [];
  const refs: Ref[] = [];
  for (const m of text.matchAll(refRegex())) {
    const [raw, nodeId, field, paramName] = m;
    if (nodeId) refs.push({ kind: 'node', nodeId, field, raw });
    else if (paramName) refs.push({ kind: 'param', name: paramName, raw });
  }
  return refs;
}

function stringifyValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** 替换模板中所有 ${...} 引用为实际值 */
export function interpolateRefs(
  template: string,
  ctx: InterpolationContext,
  opts: InterpolateOptions = {},
): string {
  const onMissing = opts.onMissing ?? ((ref: Ref) => ref.raw);
  return template.replace(refRegex(), (raw, nodeId?: string, field?: string, paramName?: string) => {
    if (nodeId) {
      const out = ctx.nodeOutputs[nodeId];
      if (!out) return onMissing({ kind: 'node', nodeId, field, raw });
      if (field) {
        const value = out.params?.[field];
        return value === undefined ? onMissing({ kind: 'node', nodeId, field, raw }) : stringifyValue(value);
      }
      return out.text;
    }
    if (paramName) {
      const value = ctx.params?.[paramName];
      return value === undefined ? onMissing({ kind: 'param', name: paramName, raw }) : stringifyValue(value);
    }
    return raw;
  });
}

/** 解析节点 inputs 中的引用，产出可直接注入 prompt 的字符串值 */
export async function resolveInputRefs(
  inputs: Record<string, InputRef> | undefined,
  ctx: InterpolationContext,
  opts: ResolveInputRefsOptions = {},
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const [name, ref] of Object.entries(inputs ?? {})) {
    const source = typeof ref === 'string' ? ref : ref.from;
    const shouldSummarize = typeof ref === 'object' && ref.summarize === true;
    let text = interpolateRefs(source, ctx, opts);

    if (shouldSummarize && opts.summarize) {
      text = await opts.summarize(text);
    }

    resolved[name] = text;
  }

  return resolved;
}
