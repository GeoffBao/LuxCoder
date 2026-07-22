import { z } from 'zod'
import type {
  CreateProjectInput,
  LoadedProject,
  ProjectAsset,
  ProjectConfig,
  ProjectPromptContext,
  UpdateProjectInput,
  UploadProjectAssetInput,
} from '@luxcoder/shared/projects'
import {
  createProject as createProjectInStorage,
  deleteProject as deleteProjectInStorage,
  deleteProjectAsset as deleteProjectAssetInStorage,
  getProjectMemoryPath,
  listProjectAssets as listProjectAssetsInStorage,
  loadProject,
  loadProjectById,
  loadProjectMemory,
  loadWorkspaceProjects,
  readProjectMemory,
  updateProject as updateProjectInStorage,
  uploadProjectAsset as uploadProjectAssetInStorage,
  writeProjectMemory as writeProjectMemoryInStorage,
} from '../../../../../packages/shared/src/projects/storage.ts'
import { getAgentWorkspace } from './agent-workspace-manager'
import { getAgentWorkspacePath } from './config-paths'

const WorkspaceIdSchema = z.string().min(1, 'workspaceId 必填')
const ProjectSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'project slug 必须是 URL-safe slug')
const ProjectNameSchema = z.string().trim().min(1, '项目名称不能为空')
const OptionalProjectStringSchema = z.string().optional()
const KanbanColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dropStatusId: z.string().optional(),
  color: z.string().optional(),
})
const CreateProjectInputSchema = z.object({
  name: ProjectNameSchema,
  description: OptionalProjectStringSchema,
  workingDirectory: OptionalProjectStringSchema,
  details: OptionalProjectStringSchema,
  colorTheme: OptionalProjectStringSchema,
  color: OptionalProjectStringSchema,
})
const UpdateProjectInputSchema = z.object({
  name: ProjectNameSchema.optional(),
  description: OptionalProjectStringSchema,
  workingDirectory: OptionalProjectStringSchema,
  details: OptionalProjectStringSchema,
  colorTheme: OptionalProjectStringSchema,
  color: OptionalProjectStringSchema,
  kanbanColumns: z.array(KanbanColumnSchema).optional(),
  archivedAt: z.number().optional(),
  defaultExpertId: OptionalProjectStringSchema,
})

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

