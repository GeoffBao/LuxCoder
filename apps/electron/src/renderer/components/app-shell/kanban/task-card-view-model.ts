import type { KanbanItem } from './types'

export interface TaskCardViewModel {
  projectName: string | null
  labelIds: string[]
  showSessionStatus: boolean
}

const IMPORTANT_SESSION_STATUSES = new Set([
  'running',
  'in-progress',
  'queued',
  'blocked',
  'failed',
  'error',
])

/**
 * 看板只突出 Task 主状态；Session/Run 是临时执行信号，正常完成后不长期与 Workflow 并列。
 */
export function buildTaskCardViewModel(item: KanbanItem): TaskCardViewModel {
  const projectName = item.project?.name
    ?? (item.task?.scope.kind === 'workspace' ? 'Workspace' : null)
  return {
    projectName,
    labelIds: item.task?.labelIds ?? [],
    showSessionStatus: IMPORTANT_SESSION_STATUSES.has(item.session.sessionStatus ?? ''),
  }
}
