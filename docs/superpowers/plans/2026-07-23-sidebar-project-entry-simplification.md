# 侧栏「项目」入口简化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「项目」从会话列表的投影切换（跟「最近会话」二选一）提升为跟 Workspace 选择器平级的独立轻量入口，会话列表恒定按时间平铺，列表头只保留「会话｜看板」一个开关。

**Architecture:** 新建 `ProjectSwitcher.tsx`（镜像 `WorkspaceSwitcher.tsx` 结构）承接项目导航与管理操作；`LeftSidebar.tsx` 内联组件 `AgentProjectGroupItem` 删除按项目分子组渲染的分支，恒定平铺全部会话且恒传真实 `projects`（此前"最近会话"模式因误把 `projects` 置空，连带丢了项目色点，这次一并修复）；删除 `sidebarSessionViewModeAtom`、`SidebarSessionViewToggle`、`SidebarProjectSubgroup` 三个只服务于旧投影切换的文件，以及 `sidebar-project-groups.ts`/`sidebar-session-views.ts` 里只被它们使用的函数。

**Tech Stack:** React 18 + TypeScript + Jotai + Tailwind CSS，Electron renderer 进程。`AgentProjectGroupItem`/`ProjectSwitcher` 属于纯展示层，无组件测试基建（沿用上一个 plan 的结论）；`sidebar-project-groups.ts`/`sidebar-session-views.ts` 是纯函数层，有 `bun:test` 单测覆盖，本次改动需要同步更新测试。

---

## 依赖说明

本计划的每个任务都在同一个文件（`LeftSidebar.tsx`）里做互相关联的删除/新增，比典型的"各任务touch不同文件"耦合更紧。Task 1-3（纯函数层清理）互相独立可任选顺序，但 Task 4-8（`LeftSidebar.tsx` 内部改动）必须**按顺序执行**——后一个任务的"当前状态"依赖前一个任务已经完成的删除，不要跳跃或并行处理 Task 4-8。

---

### Task 1: 删除 `sidebar-project-groups.ts` 里的 `buildSidebarProjectGroups`

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts`
- Delete: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts`

- [ ] **Step 1: 确认这个测试文件只测 `buildSidebarProjectGroups`**

Run: `cat apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts`
Expected: 全部 8 个 `test(...)` 都是 `describe('buildSidebarProjectGroups', ...)` 下的用例，没有测 `buildProjectColorMap`。

- [ ] **Step 2: 删除测试文件**

```bash
rm apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts
```

- [ ] **Step 3: 重写 `sidebar-project-groups.ts`，只保留 `buildProjectColorMap`**

把文件内容替换为：

```ts
import type { KanbanProject } from './kanban/types'

/** 项目 ID → 主题色映射；无 color 的项目不入映射（会话行查不到即不渲染色条）。 */
export function buildProjectColorMap(projects: KanbanProject[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const project of projects) {
    if (project.color) map.set(project.id, project.color)
  }
  return map
}
```

（`SidebarProjectGroup`/`SidebarProjectGroupsResult` 接口和 `buildSidebarProjectGroups` 函数、`AgentSessionMeta` 类型导入一并删除——它们只被刚删除的测试和即将在 Task 4/6 里删除的 `SidebarProjectSubgroup.tsx`/`AgentProjectGroupItem` 分组分支使用。）

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 此时**会报错**——`SidebarProjectSubgroup.tsx` 和 `LeftSidebar.tsx` 还在导入 `buildSidebarProjectGroups`/`SidebarProjectGroup`。这是预期的中间态，继续往下做 Task 2-3 清理掉这些引用后错误会消失。不要在这一步止步或尝试单独修复。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts
git add apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts
git commit -m "refactor(ui): remove buildSidebarProjectGroups, keep buildProjectColorMap"
```

---

### Task 2: 清理 `sidebar-session-views.ts` 里已废弃的投影函数

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts`

- [ ] **Step 1: 重写 `sidebar-session-views.ts`，只保留 `buildRecentSessionList`**

把文件内容替换为：

```ts
/**
 * 侧栏「最近会话」排序纯函数
 * 数据源同一批 AgentSessionMeta，不创建副本。
 */

import type { AgentSessionMeta } from '@luxcoder/shared'

export function buildRecentSessionList(
  sessions: AgentSessionMeta[],
): AgentSessionMeta[] {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
```

