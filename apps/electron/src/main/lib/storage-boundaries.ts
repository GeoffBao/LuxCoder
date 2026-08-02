/** 工作区目录清理边界：这些目录不是 Session orphan，可长期保存。 */
const WORKSPACE_METADATA_DIRS = new Set([
  'workspace-files',
  'skills',
  'skills-inactive',
  '.claude',
  '.claude-plugin',
])

export function isWorkspaceMetadataDir(entryName: string): boolean {
  return WORKSPACE_METADATA_DIRS.has(entryName)
}
