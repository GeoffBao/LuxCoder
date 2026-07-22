/**
 * 打开本地文件夹编排模型（纯函数）
 */

export interface OpenFolderDialogResult {
  path: string
  name: string
}

export type OpenLocalFolderPlan =
  | { kind: 'cancel' }
  | { kind: 'open'; folderPath: string; workspaceRoot: string }

export function planOpenLocalFolder(input: {
  dialog: OpenFolderDialogResult | null
  workspaceRoot?: string
}): OpenLocalFolderPlan {
  if (!input.dialog) return { kind: 'cancel' }
  if (!input.workspaceRoot) return { kind: 'cancel' }
  return {
    kind: 'open',
    folderPath: input.dialog.path,
    workspaceRoot: input.workspaceRoot,
  }
}
