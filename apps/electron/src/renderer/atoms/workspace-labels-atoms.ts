import { atom } from 'jotai'
import type { WorkspaceLabel } from '@myyoda/shared/labels'

/** 当前 Workspace 的 Label 列表（不含已归档） */
export const workspaceLabelsAtom = atom<WorkspaceLabel[]>([])

/** 从主进程加载当前工作区的标签 */
export async function loadWorkspaceLabels(
  workspaceRoot: string,
  setLabels: (labels: WorkspaceLabel[]) => void,
): Promise<void> {
  try {
    const labels = await window.electronAPI.labels.list(workspaceRoot)
    setLabels(labels)
  } catch {
    setLabels([])
  }
}
