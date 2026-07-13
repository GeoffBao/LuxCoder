import { describe, expect, test } from 'bun:test';
import type { ProjectConfig } from '@luxagents/shared/projects';
import * as projectContracts from '@luxagents/shared/projects';

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
    expect(projectContracts).not.toHaveProperty('loadProjectConfig');
    expect(projectContracts).not.toHaveProperty('saveProjectConfig');
    expect(projectContracts).not.toHaveProperty('createProject');
    expect(projectContracts).not.toHaveProperty('deleteProject');
  });
});