（`buildProjectSessionView`、`sameSessionIdSet`、`KanbanProject`/`SidebarProjectGroupsResult` 相关导入一并删除——全仓核实过除了本文件自己的测试外没有其他消费方。）

- [ ] **Step 2: 重写测试文件，只保留 `buildRecentSessionList` 的覆盖**

把 `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts` 替换为：

```ts
import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { buildRecentSessionList } from '../sidebar-session-views.ts'

function session(partial: Partial<AgentSessionMeta> & Pick<AgentSessionMeta, 'id' | 'updatedAt'>): AgentSessionMeta {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? partial.updatedAt,
    updatedAt: partial.updatedAt,
    projectId: partial.projectId,
    workspaceId: partial.workspaceId ?? 'ws-1',
  } as AgentSessionMeta
}

describe('buildRecentSessionList', () => {
  test('按 updatedAt 降序排列，含未归类与 Project Session', () => {
    const sessions = [
      session({ id: 's-unbound', updatedAt: 100, title: '临时' }),
      session({ id: 's-proj', updatedAt: 200, projectId: 'p1', title: '项目会话' }),
      session({ id: 's-old', updatedAt: 50, projectId: 'p1', title: '旧' }),
    ]

    const recent = buildRecentSessionList(sessions)

    expect(recent.map((s) => s.id)).toEqual(['s-proj', 's-unbound', 's-old'])
  })

  test('不修改入参数组，返回新数组', () => {
    const sessions = [
      session({ id: 'a', updatedAt: 1 }),
      session({ id: 'b', updatedAt: 2 }),
    ]
    const original = [...sessions]

    buildRecentSessionList(sessions)

    expect(sessions).toEqual(original)
  })
})
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd apps/electron && bun test sidebar-session-views`
Expected: 2 pass, 0 fail

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 仍会报 `LeftSidebar.tsx`/`SidebarProjectSubgroup.tsx` 相关的中间态错误（同 Task 1 Step 4），继续往下做即可。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts
git add apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts
git commit -m "refactor(ui): remove unused buildProjectSessionView/sameSessionIdSet"
```

---

### Task 3: 删除 `SidebarProjectSubgroup.tsx`、`SidebarSessionViewToggle.tsx`、`sidebar-session-view.ts`

**Files:**
- Delete: `apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx`
- Delete: `apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx`
- Delete: `apps/electron/src/renderer/atoms/sidebar-session-view.ts`

- [ ] **Step 1: 确认这三个文件除 `LeftSidebar.tsx` 外没有其他消费方**

Run: `grep -rln "SidebarProjectSubgroup\|SidebarSessionViewToggle\|sidebar-session-view'" apps/electron/src/renderer --include="*.ts" --include="*.tsx"`
Expected: 只出现 `LeftSidebar.tsx` 和这三个文件自身（`sidebar-session-view.ts` 定义 `sidebarSessionViewModeAtom`，被 `SidebarSessionViewToggle.tsx` 和 `LeftSidebar.tsx` 引用）。如果出现意料之外的第四个文件，停下汇报，不要继续删除。

- [ ] **Step 2: 删除三个文件**

```bash
rm apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx
rm apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx
rm apps/electron/src/renderer/atoms/sidebar-session-view.ts
```

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 仍会报 `LeftSidebar.tsx` 里对这三者的 import 找不到模块——预期的中间态，Task 4-7 会清理。

- [ ] **Step 4: Commit**

```bash
git add -A apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx
git add -A apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx
git add -A apps/electron/src/renderer/atoms/sidebar-session-view.ts
git commit -m "refactor(ui): delete SidebarProjectSubgroup/SidebarSessionViewToggle/sidebar-session-view atom"
```

---

### Task 4: `AgentProjectGroupItem` 删除分组渲染，恒定平铺

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

这是 `LeftSidebar.tsx` 内部改动的第一步，聚焦文件内联组件 `AgentProjectGroupItem`（约 3607-4010 行区间，实际行号因前面任务已改动此文件而可能漂移，用下面的代码片段定位而非硬编码行号）。

- [ ] **Step 1: 更新 `AgentProjectGroupItemProps` 接口，删除 4 个只服务于分组渲染的 prop**

找到接口定义（`interface AgentProjectGroupItemProps { ... }`），删除这 4 行：

```diff
-  /** 当前选中的 craft Project ID（驱动子分组高亮 / 自动展开 / 滚动） */
-  selectedProjectId: string | null
   /** 隐藏 Workspace 组头（当前 Workspace 已由顶栏 WorkspaceSwitcher 展示） */
   hideWorkspaceHeader?: boolean
