import { describe, expect, test } from 'bun:test';
import { TaskSpecSchema, type TaskSpec } from '@luxagents/shared/tasks';
import * as taskContracts from '@luxagents/shared/tasks';
import { parseTaskYaml, serializeTaskYaml } from '../storage.ts';

describe('tasks package contracts', () => {
  test('package root 仅暴露 renderer-safe contract', () => {
    expect(taskContracts).not.toHaveProperty('parseTaskYaml');
    expect(taskContracts).not.toHaveProperty('serializeTaskYaml');
    expect(taskContracts).not.toHaveProperty('saveTaskSpec');
    expect(taskContracts).not.toHaveProperty('appendRunLog');
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
    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: '重复的节点 ID "node-a"',
          path: ['nodes', 1, 'id'],
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
