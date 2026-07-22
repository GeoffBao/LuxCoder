# Code 模式引入 craft Project 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Code 侧边栏在工作区组内嵌入 craft Project 子分组，会话可在项目内新建/迁移，显示项目色条与详情入口，并把「项目」措辞改回「工作区」。

**Architecture:** 纯渲染端改动（方案 A）。全局 `ProjectsInitializer` 加载当前工作区项目进现有 `serverKanbanProjectsAtom`，侧边栏用纯函数 view-model 派生项目子分组，渲染收进新组件 `SidebarProjectSubgroup`，`LeftSidebar.tsx` 只留挂载点级 diff。主进程 / IPC / shared 类型零改动（仅 `KanbanProject` 补一个可选 `updatedAt` 字段用于排序）。

**Tech Stack:** React 18 + Jotai + Radix DropdownMenu + bun test。

**Spec:** `docs/plans/2026-07-16-code-mode-craft-projects-design.md`

**关键前置事实（写代码前必读）：**

- `serverKanbanProjectsAtom`（`renderer/atoms/project-atoms.ts`）持有 `KanbanProject[]`，**只装当前工作区的项目**。非当前工作区组不渲染子分组。
- `window.electronAPI.projects.list(workspaceRoot)` 返回 `BrowserProject[]`（= `ProjectConfig` 去掉 `workingDirectory` + `workspaceId`），运行时含 `updatedAt`，与 `KanbanProject` 结构兼容（`WorkBoardView` 已直接互用）。
- `window.electronAPI.projects.onChanged(cb)` 的事件 `{ kind, workspaceId, projects }` 中 **`workspaceId` 是 workspace slug**（主进程 `task-handlers.ts` 用 `basename(workspaceRoot)` 生成），匹配时要和 workspace 的 `slug` 比，不能和 UUID `id` 比。
- 绑定项目走已有命令：`window.electronAPI.sendSessionCommand(sessionId, { kind: 'set_project_id', projectId })`，返回更新后的 `AgentSessionMeta`；主进程自动写入项目 `workingDirectory`（`task-handlers.ts` 已实现并有测试）。参考现成调用：`renderer/components/work/TeambitionPicker.tsx:94-101`。
- `AgentSessionItem` / `AgentProjectGroupItem` 定义在 `LeftSidebar.tsx` 内部（约 2965 / 3277 行起）。
- Work 模式的 `AppMode` 值是 `'cowork'`（`renderer/atoms/app-mode.ts`）。
- 测试跑法：`bun test <file>`；类型检查：`bun run typecheck`（仓库根目录）。

---

### Task 1: 分组纯函数 view-model（TDD）

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`（`KanbanProject` 补 `updatedAt`）
- Create: `apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts`
- Test: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts`

- [ ] **Step 1: 给 `KanbanProject` 补可选 `updatedAt`**

在 `kanban/types.ts` 的 `KanbanProject` interface 中 `archivedAt?: number` 之后加：

```ts
  /** 项目最近更新时间（侧边栏子分组排序用；preload 透传 ProjectConfig.updatedAt） */
  updatedAt?: number
```

- [ ] **Step 2: 写失败的测试**

