import { describe, expect, test } from 'bun:test';
import { TaskSpecSchema, validateTaskInput, type TaskSpec } from '@luxagents/shared/tasks';
import * as taskContracts from '@luxagents/shared/tasks';
import { parseTaskYaml, serializeTaskYaml } from '../storage.ts';
import * as taskStorage from '../storage.ts';

describe('tasks package contracts', () => {
  test('package root 仅暴露 renderer-safe contract', () => {
    const leakedStorageExports = Object.keys(taskStorage).filter((exportName) =>
      Object.prototype.hasOwnProperty.call(taskContracts, exportName),
    );

    expect(leakedStorageExports).toEqual([]);
  });

  test('最小 session 节点 spec 会补全默认 kind 并通过验证', () => {
    const parsed = TaskSpecSchema.safeParse({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      nodes: [
        { id: 'node-a', prompt: 'do the thing' },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('预期最小 session spec 校验通过');
    }
    expect(parsed.data.nodes[0]?.kind).toBe('session');
  });

  test('重复 node id 视为无效 spec', () => {
    const parsed = TaskSpecSchema.safeParse({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      runner: 'conduct',
      nodes: [
        { id: 'node-a', kind: 'session', prompt: 'first' },
        { id: 'node-a', kind: 'session', prompt: 'second' },
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error('预期重复 node id 校验失败');
    }
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: '重复的节点 ID "node-a"',
          path: ['nodes', 1, 'id'],
        }),
      ]),
    );
  });

  test('session 节点拒绝空 prompt', () => {
    const parsed = TaskSpecSchema.safeParse({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      nodes: [
        { id: 'node-a', kind: 'session', prompt: '   ' },
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error('预期空 prompt 校验失败');
    }
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: '节点 "node-a" 是 session 类型且必须包含非空的 prompt',
          path: ['nodes', 0, 'prompt'],
        }),
      ]),
    );
  });

  test('legacy type 字段会归一化为 kind', () => {
    const parsed = TaskSpecSchema.safeParse({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      nodes: [
        { id: 'node-a', type: 'session', prompt: 'do the thing' },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('预期 legacy type 别名通过校验');
    }
    expect(parsed.data.nodes[0]?.kind).toBe('session');
  });

  test('未实现的控制流字段仍然可解析', () => {
    const parsed = TaskSpecSchema.safeParse({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      nodes: [
        { id: 'plan', prompt: 'plan the work' },
        {
          id: 'route-step',
          kind: 'route',
          depends_on: ['plan'],
          when: 'ready',
          trigger: 'all_success',
          replicas: 2,
          aggregate: 'concat',
          loop: { until: 'approved', max: 3, else: 'fallback', carry: 'notes' },
          for_each: '${params.items}',
          max_parallel: 2,
          retry: { limit: 1, when: 'error' },
          timeout: 30,
          cache: 'off',
          approval: true,
        },
        { id: 'fallback', kind: 'finally' },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  test('图校验会拒绝不存在的 depends_on 节点', () => {
    const parsed = validateTaskInput({
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      nodes: [
        { id: 'node-a', prompt: 'do the thing' },
        { id: 'node-b', prompt: 'continue', depends_on: ['missing-node'] },
      ],
    });

    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'nodes.node-b.depends_on',
          message: '节点 "node-b" 依赖未知节点 "missing-node"',
        }),
      ]),
    );
  });

  test('最小单节点 spec 可以 YAML round-trip', () => {
    const spec: TaskSpec = {
      id: 'demo-task',
      title: 'Demo task',
      goal: 'Lock migration boundary',
      runner: 'conduct',
      nodes: [
        {
          id: 'node-a',
          kind: 'session',
          prompt: 'do the thing',
        },
      ],
    };

    const yamlText = serializeTaskYaml(spec);
    const parsed = parseTaskYaml(yamlText);

    expect(parsed.valid).toBe(true);
    expect(parsed.spec).toEqual(spec);
  });
});
