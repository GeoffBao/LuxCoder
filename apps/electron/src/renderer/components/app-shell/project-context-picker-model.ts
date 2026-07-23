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

/**
 * 是否应响应 browseRequest 递增。
 * baseline=null 表示选择器刚挂载：只同步基线，不回放历史请求
 * （否则点「新会话/新任务」会误弹系统选文件夹对话框）。
 */
export function shouldHonorBrowseRequest(input: {
  browseRequest: number
  baseline: number | null
}): { honor: boolean; nextBaseline: number } {
  if (input.baseline === null) {
    return { honor: false, nextBaseline: input.browseRequest }
  }
  if (input.browseRequest === input.baseline) {
    return { honor: false, nextBaseline: input.baseline }
  }
  return {
    honor: input.browseRequest > 0,
    nextBaseline: input.browseRequest,
  }
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

  // 动作标签对齐 Cursor/Codex/Kimi：新建优先、浏览次之、会话可跳过
  const actions: PickerAction[] = [
    { id: 'create', label: '新建项目…' },
    { id: 'browse', label: '使用现有文件夹…' },
  ]
  if (needsScanRootGuide) {
    actions.push({ id: 'add-scan-root', label: '添加扫描目录…' })
  }
  if (allowsSkipProject(input.mode)) {
    actions.push({ id: 'skip', label: '不使用项目' })
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
