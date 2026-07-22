import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TaskSpec } from '../schema.ts';
import type { RunLogEntry } from '../storage.ts';
import {
  appendRunLog,
  isRunResumable,
  listResumableRuns,
  loadTaskSpec,
  readNodeOutput,
  readRunLog,
  readRunSpecSnapshot,
  rehydrateNodeStates,
  runDir,
  saveTaskSpec,
  taskDir,
  writeNodeOutput,
  writeRunSpecSnapshot,
} from '../storage.ts';

const tempRoots: string[] = [];

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxcoder-task-storage-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function buildSpec(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    id: 'demo-task',
    title: 'Demo task',
    goal: 'Lock migration boundary',
    runner: 'conduct',
    nodes: [
      {
        id: 'draft',
        kind: 'session',
        prompt: 'draft the task',
      },
    ],
    ...overrides,
  };
}

describe('task storage', () => {
  test('saveTaskSpec 以原子替换更新 task.yaml，且不留下临时文件', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const first = buildSpec();
    const second = buildSpec({
      title: 'Updated task',
      goal: 'Use the replacement file',
      nodes: [{ id: 'draft', kind: 'session', prompt: 'draft again' }],
    });

    saveTaskSpec(workspaceRoot, first);
    saveTaskSpec(workspaceRoot, second);

    const loaded = loadTaskSpec(workspaceRoot, second.id);
    expect(loaded?.valid).toBe(true);
    expect(loaded?.spec).toEqual(second);

    const fileContents = readFileSync(join(taskDir(workspaceRoot, second.id), 'task.yaml'), 'utf-8');
    expect(fileContents).toContain('Updated task');
    expect(fileContents).not.toContain('Demo task');
    expect(readdirSync(taskDir(workspaceRoot, second.id)).some((entry) => entry.endsWith('.tmp'))).toBe(false);
  });

  test('saveTaskSpec 会拒绝 depends_on 指向未知节点的 spec', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const invalid = buildSpec({
      nodes: [
        {
          id: 'draft',
          kind: 'session',
          prompt: 'draft the task',
          depends_on: ['missing-node'],
        },
      ],
    });

    expect(() => saveTaskSpec(workspaceRoot, invalid)).toThrow(/未知节点|无效/i);
    expect(existsSync(taskDir(workspaceRoot, invalid.id))).toBe(false);
  });

  test('saveTaskSpec 会拒绝存在循环依赖的 spec', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const invalid = buildSpec({
      nodes: [
        {
          id: 'draft',
          kind: 'session',
          prompt: 'draft the task',
          depends_on: ['review'],
        },
        {
          id: 'review',
          kind: 'session',
          prompt: 'review the task',
          depends_on: ['draft'],
        },
      ],
    });

    expect(() => saveTaskSpec(workspaceRoot, invalid)).toThrow(/循环|无效/i);
    expect(existsSync(taskDir(workspaceRoot, invalid.id))).toBe(false);
  });

  test('readRunLog 会跳过损坏的最终 JSONL 行，rehydrate 不会误判节点成功', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';
    const logPath = join(runDir(workspaceRoot, slug, runId), 'run-log.jsonl');

    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: slug,
      runId,
    });
    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:01.000Z',
      kind: 'node-scheduled',
      nodeId: 'draft',
    });
    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:02.000Z',
      kind: 'node-spawned',
      nodeId: 'draft',
      sessionId: 'session-1',
    });
    writeFileSync(
      logPath,
      `${readFileSync(logPath, 'utf-8')}{"t":"2026-07-13T00:00:03.000Z","kind":"node-finished","nodeId":"draft","sessionId":"session-1","state":"done"`,
      'utf-8',
    );

    const log = readRunLog(workspaceRoot, slug, runId);
    expect(log.map((entry) => entry.kind)).toEqual(['run-started', 'node-scheduled', 'node-spawned']);

    const nodeStates = rehydrateNodeStates(['draft'], log);
    expect(nodeStates.draft).toEqual({
      attempt: 1,
      sessionId: 'session-1',
      state: 'pending',
    });
  });

  test('readRunLog 会跳过合法 JSON 但缺少 kind、必需字段或非法 state 的行', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';
    const logPath = join(runDir(workspaceRoot, slug, runId), 'run-log.jsonl');

    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: slug,
      runId,
    });

    writeFileSync(
      logPath,
      [
        readFileSync(logPath, 'utf-8').trimEnd(),
        JSON.stringify({ t: '2026-07-13T00:00:01.000Z', nodeId: 'draft' }),
        JSON.stringify({ t: '2026-07-13T00:00:02.000Z', kind: 'node-spawned', nodeId: 'draft' }),
        JSON.stringify({
          t: '2026-07-13T00:00:03.000Z',
          kind: 'node-finished',
          nodeId: 'draft',
          sessionId: 'session-1',
          state: 'broken',
        }),
        JSON.stringify({
          t: '2026-07-13T00:00:04.000Z',
          kind: 'node-finished',
          nodeId: 'draft',
          sessionId: 'session-1',
          state: 'done',
        }),
        '',
      ].join('\n'),
      'utf-8',
    );

    const log = readRunLog(workspaceRoot, slug, runId);
    expect(log).toEqual([
      {
        t: '2026-07-13T00:00:00.000Z',
        kind: 'run-started',
        taskId: slug,
        runId,
      },
      {
        t: '2026-07-13T00:00:04.000Z',
        kind: 'node-finished',
        nodeId: 'draft',
        sessionId: 'session-1',
        state: 'done',
      },
    ]);
  });

  test('readRunLog 会保留 run-started 的 params 与 verifyOnComplete', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';

    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: slug,
      runId,
      params: {
        topic: 'alpha',
        count: 2,
      },
      verifyOnComplete: false,
    });

    expect(readRunLog(workspaceRoot, slug, runId)).toEqual([
      {
        t: '2026-07-13T00:00:00.000Z',
        kind: 'run-started',
        taskId: slug,
        runId,
        params: {
          topic: 'alpha',
          count: 2,
        },
        verifyOnComplete: false,
      },
    ]);
  });

  test('run spec snapshot 按 runId 隔离存储', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const first = buildSpec();
    const second = buildSpec({
      title: 'Second snapshot',
      goal: 'Preserve run isolation',
    });

    writeRunSpecSnapshot(workspaceRoot, slug, 'run-1', first);
    writeRunSpecSnapshot(workspaceRoot, slug, 'run-2', second);

    expect(readRunSpecSnapshot(workspaceRoot, slug, 'run-1')).toEqual(first);
    expect(readRunSpecSnapshot(workspaceRoot, slug, 'run-2')).toEqual(second);
  });

  test('readRunSpecSnapshot 在结构无效时返回 null', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';

    mkdirSync(runDir(workspaceRoot, slug, runId), { recursive: true });
    writeFileSync(
      join(runDir(workspaceRoot, slug, runId), 'spec.json'),
      JSON.stringify({
        id: slug,
        title: 'Broken snapshot',
        goal: 'missing nodes',
      }),
      'utf-8',
    );

    expect(readRunSpecSnapshot(workspaceRoot, slug, runId)).toBeNull();
  });

  test('节点输出可持久化并回读', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';

    writeNodeOutput(workspaceRoot, slug, runId, 'draft', {
      text: '最终输出',
      params: {
        summary: '摘要',
        count: 2,
      },
    });

    expect(readNodeOutput(workspaceRoot, slug, runId, 'draft')).toEqual({
      text: '最终输出',
      params: {
        summary: '摘要',
        count: 2,
      },
    });
  });

  test('readNodeOutput 在缺少 text 时返回 null', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';
    const outputPath = join(runDir(workspaceRoot, slug, runId), 'nodes', 'draft.json');

    mkdirSync(join(runDir(workspaceRoot, slug, runId), 'nodes'), { recursive: true });
    writeFileSync(
      outputPath,
      JSON.stringify({
        params: {
          summary: 'only params',
        },
      }),
      'utf-8',
    );

    expect(readNodeOutput(workspaceRoot, slug, runId, 'draft')).toBeNull();
  });

  test('rehydrate 会把缺失输出文件的 done 节点回退为 pending', () => {
    const log: RunLogEntry[] = [
      {
        t: '2026-07-13T00:00:00.000Z',
        kind: 'run-started',
        taskId: 'demo-task',
        runId: 'run-1',
      },
      {
        t: '2026-07-13T00:00:01.000Z',
        kind: 'node-scheduled',
        nodeId: 'draft',
      },
      {
        t: '2026-07-13T00:00:02.000Z',
        kind: 'node-spawned',
        nodeId: 'draft',
        sessionId: 'session-1',
      },
      {
        t: '2026-07-13T00:00:03.000Z',
        kind: 'node-finished',
        nodeId: 'draft',
        sessionId: 'session-1',
        state: 'done',
      },
    ];

    const nodeStates = rehydrateNodeStates(['draft'], log, () => null);
    expect(nodeStates.draft).toEqual({
      attempt: 1,
      sessionId: 'session-1',
      state: 'pending',
    });
  });

  test('appendRunLog 按 JSONL 逐行追加', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const slug = 'demo-task';
    const runId = 'run-1';

    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: slug,
      runId,
    });
    appendRunLog(workspaceRoot, slug, runId, {
      t: '2026-07-13T00:00:01.000Z',
      kind: 'run-completed',
    });

    const lines = readFileSync(join(runDir(workspaceRoot, slug, runId), 'run-log.jsonl'), 'utf-8').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.startsWith('{') && line.endsWith('}'))).toBe(true);
    expect(existsSync(join(runDir(workspaceRoot, slug, runId), 'run-log.jsonl'))).toBe(true);
  });

  test('isRunResumable 在 completed/failed/stopped 后不可恢复，paused 仍可恢复', () => {
    expect(isRunResumable([])).toBe(false)
    expect(isRunResumable([
      { t: 't0', kind: 'run-started', taskId: 'demo', runId: 'run-1' },
      { t: 't1', kind: 'run-paused' },
    ])).toBe(true)
    expect(isRunResumable([
      { t: 't0', kind: 'run-started', taskId: 'demo', runId: 'run-1' },
      { t: 't1', kind: 'run-completed' },
    ])).toBe(false)
    expect(isRunResumable([
      { t: 't0', kind: 'run-started', taskId: 'demo', runId: 'run-1' },
      { t: 't1', kind: 'run-failed' },
    ])).toBe(false)
  })

  test('listResumableRuns 只返回未结束的 run', () => {
    const workspaceRoot = createTempWorkspaceRoot()
    saveTaskSpec(workspaceRoot, buildSpec())

    appendRunLog(workspaceRoot, 'demo-task', 'run-active', {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: 'demo-task',
      runId: 'run-active',
    })
    appendRunLog(workspaceRoot, 'demo-task', 'run-done', {
      t: '2026-07-13T00:00:00.000Z',
      kind: 'run-started',
      taskId: 'demo-task',
      runId: 'run-done',
    })
    appendRunLog(workspaceRoot, 'demo-task', 'run-done', {
      t: '2026-07-13T00:00:01.000Z',
      kind: 'run-completed',
    })

    expect(listResumableRuns(workspaceRoot)).toEqual([{ slug: 'demo-task', runId: 'run-active' }])
  })
});