```ts
import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxcoder/shared'
import type { KanbanProject } from '../kanban/types'
import { buildSidebarProjectGroups } from '../sidebar-project-groups'

function session(id: string, overrides: Partial<AgentSessionMeta> = {}): AgentSessionMeta {
  return { id, title: id, createdAt: 1, updatedAt: 1, ...overrides } as AgentSessionMeta
}

function project(id: string, overrides: Partial<KanbanProject> = {}): KanbanProject {
  return { id, name: id, ...overrides }
}

describe('buildSidebarProjectGroups', () => {
  test('绑定会话归入项目组，未绑定进 unboundSessions', () => {
    const result = buildSidebarProjectGroups(
      [session('s1', { projectId: 'p1' }), session('s2')],
      [project('p1')],
    )
    expect(result.projectGroups).toHaveLength(1)
    expect(result.projectGroups[0]!.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s2'])
  })

  test('空项目也输出分组（会话数 0）', () => {
    const result = buildSidebarProjectGroups([], [project('p1')])
    expect(result.projectGroups).toHaveLength(1)
    expect(result.projectGroups[0]!.sessions).toEqual([])
  })

  test('归档项目不输出，其会话回退到未绑定', () => {
    const result = buildSidebarProjectGroups(
      [session('s1', { projectId: 'p1' })],
      [project('p1', { archivedAt: 123 })],
    )
    expect(result.projectGroups).toEqual([])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s1'])
  })

  test('projectId 指向不存在的项目时回退到未绑定', () => {
    const result = buildSidebarProjectGroups([session('s1', { projectId: 'ghost' })], [])
    expect(result.unboundSessions.map((s) => s.id)).toEqual(['s1'])
  })

  test('项目按 updatedAt 降序，组内会话按 updatedAt 降序', () => {
    const result = buildSidebarProjectGroups(
      [
        session('old', { projectId: 'p1', updatedAt: 10 }),
        session('new', { projectId: 'p1', updatedAt: 20 }),
      ],
      [project('p1', { updatedAt: 5 }), project('p2', { updatedAt: 9 })],
    )
    expect(result.projectGroups.map((g) => g.project.id)).toEqual(['p2', 'p1'])
    expect(result.projectGroups[1]!.sessions.map((s) => s.id)).toEqual(['new', 'old'])
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `sidebar-project-groups.ts`**

```ts
import type { AgentSessionMeta } from '@luxcoder/shared'
import type { KanbanProject } from './kanban/types'

export interface SidebarProjectGroup {
  project: KanbanProject
  sessions: AgentSessionMeta[]
}

export interface SidebarProjectGroupsResult {
  /** 按 project.updatedAt 降序；含空项目 */
  projectGroups: SidebarProjectGroup[]
  /** 未绑定（或绑定了归档/已删项目）的会话，保持输入顺序 */
  unboundSessions: AgentSessionMeta[]
}

