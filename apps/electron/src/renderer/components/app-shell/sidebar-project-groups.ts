import type { KanbanProject } from './kanban/types'

/** 项目 ID → 主题色映射；无 color 的项目不入映射（会话行查不到即不渲染色条）。 */
export function buildProjectColorMap(projects: KanbanProject[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const project of projects) {
    if (project.color) map.set(project.id, project.color)
  }
  return map
}
