import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ProjectConfig } from '@luxcoder/shared/projects';
import * as projectContracts from '@luxcoder/shared/projects';
import * as projectStorage from '../storage.ts';

const tempRoots: string[] = [];

function createTempWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'luxcoder-project-storage-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function withMockedNow<T>(values: number[], run: () => T): T {
  const originalNow = Date.now;
  let index = 0;

  Date.now = () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    if (value === undefined) {
      throw new Error('withMockedNow 需要至少一个时间值');
    }
    return value;
  };

  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
}

describe('projects package contracts', () => {
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

  test('storage 模块保留完整导出面', () => {
    expect(Object.keys(projectStorage).sort()).toEqual([
      'MEMORY_FILENAME',
      'createProject',
      'deleteProject',
      'deleteProjectAsset',
      'ensureProjectAssetsDir',
      'ensureProjectsDir',
      'generateProjectSlug',
      'getProjectAssetsPath',
      'getProjectMemoryPath',
      'getProjectPath',
      'getWorkspaceProjectsPath',
      'listProjectAssets',
      'loadProject',
      'loadProjectById',
      'loadProjectConfig',
      'loadProjectMemory',
      'loadWorkspaceProjects',
      'projectExists',
      'readProjectMemory',
      'sanitizeAssetFilename',
      'saveProjectConfig',
      'updateProject',
      'uploadProjectAsset',
      'writeProjectMemory',
    ]);
  });
});