-  /** 未归类会话分区标题 */
-  unboundSectionLabel?: string
-  onNewSessionInProject: (projectId: string) => Promise<void>
-  onOpenProjectDetail: (projectId: string) => void
-  onDeleteProject: (projectId: string) => void | Promise<void>
   onMoveToProject: (sessionId: string, projectId?: string) => void | Promise<void>
```

（`hideWorkspaceHeader`、`onMoveToProject` 保留，只是作为上下文锚点展示在 diff 里，不要删除它们本身。）

- [ ] **Step 2: 同步更新函数参数解构，删除对应的 4 个字段**

函数签名 `const AgentProjectGroupItem = React.memo(function AgentProjectGroupItem({ ... }: AgentProjectGroupItemProps)` 的解构列表里，删除：

```diff
-  selectedProjectId,
   hideWorkspaceHeader = false,
-  unboundSectionLabel,
-  onNewSessionInProject,
-  onOpenProjectDetail,
-  onDeleteProject,
   onMoveToProject,
```

- [ ] **Step 3: 删除 `buildSidebarProjectGroups` 调用，`treeItems` 直接来自 `group.sessions`**

找到（含前面那句现在已经过时的注释，一并替换）：

```tsx
  // craft Project 子分组：绑定项目的会话进入各自子分组（始终全量展示），
  // 未绑定会话沿用原有树形 + 折叠预览逻辑。
  const { projectGroups, unboundSessions } = React.useMemo(
    () => buildSidebarProjectGroups(group.sessions, projects, selectedProjectId),
    [group.sessions, projects, selectedProjectId],
  )
  const treeItems = buildAgentSessionTrees(unboundSessions)
```

替换为：

```tsx
  // 会话列表恒定按时间平铺（不再按 craft Project 分子组），项目导航已上移到 ProjectSwitcher。
  const treeItems = buildAgentSessionTrees(group.sessions)
```

- [ ] **Step 4: 简化渲染条件，删除子分组渲染分支**

找到（注意这里 `treeItems.length > 0 || projectGroups.length > 0` 这一行的条件也要改）：

```tsx
        {!collapsed ? (
          treeItems.length > 0 || projectGroups.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {projectGroups.map((projectGroup) => (
                <SidebarProjectSubgroup
                  key={projectGroup.project.id}
                  group={projectGroup}
                  activeSessionId={activeSessionId}
                  relativeTimeNow={relativeTimeNow}
                  agentIndicatorMap={agentIndicatorMap}
                  projects={projects}
                  onNewSessionInProject={onNewSessionInProject}
                  onOpenProjectDetail={onOpenProjectDetail}
                  onDeleteProject={onDeleteProject}
                  onMoveToProject={onMoveToProject}
                  onSelectSession={onSelectSession}
                  onRequestDelete={onRequestDelete}
                  onRequestMove={onRequestMove}
                  onRename={onRename}
                  onTogglePin={onTogglePin}
                  onToggleStar={onToggleStar}
                  onToggleArchive={onToggleArchive}
                />
              ))}

              {unboundSectionLabel && sessions.length > 0 && (
                <div className="px-1.5 pt-1.5 pb-0.5 text-[11px] font-medium text-foreground/40 select-none">
                  {unboundSectionLabel}
                </div>
              )}

              {sessions.map((item) => {
```

替换为：

```tsx
        {!collapsed ? (
          treeItems.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {sessions.map((item) => {
```

（`{sessions.map((item) => {` 这一行和它后面一路到对应的 `))}` 收尾、`{hiddenCount > 0 && (...)}`、`{expanded && (...)}` 这些块**全部原样保留不动**——只是删除了它们前面的 `projectGroups.map` 和 `unboundSectionLabel` 两段。）

- [ ] **Step 4.5: 顺手清理本步骤刚清空的两个 import（代码评审补充，原计划遗漏）**

Step 4 删掉了 `buildSidebarProjectGroups`/`SidebarProjectSubgroup` 在本文件里的最后一处使用，但计划里后续任务都不会去清理文件顶部对它们的 import——不修的话 Task 9 最终 typecheck 会失败且找不到归属任务。就地清理：

```diff
-import { buildProjectColorMap, buildSidebarProjectGroups } from './sidebar-project-groups'
-import { SidebarProjectSubgroup } from './SidebarProjectSubgroup'
+import { buildProjectColorMap } from './sidebar-project-groups'
```

- [ ] **Step 5: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: `AgentProjectGroupItem` 组件本身不再报错；调用方（下一个 Task 处理）仍会因为传了已删除的 prop 而报错，属预期中间态。

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "refactor(ui): AgentProjectGroupItem always renders flat session list"
```

---

### Task 5: 更新 `<AgentProjectGroupItem>` 调用方，简化 `group`/`projects` 传参

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: 定位调用方并核对现状**

找到渲染 `<AgentProjectGroupItem ...>` 的地方（在 `.map((group) => { const isAuto = ...; const forceRecent = ...; return (<AgentProjectGroupItem ...>) })` 内）。当前代码：

```tsx
                const isAuto = group.workspace.id === AUTOMATION_GROUP_ID
                const forceRecent = !isAuto && sidebarSessionViewMode === 'recent'
                return (
                  <AgentProjectGroupItem
                    key={group.workspace.id}
                    group={forceRecent
                      ? {
                          ...group,
                          sessions: buildRecentSessionList(group.sessions),
                        }
                      : group}
```

- [ ] **Step 2: 删除 `forceRecent`，`group` 恒定平铺（自动任务组除外，行为不变）**

```diff
                 const isAuto = group.workspace.id === AUTOMATION_GROUP_ID
-                const forceRecent = !isAuto && sidebarSessionViewMode === 'recent'
                 return (
                   <AgentProjectGroupItem
                     key={group.workspace.id}
-                    group={forceRecent
-                      ? {
-                          ...group,
-                          sessions: buildRecentSessionList(group.sessions),
-                        }
-                      : group}
+                    group={isAuto
+                      ? group
+                      : {
+                          ...group,
+                          sessions: buildRecentSessionList(group.sessions),
+                        }}
```

（自动任务组之前在任何模式下都没被 `forceRecent` 排序过——保持这个行为不变，只对真实项目组应用恒定排序，避免此次改动意外影响自动任务列表的既有顺序。）

- [ ] **Step 3: 简化 `projects` 传参**

找到：

```tsx
                    projects={forceRecent
                      ? EMPTY_PROJECTS
                      : (!isAuto && group.workspace.id === currentWorkspaceId ? currentWorkspaceProjects : EMPTY_PROJECTS)}
```

替换为：

```tsx
                    projects={!isAuto && group.workspace.id === currentWorkspaceId ? currentWorkspaceProjects : EMPTY_PROJECTS}
```

- [ ] **Step 4: 删除已从接口移除的 4 个 prop 的传参**

找到这几行并删除：

```diff
-                    selectedProjectId={selectedProjectId}
                     hideWorkspaceHeader={!isAuto}
-                    unboundSectionLabel="未归类会话"
-                    onOpenProjectDetail={handleOpenProjectDetail}
-                    onDeleteProject={handleDeleteCraftProject}
-                    onNewSessionInProject={createAgentSessionInProject}
```

（`hideWorkspaceHeader={!isAuto}` 保留，只是上下文锚点。）

- [ ] **Step 5: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: `<AgentProjectGroupItem>` 调用处不再报错。`handleOpenProjectDetail`/`handleDeleteCraftProject`/`createAgentSessionInProject` 三个回调函数定义本身现在因为没有调用方而处于"未使用"状态——TypeScript 默认不会因此报错（不是 unused-import），但 Task 6 会明确清理其中两个。`handleOpenProjectDetail` 保留（Task 8 会给它一个新调用方）。

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "refactor(ui): simplify AgentProjectGroupItem call site, always flatten"
```

---

### Task 6: 删除已死的 `handleDeleteCraftProject` / `createAgentSessionInProject`

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: 确认这两个函数现在确实没有调用方**

Run: `grep -n "handleDeleteCraftProject\|createAgentSessionInProject" apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
Expected: 只剩各自的 `const xxx = React.useCallback(...)` 定义本身，没有别的调用点（Task 5 已经删除了唯一的调用处）。

- [ ] **Step 2: 删除 `createAgentSessionInProject` 定义**

找到并删除整段（含前导注释）：

```tsx
  /** 在指定项目中新建 Draft 会话（绑定 projectId + effectiveCwd） */
  const createAgentSessionInProject = React.useCallback(async (projectId: string): Promise<void> => {
    await createAgent({
      draft: true,
      projectId,
      workspaceId: currentWorkspaceId ?? undefined,
      channelId: agentChannelId || undefined,
      modelId: agentModelId || undefined,
    })
  }, [agentChannelId, agentModelId, createAgent, currentWorkspaceId])
```

- [ ] **Step 3: 删除 `handleDeleteCraftProject` 定义**

找到并删除整段（含前导注释，用其 `React.useCallback(...)` 收尾的 `])` 定位结束边界）：

```tsx
  /** 侧栏项目行直接删除 craft Project（缩短「进详情 → …」路径） */
  const handleDeleteCraftProject = React.useCallback(async (projectId: string): Promise<void> => {
    if (!workspaceRootForProjects) {
      toast.error('请先选择工作空间')
      return
    }
    const project = kanbanProjects.find((item) => item.id === projectId)
    if (!project?.slug) {
      toast.error('找不到项目')
      return
    }
    if (!window.confirm(`确定删除项目「${project.name}」及其资产吗？`)) return
    try {
      await window.electronAPI.projects.delete(workspaceRootForProjects, project.slug)
      setKanbanProjects((current) => current.filter((item) => item.id !== projectId))
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null)
        setWorkView('board')
      }
      toast.success('项目已删除')
    } catch (cause) {
      toast.error('删除项目失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }, [
    kanbanProjects,
    selectedProjectId,
    setKanbanProjects,
    setSelectedProjectId,
    setWorkView,
    workspaceRootForProjects,
  ])
```

> 删除项目的能力不会丢失：`ProjectInfoPage.tsx` 已有「删除项目」「归档项目」入口（本计划不改动它）。

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "refactor(ui): remove dead handleDeleteCraftProject/createAgentSessionInProject"
```

---

### Task 7: 简化会话列表头为单一「会话｜看板」开关

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: 替换「会话投影切换」整块**

找到（约在 `<SidebarProjectsSection>`/工作区列表渲染之前，紧邻上一轮 Task 6（headers 那次改造）加进来的 `CodeMainViewSwitchControl` 那一块）：

```tsx
          {/* 会话投影切换：最近会话｜项目（仅切换；新建项目只走顶栏两流） */}
          <div className="px-2 pt-2 pb-1 flex items-center gap-1.5 flex-shrink-0 titlebar-no-drag">
            <div className="flex-1 min-w-0">
              <SidebarSessionViewToggle />
            </div>
            {/* 会话｜看板：切换主区视图（craft 式，挂在会话列表标题行；看板视图自带切回开关）。所在分支已限定 agent 模式，无需再加 mode 守卫 */}
            <CodeMainViewSwitchControl compact />
            {sidebarSessionViewMode === 'projects' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="size-7 flex items-center justify-center rounded-md text-foreground/35 hover:bg-foreground/[0.06] hover:text-foreground/60 transition-colors"
                    aria-label="项目管理"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[9999] min-w-[10rem]">
                  <DropdownMenuItem
                    onSelect={() => setShowArchivedProjects((value) => !value)}
                  >
                    {showArchivedProjects ? '隐藏已归档' : '显示已归档'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { void handleAddScanRoot() }}>
                    添加扫描目录…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      // 先打开新任务流选择器再浏览，避免无 picker 时留下陈旧 browse token
                      setNewTaskProjectFlowOpen(true)
                      window.setTimeout(() => {
                        setBrowseRequest((value) => value + 1)
                      }, 0)
                    }}
                  >
                    浏览文件夹…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {mode === 'agent'
            && sidebarSessionViewMode === 'projects'
            && kanbanProjects.filter((project) => showArchivedProjects || !project.archivedAt).length === 0 ? (
            <div className="mx-2 mb-2 rounded-xl bg-foreground/[0.03] px-3 py-3 text-[12px] leading-relaxed text-foreground/55">
              <p>用「新会话」或「新任务」开始，并在流程中选择或创建项目。</p>
              <button
                type="button"
                className="mt-2 text-[12px] text-primary hover:underline"
                onClick={() => { void handleAddScanRoot() }}
              >
                添加扫描目录…
              </button>
            </div>
          ) : null}
```

替换为：

```tsx
          {/* 会话｜看板：切换主区视图；项目导航已上移到 WorkspaceSwitcher 下方的 ProjectSwitcher */}
          <div className="px-2 pt-2 pb-1 flex items-center justify-end flex-shrink-0 titlebar-no-drag">
            <CodeMainViewSwitchControl compact />
          </div>
```

- [ ] **Step 2: 删除对应的 import**

```diff
-import { sidebarSessionViewModeAtom } from '@/atoms/sidebar-session-view'
-import { SidebarSessionViewToggle } from './SidebarSessionViewToggle'
```

- [ ] **Step 3: 删除 `sidebarSessionViewMode` 的读取**

找到并删除：

```diff
-  const [sidebarSessionViewMode] = useAtom(sidebarSessionViewModeAtom)
```

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 若 `showArchivedProjects`/`setShowArchivedProjects`/`handleAddScanRoot`/`setNewTaskProjectFlowOpen`/`setBrowseRequest` 在别处（如 Task 8 新建的 `ProjectSwitcher` 用量）还没接上，这些变量目前只是"暂时未被使用"，TypeScript 默认配置不会因局部变量未使用而报错，不影响本步骤通过。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat(ui): collapse session list header to single 会话|看板 toggle"
```

---

### Task 8: 新建 `ProjectSwitcher` 组件并接入侧栏

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/ProjectSwitcher.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: 写出 `ProjectSwitcher.tsx`**

```tsx
/**
 * ProjectSwitcher — Code 侧栏项目入口
 * 镜像 WorkspaceSwitcher 结构：左侧 FolderKanban 图标，右侧 Lucide ChevronDown。
 * 轻量下拉导航 + 项目管理操作，不是全屏卡片墙（对应删除的旧「项目中心」）。
 */

import * as React from 'react'
import { ChevronDown, FolderKanban } from 'lucide-react'
import type { KanbanProject } from './kanban/types'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ProjectSwitcherProps {
  /** 当前 Workspace 下的项目列表（调用方已按 showArchivedProjects 过滤） */
  projects: KanbanProject[]
  showArchivedProjects: boolean
  onToggleShowArchived: () => void
  onSelectProject: (projectId: string) => void
  onAddScanRoot: () => void
  onBrowseFolder: () => void
  className?: string
}

export function ProjectSwitcher({
  projects,
  showArchivedProjects,
  onToggleShowArchived,
  onSelectProject,
  onAddScanRoot,
  onBrowseFolder,
  className,
}: ProjectSwitcherProps): React.ReactElement {
  const sortedProjects = React.useMemo(
    () => projects.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [projects],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 h-9 px-2.5 rounded-[10px] text-[13px] font-medium',
            'text-foreground/80 sidebar-control-surface hover:text-foreground transition-colors titlebar-no-drag',
            className,
          )}
          aria-label="项目"
        >
          <FolderKanban size={14} className="shrink-0 text-foreground/45" />
          <span className="flex-1 min-w-0 truncate text-left">项目</span>
          <ChevronDown size={14} className="shrink-0 text-foreground/35" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[9999] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]">
        {sortedProjects.length > 0 ? (
          sortedProjects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => onSelectProject(project.id)}
            >
              <span
                className="mr-2 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-3 text-[12px] leading-relaxed text-foreground/45">
            用「新会话」或「新任务」开始，并在流程中选择或创建项目。
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleShowArchived}>
          {showArchivedProjects ? '隐藏已归档' : '显示已归档'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddScanRoot}>
          添加扫描目录…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onBrowseFolder}>
          浏览文件夹…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: 在 `LeftSidebar.tsx` 导入 `ProjectSwitcher`**

在现有 `import { WorkspaceSwitcher } from './WorkspaceSwitcher'` 下面新增：

```diff
 import { WorkspaceSwitcher } from './WorkspaceSwitcher'
+import { ProjectSwitcher } from './ProjectSwitcher'
```

- [ ] **Step 3: 在 `WorkspaceSwitcher` 下方渲染 `ProjectSwitcher`**

找到（`mode === 'agent'` 分支内，`<WorkspaceSwitcher .../>` 和 `{creatingProject && (...)}` 之间）：

```tsx
      {mode === 'agent' && (
        <div className="px-3 pt-2 titlebar-no-drag">
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspaceId={currentWorkspaceId}
            onSelect={handleSwitchWorkspace}
            onCreate={handleStartCreateProject}
            onRequestDelete={handleRequestDeleteWorkspace}
            canDeleteWorkspace={canDeleteWorkspace}
          />
          {creatingProject && (
```

改为（在 `<WorkspaceSwitcher .../>` 后插入 `<ProjectSwitcher />`）：

```tsx
      {mode === 'agent' && (
        <div className="px-3 pt-2 titlebar-no-drag">
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspaceId={currentWorkspaceId}
            onSelect={handleSwitchWorkspace}
            onCreate={handleStartCreateProject}
            onRequestDelete={handleRequestDeleteWorkspace}
            canDeleteWorkspace={canDeleteWorkspace}
          />
          <ProjectSwitcher
            className="mt-1.5"
            projects={currentWorkspaceProjects}
            showArchivedProjects={showArchivedProjects}
            onToggleShowArchived={() => setShowArchivedProjects((value) => !value)}
            onSelectProject={handleOpenProjectDetail}
            onAddScanRoot={() => { void handleAddScanRoot() }}
            onBrowseFolder={() => {
              // 先打开新任务流选择器再浏览，避免无 picker 时留下陈旧 browse token
              setNewTaskProjectFlowOpen(true)
              window.setTimeout(() => {
                setBrowseRequest((value) => value + 1)
              }, 0)
            }}
          />
          {creatingProject && (
```

> `currentWorkspaceProjects` 已经按 `showArchivedProjects` 过滤（见 `LeftSidebar.tsx` 该 memo 的现有实现），直接传给 `ProjectSwitcher` 即可，不需要再过滤一次。`handleOpenProjectDetail`、`showArchivedProjects`、`setShowArchivedProjects`、`handleAddScanRoot`、`setNewTaskProjectFlowOpen`、`setBrowseRequest` 均为 `LeftSidebar.tsx` 已有变量/函数，直接引用，不需要新增。

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/ProjectSwitcher.tsx
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat(ui): add ProjectSwitcher entry beside WorkspaceSwitcher"
```

---

### Task 9: 最终类型检查 + 单测 + 完整手动验收

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 通过，无报错

- [ ] **Step 2: 全量单测**

Run: `cd /Users/admin/Workspace/ClaudeCode/LuxAgents && bun test`
Expected: pass 数不少于合并前基线（历史已知 3 个 electron 模块导入相关的失败与本次改动无关，允许存在；不允许出现新增失败）

- [ ] **Step 3: 按设计文档验证清单逐条过一遍**

Run: `bun run dev`

- [ ] Code 模式侧栏：Workspace 选择器下方出现「项目」入口，点开显示项目列表 + 归档/扫描目录/浏览文件夹操作
- [ ] 项目列表为空时，下拉显示空态提示文案，不报错、不空白
- [ ] 点某个项目 → 主区正确跳到该项目的 Project 主页，行为与旧版点击项目子分组标题一致
- [ ] 会话列表头只剩「会话｜看板」一个开关，不再拥挤；点击行为不变，能正常切到看板视图
- [ ] 会话列表始终按时间平铺展示；**项目色点现在应该出现**（相对旧版"最近会话"模式的预期改进，不是回归）
- [ ] 单个会话行右键"移动到项目"仍正常工作
- [ ] 「显示已归档」「添加扫描目录」「浏览文件夹」三个操作在 `ProjectSwitcher` 下拉里都能正常触发
- [ ] Chat 模式侧栏不受影响（`ProjectSwitcher`/新版会话列表头改动只在 `mode === 'agent'` 分支内生效）
- [ ] 折叠侧栏：无「项目」入口是预期行为（与「会话｜看板」在折叠态的既有取舍一致），不用特殊处理

- [ ] **Step 4: 若发现问题，回到对应任务修复并重新提交**

不要在这一步引入新功能或顺手改动范围外的代码，只修复本次改动引入的问题。