/** 把工作区会话按 craft Project 派生成侧边栏子分组；纯函数，不做 IO。 */
export function buildSidebarProjectGroups(
  sessions: AgentSessionMeta[],
  projects: KanbanProject[],
): SidebarProjectGroupsResult {
  const activeProjects = projects.filter((candidate) => !candidate.archivedAt)
  const activeProjectIds = new Set(activeProjects.map((candidate) => candidate.id))
  const sessionsByProject = new Map<string, AgentSessionMeta[]>()
  const unboundSessions: AgentSessionMeta[] = []

  for (const session of sessions) {
    if (session.projectId && activeProjectIds.has(session.projectId)) {
      const list = sessionsByProject.get(session.projectId) ?? []
      list.push(session)
      sessionsByProject.set(session.projectId, list)
    } else {
      unboundSessions.push(session)
    }
  }

  const projectGroups = activeProjects
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((project) => ({
      project,
      sessions: (sessionsByProject.get(project.id) ?? [])
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))

  return { projectGroups, unboundSessions }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts`
Expected: 5 pass

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts \
  apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts \
  apps/electron/src/renderer/components/app-shell/kanban/types.ts
git commit -m "feat: 侧边栏项目子分组 view-model（纯函数 + 单测）"
```

---

### Task 2: ProjectsInitializer 全局加载项目

**Files:**
- Create: `apps/electron/src/renderer/components/ProjectsInitializer.tsx`
- Modify: `apps/electron/src/renderer/main.tsx`（挂载）
- Modify: `apps/electron/src/renderer/components/work/WorkBoardView.tsx`（移除初始项目拉取）

- [ ] **Step 1: 实现 `ProjectsInitializer.tsx`**

```tsx
import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'

/**
 * ProjectsInitializer
 *
 * 按当前工作区加载 craft Project 列表进全局 atom，并订阅 projects 变更广播。
 * Code 侧边栏与 Work 看板共享同一份项目状态（对齐 craft 的 projectsAtom 模式）。
 */
export function ProjectsInitializer(): null {
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setProjects = useSetAtom(serverKanbanProjectsAtom)

  const currentSlug = workspaces.find((candidate) => candidate.id === currentWorkspaceId)?.slug ?? null

  useEffect(() => {
    let cancelled = false
    if (!currentSlug) {
      setProjects([])
      return () => { cancelled = true }
    }
    window.electronAPI.getWorkspaceRootPath(currentSlug)
      .then((root) => window.electronAPI.projects.list(root))
      .then((projects) => { if (!cancelled) setProjects(projects) })
      .catch((error: unknown) => {
        console.error('[ProjectsInitializer] 加载项目列表失败:', error)
        if (!cancelled) setProjects([])
      })
    return () => { cancelled = true }
  }, [currentSlug, setProjects])

  useEffect(() => {
    if (!currentSlug) return
    // 广播里的 workspaceId 是 workspace slug（主进程 basename(workspaceRoot)）
    const off = window.electronAPI.projects.onChanged((event) => {
      if (event.workspaceId !== currentSlug) return
      setProjects(event.projects)
    })
    return off
  }, [currentSlug, setProjects])

  return null
}
```

注意：`projects.list` 返回的 `BrowserProject` 与 `KanbanProject` 结构兼容（`WorkBoardView` 已如此互用）；若 typecheck 报类型不容，检查 `projects.onChanged` 回调事件的 `projects` 类型并按 `WorkBoardView` 现有写法处理，不新增转换层。

- [ ] **Step 2: 挂载到 `main.tsx`**

主窗口渲染块（`<AutomationInitializer />` 之后）加一行：

```tsx
      <ProjectsInitializer />
```

顶部对应 `import { ProjectsInitializer } from './components/ProjectsInitializer'`。

- [ ] **Step 3: `WorkBoardView` 移除初始项目拉取**

删除这个 effect（约 181-185 行，以实际代码为准）：

```tsx
  React.useEffect(() => {
    if (!workspaceRoot) return
    void refreshProjects().catch(...)
  }, [refreshProjects, workspaceRoot])
```

保留 `refreshProjects` 回调本身（`ProjectsListPanel` 创建/更新后仍用它手动刷新），以及 `handleProjectChanged` / `handleProjectDeleted` 的本地 upsert 逻辑。

- [ ] **Step 4: 验证**

Run: `bun run typecheck`，Expected: 通过。
手动冒烟（可选）：`bun run dev`，Code 模式下不打开 Work，切换工作区后在 React DevTools 或 Work 看板确认项目列表已就位。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/ProjectsInitializer.tsx \
  apps/electron/src/renderer/main.tsx \
  apps/electron/src/renderer/components/work/WorkBoardView.tsx
git commit -m "feat: 全局 ProjectsInitializer，Code/Work 共享项目状态"
```

---

### Task 3: `workViewAtom`（Work 视图状态提升）

**Files:**
- Modify: `apps/electron/src/renderer/atoms/project-atoms.ts`
- Modify: `apps/electron/src/renderer/components/work/WorkBoardView.tsx`

- [ ] **Step 1: 新增 atom**

`project-atoms.ts` 末尾加：

```ts
/** Work 主区视图：看板或项目详情。提升为 atom 以支持 Code 侧边栏「项目详情」跨模式跳转。 */
export const workViewAtom = atom<'board' | 'project'>('board')
```

- [ ] **Step 2: `WorkBoardView` 改用 atom**

把 `const [view, setView] = React.useState<WorkView>('board')` 替换为：

```tsx
  const [view, setView] = useAtom(workViewAtom)
```

删除本地 `WorkView` type（atom 已定义联合类型），其余 `setView(...)` 调用不变。

- [ ] **Step 3: 验证 + Commit**

Run: `bun run typecheck`，Expected: 通过。

```bash
git add apps/electron/src/renderer/atoms/project-atoms.ts \
  apps/electron/src/renderer/components/work/WorkBoardView.tsx
git commit -m "refactor: Work 视图状态提升为 workViewAtom"
```

---

### Task 4: `SidebarProjectSubgroup` 渲染组件

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（导出 `AgentSessionItem` 及其依赖类型）
- Create: `apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx`

- [ ] **Step 1: 导出 `AgentSessionItem`**

`LeftSidebar.tsx` 中把 `const AgentSessionItem = React.memo(...)` 改为 `export const AgentSessionItem = React.memo(...)`；若 `SessionIndicatorStatus` / `getSessionLeftAccent` 等被新组件用到且未导出，同样加 `export`（只加关键字，不搬代码）。

- [ ] **Step 2: 实现 `SidebarProjectSubgroup.tsx`**

```tsx
import * as React from 'react'
import { ChevronRight, Info, Plus } from 'lucide-react'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentSessionItem } from './LeftSidebar'
import type { SidebarProjectGroup } from './sidebar-project-groups'

export interface SidebarProjectSubgroupProps {
  group: SidebarProjectGroup
  activeSessionId: string | null
  relativeTimeNow: number
  /** 会话行状态徽标映射（与 AgentProjectGroupItem 同源） */
  agentIndicatorMap: Map<string, import('./LeftSidebar').SessionIndicatorStatus>
  onNewSessionInProject: (projectId: string) => Promise<void>
  onOpenProjectDetail: (projectId: string) => void
  /** 以下透传给 AgentSessionItem，与工作区组内会话行为完全一致 */
  onSelectSession: (id: string, title: string) => void
  onRequestDelete: (id: string) => void
  onRequestMove: (id: string) => void
  onRename: (id: string, newTitle: string) => Promise<void>
  onTogglePin: (id: string) => Promise<void>
  onToggleArchive: (id: string) => Promise<void>
}

/**
 * 侧边栏项目子分组：分组头（色点 + 名称 + 会话数 + hover「+」/详情）+ 组内会话列表。
 * 独立成文件：LeftSidebar.tsx 是 Proma 移植冲突热点，只留挂载点。
 */
export function SidebarProjectSubgroup({
  group,
  activeSessionId,
  relativeTimeNow,
  agentIndicatorMap,
  onNewSessionInProject,
  onOpenProjectDetail,
  onSelectSession,
  onRequestDelete,
  onRequestMove,
  onRename,
  onTogglePin,
  onToggleArchive,
}: SidebarProjectSubgroupProps): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState(false)
  const color = group.project.color ?? 'var(--muted-foreground)'

  return (
    <div className="flex flex-col">
      <div className="group/subproject relative flex items-center">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-1 py-0.5 rounded-md text-left text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.025] titlebar-no-drag group-hover/subproject:pr-11"
        >
          <span className="size-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="flex-1 min-w-0 truncate text-xs font-medium leading-[18px]">{group.project.name}</span>
          <span className="flex-shrink-0 text-[10px] text-foreground/30">{group.sessions.length}</span>
          <ChevronRight size={11} className={cn('flex-shrink-0 text-foreground/30 transition-transform', collapsed ? '-rotate-90' : 'rotate-90')} />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`在「${group.project.name}」中新建会话`}
              onClick={() => void onNewSessionInProject(group.project.id)}
              className="absolute right-5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-foreground/30 opacity-0 transition-colors hover:bg-foreground/[0.055] hover:text-foreground/65 group-hover/subproject:opacity-100 titlebar-no-drag"
            >
              <Plus size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">在此项目中新建会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`「${group.project.name}」项目详情`}
              onClick={() => onOpenProjectDetail(group.project.id)}
              className="absolute right-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-foreground/30 opacity-0 transition-colors hover:bg-foreground/[0.055] hover:text-foreground/65 group-hover/subproject:opacity-100 titlebar-no-drag"
            >
              <Info size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">项目详情</TooltipContent>
        </Tooltip>
      </div>
      {!collapsed && group.sessions.length > 0 && (
        <div className="ml-3 flex flex-col gap-0.5">
          {group.sessions.map((session: AgentSessionMeta) => (
            <AgentSessionItem
              key={session.id}
              session={session}
              active={session.id === activeSessionId}
              indicatorStatus={agentIndicatorMap.get(session.id) ?? 'idle'}
              showPinIcon={!!session.pinned}
              projectColor={group.project.color}
              relativeTimeNow={relativeTimeNow}
              onSelect={onSelectSession}
              onRequestDelete={onRequestDelete}
              onRequestMove={onRequestMove}
              onRename={onRename}
              onTogglePin={onTogglePin}
              onToggleArchive={onToggleArchive}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

注意：`AgentSessionItem` 的实际 props 以 `LeftSidebar.tsx` 现有定义为准（如 `indicatorStatus` 默认值、`leftAccent` 等），按现有签名对齐；`projectColor` 是 Task 5 才加的新 prop，本 Task 先写上，Task 5 落地。`'idle'` 若不是合法的 `SessionIndicatorStatus` 取值，用现有枚举的默认值替换。

- [ ] **Step 3: 验证 + Commit**

Run: `bun run typecheck`（预期：仅 `projectColor` 未定义的错误，Task 5 消除；若有其他错误先修）。

```bash
git add apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx \
  apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat: SidebarProjectSubgroup 项目子分组组件"
```

---

### Task 5: LeftSidebar 挂载 + 色条 + 移动到项目 + 措辞

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: `AgentSessionItem` 加 `projectColor` 色条**

props 加 `projectColor?: string`；根元素（relative 容器）内加：

```tsx
      {projectColor && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
          style={{ backgroundColor: projectColor }}
        />
      )}
```

- [ ] **Step 2: `AgentSessionItem` 右键菜单加「移动到项目…」**

props 加：

```ts
  /** 当前工作区项目列表；空数组时不渲染「移动到项目」入口 */
  projects?: import('./kanban/types').KanbanProject[]
  onMoveToProject?: (sessionId: string, projectId?: string) => void
```

在现有菜单（含「移动到工作区」项附近）加 `DropdownMenuSub`：

```tsx
          {projects && projects.length > 0 && onMoveToProject && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs py-1 [&>svg]:size-3.5">
                <FolderInput size={14} />
                移动到项目
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44 z-[9999] min-w-0 p-0.5">
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    disabled={project.id === session.projectId}
                    className="text-xs py-1"
                    onSelect={() => onMoveToProject(session.id, project.id)}
                  >
                    <span className="mr-1.5 size-2 rounded-full" style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }} />
                    {project.name}
                  </DropdownMenuItem>
                ))}
                {session.projectId && (
                  <>
                    <DropdownMenuSeparator className="my-0.5" />
                    <DropdownMenuItem className="text-xs py-1" onSelect={() => onMoveToProject(session.id, undefined)}>
                      移出项目
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
```

`DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` 从 `@/components/ui/dropdown-menu` 导入（该文件已有这些导出，若无则按 Radix 标准补）。图标 `FolderInput` 来自 `lucide-react`。

- [ ] **Step 3: LeftSidebar 顶层新增三个回调**

在 `createAgentSessionInWorkspace` 附近加（依赖项按现有 lint 提示补全）：

```tsx
  /** 在指定项目中新建会话：建会话 → set_project_id（主进程自动继承项目 workingDirectory） */
  const createAgentSessionInProject = React.useCallback(async (projectId: string): Promise<void> => {
    try {
      const meta = await window.electronAPI.createAgentSession(undefined, agentChannelId || undefined, currentWorkspaceId ?? undefined)
      const updated = await window.electronAPI.sendSessionCommand(meta.id, { kind: 'set_project_id', projectId })
      setAgentSessions((prev) => [updated, ...prev.filter((s) => s.id !== updated.id)])
      // 与 createAgentSessionInWorkspace 一致：选中新会话（复用其打开逻辑，如 openSession/setCurrentAgentSessionId）
    } catch (error) {
      console.error('[侧边栏] 在项目中新建会话失败:', error)
      toast.error('新建会话失败')
    }
  }, [agentChannelId, currentWorkspaceId, setAgentSessions])

  /** 迁移会话进/出项目 */
  const handleMoveToProject = React.useCallback(async (sessionId: string, projectId?: string): Promise<void> => {
    try {
      const updated = await window.electronAPI.sendSessionCommand(sessionId, { kind: 'set_project_id', projectId })
      setAgentSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch (error) {
      console.error('[侧边栏] 移动到项目失败:', error)
      toast.error('移动到项目失败')
    }
  }, [setAgentSessions])

  /** Code 侧边栏打开项目详情：跳 Work 模式的 ProjectInfoPage */
  const setSelectedProjectId = useSetAtom(selectedProjectIdAtom)
  const setWorkView = useSetAtom(workViewAtom)
  const handleOpenProjectDetail = React.useCallback((projectId: string): void => {
    setSelectedProjectId(projectId)
    setWorkView('project')
    setMode('cowork')
  }, [setMode, setSelectedProjectId, setWorkView])
```

新增 imports：`selectedProjectIdAtom, serverKanbanProjectsAtom, workViewAtom` from `@/atoms/project-atoms`。并读取项目列表：

```tsx
  const kanbanProjects = useAtomValue(serverKanbanProjectsAtom)
```

- [ ] **Step 4: `AgentProjectGroupItem` 挂载子分组**

props 加：

```ts
  /** 当前工作区的 craft Project 列表；非当前工作区组传 [] */
  projects: KanbanProject[]
  onNewSessionInProject: (projectId: string) => Promise<void>
  onOpenProjectDetail: (projectId: string) => void
  onMoveToProject: (sessionId: string, projectId?: string) => void
```

组件体内，把现有 `const treeItems = buildAgentSessionTrees(group.sessions)` 改为：

```tsx
  const { projectGroups, unboundSessions } = buildSidebarProjectGroups(group.sessions, projects)
  const treeItems = buildAgentSessionTrees(unboundSessions)
```

会话列表容器（`id="project-sessions-..."` 的 div，展开分支）顶部、现有 sessions 渲染之前插入：

```tsx
              {projectGroups.map((projectGroup) => (
                <SidebarProjectSubgroup
                  key={projectGroup.project.id}
                  group={projectGroup}
                  activeSessionId={activeSessionId}
                  relativeTimeNow={relativeTimeNow}
                  agentIndicatorMap={agentIndicatorMap}
                  onNewSessionInProject={onNewSessionInProject}
                  onOpenProjectDetail={onOpenProjectDetail}
                  onSelectSession={onSelectSession}
                  onRequestDelete={onRequestDelete}
                  onRequestMove={onRequestMove}
                  onRename={onRename}
                  onTogglePin={onTogglePin}
                  onToggleArchive={onToggleArchive}
                />
              ))}
```

注意「空组不再显示占位」：原先 `treeItems.length > 0` 的空态判断改为 `treeItems.length > 0 || projectGroups.length > 0`。

现有工作区组内的 `AgentSessionItem` 调用处透传 `projects={projects}`、`onMoveToProject={onMoveToProject}`，并加色条查找：

```tsx
  const projectColorMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) { if (p.color) map.set(p.id, p.color) }
    return map
  }, [projects])
```

`AgentSessionItem` 传 `projectColor={item.session.projectId ? projectColorMap.get(item.session.projectId) : undefined}`。

- [ ] **Step 5: LeftSidebar 渲染处传参**

`<AgentProjectGroupItem ...>` 调用处（真实工作区组与合成自动任务组两处）加：

```tsx
                    projects={!isAuto && group.workspace.id === currentWorkspaceId ? kanbanProjects : []}
                    onNewSessionInProject={createAgentSessionInProject}
                    onOpenProjectDetail={handleOpenProjectDetail}
                    onMoveToProject={(sessionId, projectId) => void handleMoveToProject(sessionId, projectId)}
```

置顶会话列表（跨项目区）的 `AgentSessionItem` 也传 `projectColor`（用同一 `kanbanProjects` 建 map；跨工作区会话查不到色即不显示，符合 spec）。

- [ ] **Step 6: 措辞修正「项目」→「工作区」**

只改 workspace 语义的字符串（craft Project 相关的不动）。逐条替换 `LeftSidebar.tsx`：

- `在此项目中新建会话` → `在此工作区中新建会话`（AgentProjectGroupItem 内 Tooltip；SidebarProjectSubgroup 的同名 Tooltip 是真项目，不改）
- `设为当前项目` → `设为当前工作区`
- `项目菜单`（aria-label）→ `工作区菜单`
- `删除项目`（菜单项与确认弹窗标题/文案）→ `删除工作区`
- `默认项目不能删除` / `至少需要保留一个项目` → `默认工作区不能删除` / `至少需要保留一个工作区`
- `项目已删除` → `工作区已删除`
- `项目排序失败` → `工作区排序失败`
- 新建项目输入相关文案（`creatingProject` 一带）→ 新建工作区

替换后 `rg '项目' apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` 复查：剩余的「项目」应全部指 craft Project（子分组、移动到项目、项目详情、项目色条）或注释中的历史语义（注释一并更正为「工作区」）。

- [ ] **Step 7: 验证**

Run: `bun run typecheck` → 通过；`bun test apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts` → 通过。

手动冒烟：`bun run dev`
1. Work 面板建一个带颜色的项目 → Code 侧边栏当前工作区组内出现项目子分组（空组可见）
2. 子分组「+」新建会话 → 会话出现在子分组下且带色条；发消息确认系统提示词含项目上下文（可看会话首条 system 注入或项目 workingDirectory 生效）
3. 未绑定会话右键「移动到项目」→ 进组；「移出项目」→ 回未绑定日期分组
4. 子分组「详情」→ 跳到 Work 模式项目详情页
5. Work 看板按项目过滤能看到 Code 里绑定的会话

- [ ] **Step 8: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx \
  apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx
git commit -m "feat: Code 侧边栏嵌入 craft Project 子分组（绑定/色条/详情/措辞）"
```

---

### Task 6: 收尾（全量验证 + 版本递增）

**Files:**
- Modify: `apps/electron/package.json`（patch +1）

- [ ] **Step 1: 全量测试与类型检查**

Run: `bun test` → 全绿（重点看 `kanban-view-model.test.ts`、`task-handlers.test.ts` 无回归）；`bun run typecheck` → 通过。

- [ ] **Step 2: 版本递增**

读 `apps/electron/package.json` 当前 `version`，patch +1（如 `0.10.x` → `0.10.x+1`）。仅动了 electron 包；若实现中动过 `packages/shared`（本计划未动，`kanban/types.ts` 在 electron 包内），无需其他递增。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/package.json
git commit -m "chore: bump @proma/electron patch（Code 模式 craft Project）"
```

---

## Self-Review 结果

- **Spec 覆盖**：数据流（Task 2）、侧边栏结构与 view-model（Task 1/4/5）、绑定交互（Task 5 Step 2/3）、色条与详情入口（Task 5 Step 1/3、Task 3）、措辞（Task 5 Step 6）、测试与版本（Task 1/6）。无缺口。
- **类型一致性**：`buildSidebarProjectGroups(sessions, projects)` / `SidebarProjectGroup` / `projectColor` / `onMoveToProject(sessionId, projectId?)` 各 Task 间签名一致；`workViewAtom` 取值 `'board' | 'project'` 与 `WorkBoardView` 现有 `WorkView` 一致。
- **已知适配点（非占位符，执行时按现场代码对齐）**：`AgentSessionItem` 的完整 props 签名、`SessionIndicatorStatus` 默认值、`createAgentSessionInWorkspace` 的选中/打开后续逻辑——均以 `LeftSidebar.tsx` 现有实现为准，计划中已标注。