function requireLoadedProject(workspaceRoot: string, slug: string): LoadedProject {
  const project = loadProject(workspaceRoot, slug)
  if (!project) throw new Error(`项目创建或更新后无法重新加载: ${slug}`)
  return project
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

  private parseCreateProjectInput(input: CreateProjectInput): CreateProjectInput {
    return CreateProjectInputSchema.parse(input)
  }

  private parseUpdateProjectInput(input: UpdateProjectInput): UpdateProjectInput {
    return UpdateProjectInputSchema.parse(input)
  }

  // ===== workspaceId 路径（内部服务用） =====

  listProjects(workspaceId: string): LoadedProject[] {
    return this.listProjectsAtRoot(this.resolveWorkspaceRoot(workspaceId))
  }

  getProject(workspaceId: string, projectSlug: string): LoadedProject | null {
    return loadProject(this.resolveWorkspaceRoot(workspaceId), this.parseProjectSlug(projectSlug))
  }

  createProject(workspaceId: string, input: CreateProjectInput): ProjectConfig {
    return this.createProjectAtRoot(this.resolveWorkspaceRoot(workspaceId), input).config
  }

  updateProject(workspaceId: string, projectSlug: string, input: UpdateProjectInput): ProjectConfig {
    return this.updateProjectAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug, input).config
  }

  deleteProject(workspaceId: string, projectSlug: string): void {
    this.deleteProjectAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug)
  }

  listProjectAssets(workspaceId: string, projectSlug: string): ProjectAsset[] {
    return this.listProjectAssetsAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug)
  }

  uploadProjectAsset(workspaceId: string, projectSlug: string, input: UploadProjectAssetInput): ProjectAsset {
    return this.uploadProjectAssetAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug, input)
  }

  deleteProjectAsset(workspaceId: string, projectSlug: string, filename: string): void {
    this.deleteProjectAssetAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug, filename)
  }

  readProjectMemory(workspaceId: string, projectSlug: string): string {
    return this.readProjectMemoryAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug)
  }

  writeProjectMemory(workspaceId: string, projectSlug: string, content: string): void {
    this.writeProjectMemoryAtRoot(this.resolveWorkspaceRoot(workspaceId), projectSlug, content)
  }

  // ===== workspaceRoot 路径（IPC 直接用） =====

  listProjectsAtRoot(workspaceRoot: string): LoadedProject[] {
    return loadWorkspaceProjects(workspaceRoot)
  }

  getProjectAtRoot(workspaceRoot: string, idOrSlug: string): LoadedProject | null {
    const bySlug = /^[a-z0-9][a-z0-9-]*$/.test(idOrSlug)
      ? loadProject(workspaceRoot, idOrSlug)
      : null
    return bySlug ?? loadProjectById(workspaceRoot, idOrSlug)
  }

  createProjectAtRoot(workspaceRoot: string, input: CreateProjectInput): LoadedProject {
    const config = createProjectInStorage(workspaceRoot, this.parseCreateProjectInput(input))
    return requireLoadedProject(workspaceRoot, config.slug)
  }

  updateProjectAtRoot(workspaceRoot: string, projectSlug: string, input: UpdateProjectInput): LoadedProject {
    const config = updateProjectInStorage(
      workspaceRoot,
      this.parseProjectSlug(projectSlug),
      this.parseUpdateProjectInput(input),
    )
    return requireLoadedProject(workspaceRoot, config.slug)
  }

  deleteProjectAtRoot(workspaceRoot: string, projectSlug: string): void {
    deleteProjectInStorage(workspaceRoot, this.parseProjectSlug(projectSlug))
  }

  listProjectAssetsAtRoot(workspaceRoot: string, projectSlug: string): ProjectAsset[] {
    return listProjectAssetsInStorage(workspaceRoot, this.parseProjectSlug(projectSlug))
  }

  uploadProjectAssetAtRoot(
    workspaceRoot: string,
    projectSlug: string,
    input: UploadProjectAssetInput,
  ): ProjectAsset {
    return uploadProjectAssetInStorage(workspaceRoot, this.parseProjectSlug(projectSlug), input)
  }

  deleteProjectAssetAtRoot(workspaceRoot: string, projectSlug: string, filename: string): void {
    deleteProjectAssetInStorage(workspaceRoot, this.parseProjectSlug(projectSlug), filename)
  }

  readProjectMemoryAtRoot(workspaceRoot: string, projectSlug: string): string {
    return readProjectMemory(workspaceRoot, this.parseProjectSlug(projectSlug))
  }

  writeProjectMemoryAtRoot(workspaceRoot: string, projectSlug: string, content: string): void {
    writeProjectMemoryInStorage(workspaceRoot, this.parseProjectSlug(projectSlug), content)
  }

  /** 解析项目绑定的工作目录；projectId 可为 id 或 slug */
  resolveWorkingDirectory(workspaceRoot: string, projectId?: string): string | undefined {
    if (!projectId) return undefined
    return this.getProjectAtRoot(workspaceRoot, projectId)?.config.workingDirectory
  }

  /** 解析列拖入时自动应用的 sessionStatus */
  resolveDropStatusId(workspaceRoot: string, projectId: string | undefined, columnId: string | null): string | undefined {
    if (!projectId || !columnId) return undefined
    const columns = this.getProjectAtRoot(workspaceRoot, projectId)?.config.kanbanColumns
    return columns?.find((column) => column.id === columnId)?.dropStatusId
  }

  /** 构建注入 Agent prompt 的项目上下文 */
  buildPromptContext(workspaceRoot: string, projectId: string): ProjectPromptContext | null {
    const project = this.getProjectAtRoot(workspaceRoot, projectId)
    if (!project) return null
    const assets = listProjectAssetsInStorage(workspaceRoot, project.config.slug)
    const memoryContent = loadProjectMemory(workspaceRoot, project.config.slug)
    return {
      name: project.config.name,
      ...(project.config.description ? { description: project.config.description } : {}),
      ...(project.config.details ? { details: project.config.details } : {}),
      assetsPath: project.assetsPath,
      assets: assets.map((asset) => ({
        filename: asset.filename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      })),
      memoryPath: getProjectMemoryPath(workspaceRoot, project.config.slug),
      ...(memoryContent ? { memoryContent } : {}),
    }
  }
}

/** 主进程单例：IPC 与冷启动共用 */
export const projectRepository = new ProjectRepository()
