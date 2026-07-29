import { describe, expect, test } from 'bun:test';
import { WorkspaceLabelConfigSchema, WorkspaceLabelSchema } from '../schema.ts';

const label = {
  id: '018f47a8-6c26-7a13-9bf6-7c8d4f2e4c72',
  name: 'Urgent',
  color: '#FF5500',
  createdAt: 1,
  updatedAt: 1,
};

describe('Workspace Labels schema', () => {
  test('accepts a flat v1 label definition', () => {
    expect(WorkspaceLabelSchema.parse(label)).toEqual(label);
    expect(WorkspaceLabelConfigSchema.parse({ schemaVersion: 1, labels: [label] }).labels).toHaveLength(1);
  });

  test('rejects invalid colors and unknown hierarchy fields', () => {
    expect(WorkspaceLabelSchema.safeParse({ ...label, color: 'red' }).success).toBe(false);
    expect(WorkspaceLabelSchema.safeParse({ ...label, parentId: 'x' }).success).toBe(false);
  });

  test('enforces stable IDs and case-insensitive unique names', () => {
    const duplicateName = WorkspaceLabelConfigSchema.safeParse({
      schemaVersion: 1,
      labels: [label, { ...label, id: '118f47a8-6c26-7a13-9bf6-7c8d4f2e4c73', name: ' urgent ' }],
    });
    expect(duplicateName.success).toBe(false);
    expect(WorkspaceLabelSchema.safeParse({ ...label, id: 'urgent' }).success).toBe(false);
  });
});
