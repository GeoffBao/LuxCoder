import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import type {
  CreateProjectInput,
  LoadedProject,
  ProjectAsset,
  ProjectConfig,
  UpdateProjectInput,
  UploadProjectAssetInput,
} from '@luxagents/shared/projects'
import {
  createProject as createProjectInStorage,
  deleteProject as deleteProjectInStorage,
  deleteProjectAsset as deleteProjectAssetInStorage,
  getProjectMemoryPath,
  listProjectAssets as listProjectAssetsInStorage,
  loadProject,
  loadWorkspaceProjects,
  projectExists,
  readProjectMemory,
  updateProject as updateProjectInStorage,
  uploadProjectAsset as uploadProjectAssetInStorage,
} from '../../../../../packages/shared/src/projects/storage.ts'
import { getAgentWorkspace } from './agent-workspace-manager'
import { getAgentWorkspacePath } from './config-paths'

const WorkspaceIdSchema = z.string().min(1, 'workspaceId 必填')
const ProjectSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'project slug 必须是 URL-safe slug')

export interface ProjectRepositoryOptions {
  resolveWorkspaceRoot?: (workspaceId: string) => string
}

function resolveWorkspaceRootFromManager(workspaceId: string): string {
  const workspace = getAgentWorkspace(workspaceId)
  if (!workspace) {
    throw new Error(`工作区不存在: ${workspaceId}`)
  }
  return getAgentWorkspacePath(workspace.slug)
}

export class ProjectRepository {
  constructor(private readonly options: ProjectRepositoryOptions = {}) {}

  private resolveWorkspaceRoot(workspaceId: string): string {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId)
    return (this.options.resolveWorkspaceRoot ?? resolveWorkspaceRootFromManager)(parsedWorkspaceId)
  }

  private parseProjectSlug(projectSlug: string): string {
    return ProjectSlugSchema.parse(projectSlug)
  }

  listProjects(workspaceId: string): LoadedProject[] {
    return loadWorkspaceProjects(this.resolveWorkspaceRoot(workspaceId))
  }

  getProject(workspaceId: string, projectSlug: string): LoadedProject | null {
    return loadProject(this.resolveWorkspaceRoot(workspaceId), this.parseProjectSlug(projectSlug))
  }

  createProject(workspaceId: string, input: CreateProjectInput): ProjectConfig {
    return createProjectInStorage(this.resolveWorkspaceRoot(workspaceId), input)
  }

  updateProject(workspaceId: string, projectSlug: string, input: UpdateProjectInput): ProjectConfig {
    return updateProjectInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseProjectSlug(projectSlug),
      input,
    )
  }

  deleteProject(workspaceId: string, projectSlug: string): void {
    deleteProjectInStorage(this.resolveWorkspaceRoot(workspaceId), this.parseProjectSlug(projectSlug))
  }

  listProjectAssets(workspaceId: string, projectSlug: string): ProjectAsset[] {
    return listProjectAssetsInStorage(this.resolveWorkspaceRoot(workspaceId), this.parseProjectSlug(projectSlug))
  }

  uploadProjectAsset(workspaceId: string, projectSlug: string, input: UploadProjectAssetInput): ProjectAsset {
    return uploadProjectAssetInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseProjectSlug(projectSlug),
      input,
    )
  }

  deleteProjectAsset(workspaceId: string, projectSlug: string, filename: string): void {
    deleteProjectAssetInStorage(
      this.resolveWorkspaceRoot(workspaceId),
      this.parseProjectSlug(projectSlug),
      filename,
    )
  }

  readProjectMemory(workspaceId: string, projectSlug: string): string {
    return readProjectMemory(this.resolveWorkspaceRoot(workspaceId), this.parseProjectSlug(projectSlug))
  }

  writeProjectMemory(workspaceId: string, projectSlug: string, content: string): void {
    const workspaceRoot = this.resolveWorkspaceRoot(workspaceId)
    const slug = this.parseProjectSlug(projectSlug)
    if (!projectExists(workspaceRoot, slug)) {
      throw new Error(`项目不存在: ${slug}`)
    }
    writeFileSync(getProjectMemoryPath(workspaceRoot, slug), content, 'utf-8')
  }
}
