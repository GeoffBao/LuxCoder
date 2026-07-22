/**
 * ProjectContextPicker 纯模型 — 分区与跳过规则
 */

export type ProjectContextPickerMode = 'session' | 'task'

export interface PickerProject {
  id: string
  name: string
  workingDirectory?: string
  updatedAt: number | string
  archivedAt?: number | string
}

export interface DiscoveredRepo {
  path: string
  name: string
}

export type PickerActionId = 'browse' | 'create' | 'skip' | 'add-scan-root'

export interface PickerAction {
  id: PickerActionId
  label: string
}

export interface PickerSections {
  recents: PickerProject[]
  existing: PickerProject[]
  discovery: {
    items: DiscoveredRepo[]
    needsScanRootGuide: boolean
  }
  actions: PickerAction[]
}

export function allowsSkipProject(mode: ProjectContextPickerMode): boolean {
  return mode === 'session'
}

export function clampDiscoveryDepth(depth: number | undefined): number {
  if (depth === undefined || Number.isNaN(depth)) return 3
  return Math.min(5, Math.max(1, Math.floor(depth)))
}

function normalizePathForCompare(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function buildPickerSections(input: {
  mode: ProjectContextPickerMode
  projects: PickerProject[]
  recentProjectIds: string[]
  discovered: DiscoveredRepo[]
  scanRoots: string[]
}): PickerSections {
  const active = input.projects.filter((project) => !project.archivedAt)
  const byId = new Map(active.map((project) => [project.id, project]))

  const recents: PickerProject[] = []
  for (const id of input.recentProjectIds) {
    const project = byId.get(id)
    if (project) recents.push(project)
  }

  const existing = [...active].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

  const boundPaths = new Set(
    active
      .map((project) => project.workingDirectory)
      .filter((path): path is string => Boolean(path && path.trim()))
      .map(normalizePathForCompare),
  )

  const needsScanRootGuide = input.scanRoots.length === 0
  const discoveryItems = needsScanRootGuide
    ? []
    : input.discovered.filter((repo) => !boundPaths.has(normalizePathForCompare(repo.path)))

  const actions: PickerAction[] = [
    { id: 'browse', label: '浏览…' },
    { id: 'create', label: '新建项目…' },
  ]
  if (needsScanRootGuide) {
    actions.push({ id: 'add-scan-root', label: '添加扫描目录…' })
  }
  if (allowsSkipProject(input.mode)) {
    actions.push({ id: 'skip', label: '无项目' })
  }

  return {
    recents,
    existing,
    discovery: {
      items: discoveryItems,
      needsScanRootGuide,
    },
    actions,
  }
}
