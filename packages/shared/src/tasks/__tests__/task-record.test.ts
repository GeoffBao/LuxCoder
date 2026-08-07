import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TaskRecordSchema,
  type TaskRecord,
} from '../task-record.ts';
import {
  listTaskAggregateSlugs,
  loadTaskRecord,
  saveTaskRecord,
  taskRecordPath,
} from '../storage.ts';

const tempRoots: string[] = [];

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'myyoda-task-record-'));
  tempRoots.push(root);
  return root;
}

function buildRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    schemaVersion: 1,
    taskId: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
    slug: 'demo-task',
    revision: 1,
    workflow: 'todo',
    labelIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('TaskRecord', () => {
  test('只拥有身份、Workflow、Labels、归档和 orchestrator link', () => {
    const parsed = TaskRecordSchema.parse(buildRecord({
      workflow: 'needs-review',
      labelIds: ['label-a', 'label-b'],
      orchestratorSessionId: 'session-a',
      archivedAt: 10,
    }));

    expect(parsed).toEqual(expect.objectContaining({
      taskId: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
      slug: 'demo-task',
      workflow: 'needs-review',
      labelIds: ['label-a', 'label-b'],
      orchestratorSessionId: 'session-a',
      archivedAt: 10,
    }));
    expect(Object.hasOwn(parsed, 'title')).toBe(false);
    expect(Object.hasOwn(parsed, 'projectId')).toBe(false);
    expect(Object.hasOwn(parsed, 'cwd')).toBe(false);
  });

  test('拒绝 slug 充当 taskId，也拒绝未知字段成为第二真源', () => {
    expect(TaskRecordSchema.safeParse(buildRecord({ taskId: 'demo-task' })).success).toBe(false);
    expect(TaskRecordSchema.safeParse({ ...buildRecord(), title: 'duplicated title' }).success).toBe(false);
  });

  test('save/load 原子往返且不留下临时文件', () => {
    const root = createTempWorkspaceRoot();
    const first = buildRecord();
    const second = buildRecord({ revision: 2, workflow: 'in-progress', updatedAt: 2 });

    saveTaskRecord(root, first);
    saveTaskRecord(root, second);

    expect(loadTaskRecord(root, first.slug)).toEqual({ kind: 'valid', record: second });
    expect(JSON.parse(readFileSync(taskRecordPath(root, first.slug), 'utf8'))).toEqual(second);
    expect(existsSync(`${taskRecordPath(root, first.slug)}.tmp`)).toBe(false);
  });

  test('未知高版本只读诊断，不能被当作当前记录覆盖', () => {
    const root = createTempWorkspaceRoot();
    const record = buildRecord();
    saveTaskRecord(root, record);
    const path = taskRecordPath(root, record.slug);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    raw.schemaVersion = 99;
    writeFileSync(path, JSON.stringify(raw), 'utf8');

    expect(loadTaskRecord(root, record.slug)).toEqual({ kind: 'unsupported', schemaVersion: 99 });
  });

  test('聚合枚举发现只有 task.json 的恢复项，但旧 listTaskSlugs 语义不变', () => {
    const root = createTempWorkspaceRoot();
    saveTaskRecord(root, buildRecord({ slug: 'record-only' }));

    expect(listTaskAggregateSlugs(root)).toEqual(['record-only']);
  });
});
