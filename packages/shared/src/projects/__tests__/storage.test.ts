import { describe, expect, test } from 'bun:test';
import type { ProjectConfig } from '@luxagents/shared/projects';
import * as projectContracts from '@luxagents/shared/projects';
import * as projectStorage from '../storage.ts';

describe('projects package export boundary', () => {
  test('package root 仅暴露 renderer-safe contract', () => {
    const sampleConfig: ProjectConfig = {
      id: 'proj_demo',
      slug: 'demo',
      name: 'Demo',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(sampleConfig.slug).toBe('demo');

    const leakedStorageExports = Object.keys(projectStorage).filter((exportName) =>
      Object.prototype.hasOwnProperty.call(projectContracts, exportName),
    );

    expect(leakedStorageExports).toEqual([]);
  });
});
