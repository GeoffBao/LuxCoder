export interface ProjectFilesRootInput {
  worktreePath: string | null | undefined
  projectWorkingDirectory: string | null | undefined
}

/** 解析右侧 Files 的项目来源；未绑定 Project 时返回 null，不回退为 Workspace Files。 */
export function resolveProjectFilesRoot(input: ProjectFilesRootInput): string | null {
  const worktreePath = input.worktreePath?.trim()
  if (worktreePath) return worktreePath

  const projectWorkingDirectory = input.projectWorkingDirectory?.trim()
  return projectWorkingDirectory || null
}