describe('workspace project storage', () => {
  test('创建项目会生成 URL-safe 唯一 slug 并持久化 config', () => {
    const workspaceRoot = createTempWorkspaceRoot();

    const firstProject = withMockedNow([1000, 1001], () =>
      projectStorage.createProject(workspaceRoot, {
        name: 'Alpha Project!!!',
        description: '第一个项目',
      }),
    );
    const secondProject = projectStorage.createProject(workspaceRoot, {
      name: 'Alpha Project!!!',
    });

    expect(firstProject.slug).toBe('alpha-project');
    expect(secondProject.slug).toBe('alpha-project-2');

    const loadedProjects = projectStorage.loadWorkspaceProjects(workspaceRoot);
    expect(loadedProjects).toHaveLength(2);
    expect(loadedProjects.map((project) => project.config.slug)).toEqual([
      'alpha-project',
      'alpha-project-2',
    ]);

    const configPath = join(projectStorage.getProjectPath(workspaceRoot, firstProject.slug), 'config.json');
    const storedConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      id: string;
      slug: string;
      description?: string;
      absolutePath?: string;
      updatedAt: number;
    };

    expect(storedConfig.id).toBe(firstProject.id);
    expect(storedConfig.slug).toBe('alpha-project');
    expect(storedConfig.description).toBe('第一个项目');
    expect(storedConfig.updatedAt).toBe(firstProject.updatedAt);
    expect(storedConfig.absolutePath).toBeUndefined();

    const projectFiles = readdirSync(projectStorage.getProjectPath(workspaceRoot, firstProject.slug));
    expect(projectFiles.some((entry) => entry.includes('.tmp.'))).toBe(false);
  });

  test('归档和取消归档只更新配置，不删除已有资产与 Memory', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const project = projectStorage.createProject(workspaceRoot, { name: 'Archive Me' });

    projectStorage.uploadProjectAsset(workspaceRoot, project.slug, {
      filename: 'brief.md',
      text: '# 项目简报',
    });
    const memoryPath = projectStorage.getProjectMemoryPath(workspaceRoot, project.slug);
    writeFileSync(memoryPath, '已归档前的记忆', 'utf-8');

    const archived = withMockedNow([2000, 2001], () =>
      projectStorage.updateProject(workspaceRoot, project.slug, {
        archivedAt: 123456789,
      }),
    );
    expect(archived.archivedAt).toBe(123456789);
    expect(archived.updatedAt).toBe(2000);

    const reloadedArchived = projectStorage.loadProjectConfig(workspaceRoot, project.slug);
    expect(reloadedArchived).not.toBeNull();
    expect(reloadedArchived?.archivedAt).toBe(123456789);
    expect(reloadedArchived?.updatedAt).toBe(archived.updatedAt);

    const unarchived = withMockedNow([3000, 3001], () =>
      projectStorage.updateProject(workspaceRoot, project.slug, {
        archivedAt: undefined,
      }),
    );
    expect(unarchived.archivedAt).toBeUndefined();
    expect(unarchived.updatedAt).toBe(3000);

    const reloadedUnarchived = projectStorage.loadProjectConfig(workspaceRoot, project.slug);
    expect(reloadedUnarchived).not.toBeNull();
    expect(reloadedUnarchived?.archivedAt).toBeUndefined();
    expect(reloadedUnarchived?.updatedAt).toBe(unarchived.updatedAt);

    expect(projectStorage.listProjectAssets(workspaceRoot, project.slug)).toHaveLength(1);
    expect(projectStorage.readProjectMemory(workspaceRoot, project.slug)).toBe('已归档前的记忆');
  });

  test('更新项目后返回值与重载 config.json 的 updatedAt 完全一致', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const project = projectStorage.createProject(workspaceRoot, {
      name: 'Timestamp Project',
      description: 'before',
    });

    const updated = withMockedNow([4000, 4001], () =>
      projectStorage.updateProject(workspaceRoot, project.slug, {
        description: 'after',
      }),
    );

    expect(updated.description).toBe('after');

    const reloaded = projectStorage.loadProjectConfig(workspaceRoot, project.slug);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.description).toBe('after');
    expect(reloaded?.updatedAt).toBe(updated.updatedAt);
  });

  test('上传资产会保留 runtime absolutePath，并拒绝不安全路径名', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const project = projectStorage.createProject(workspaceRoot, { name: 'Assets' });

    const asset = projectStorage.uploadProjectAsset(workspaceRoot, project.slug, {
      filename: '设计说明.md',
      text: 'safe asset',
    });
    expect(asset.absolutePath).toContain(`/projects/${project.slug}/assets/`);
    expect(existsSync(asset.absolutePath)).toBe(true);

    expect(() =>
      projectStorage.uploadProjectAsset(workspaceRoot, project.slug, {
        filename: '../escape.txt',
        text: 'bad',
      }),
    ).toThrow('不安全');

    expect(() =>
      projectStorage.uploadProjectAsset(workspaceRoot, project.slug, {
        filename: '/tmp/escape.txt',
        text: 'bad',
      }),
    ).toThrow('不安全');
  });

  test('Memory 文件可按固定路径读写，缺失时返回空字符串', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const project = projectStorage.createProject(workspaceRoot, { name: 'Memory' });

    expect(projectStorage.readProjectMemory(workspaceRoot, project.slug)).toBe('');

    const memoryPath = projectStorage.getProjectMemoryPath(workspaceRoot, project.slug);
    writeFileSync(memoryPath, '# MEMORY\n- item 1', 'utf-8');

    expect(projectStorage.readProjectMemory(workspaceRoot, project.slug)).toBe('# MEMORY\n- item 1');
  });

  test('writeProjectMemory 原子写入并可覆盖已有内容', () => {
    const workspaceRoot = createTempWorkspaceRoot();
    const project = projectStorage.createProject(workspaceRoot, { name: 'Memory Writer' });

    projectStorage.writeProjectMemory(workspaceRoot, project.slug, '# 项目记忆\n第一次');
    expect(projectStorage.readProjectMemory(workspaceRoot, project.slug)).toBe('# 项目记忆\n第一次');

    projectStorage.writeProjectMemory(workspaceRoot, project.slug, '# 项目记忆\n第二次');
    expect(projectStorage.readProjectMemory(workspaceRoot, project.slug)).toBe('# 项目记忆\n第二次');
    expect(existsSync(`${projectStorage.getProjectMemoryPath(workspaceRoot, project.slug)}.tmp`)).toBe(false);
  });
});
