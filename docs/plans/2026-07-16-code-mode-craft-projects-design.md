# Code 模式引入 craft Project 设计

日期：2026-07-16
状态：已确认（brainstorming 产出）

## 背景与问题

LuxAgents 当前存在两套互不相干的「项目」概念撞名：

1. **Code 侧边栏的「项目」= AgentWorkspace（工作区）**。`LeftSidebar.tsx` 中所有"项目"文案实际指 workspace（如 "默认项目不能删除"）。这是 LuxAgents 自己的叫法，craft-agents-max 中不存在。
2. **Work 看板的「Projects」= 从 craft-agents-max 迁移的 craft Project**。存储在 `{workspaceRoot}/projects/{slug}/config.json`，是工作区内部的会话分组，带 kanbanColumns、workingDirectory、color、assets、MEMORY.md。

**数据层迁移已完整**：`ProjectConfig`、`packages/shared/src/projects/storage.ts`、`project-repository.ts`、`session.projectId`、prompt 上下文注入（`agent-orchestrator.ts`）、看板 projectId 过滤、`set_project_id` 会话命令、`projects:changed` 广播 + preload `onProjectsChanged` 全部就绪。

**缺失的是 craft 的 UX 融合层**：craft 中 Project 显示在左侧边栏（`ProjectsListPanel` 挂 app-shell），会话绑定项目、显示项目色条（`SessionProjectColorWrapper`）、新建会话继承 workingDirectory。LuxAgents 把项目 UI 藏在 Work 模式右栏，Code 模式建的会话永远没有 projectId，项目体系空转。

## 目标

- Code 侧边栏在每个工作区组内嵌入 craft Project 子分组
- 会话可在项目内新建（自动绑 projectId + 继承 workingDirectory + prompt 注入）
- 已有会话可右键迁移进/出项目
- 会话行显示项目色条；Code 内有项目详情入口
- Code 侧边栏「项目」措辞改回「工作区」，消除撞名

不在本轮范围：Code 侧边栏直接新建 craft Project（项目创建仍在 Work 面板）。

## 方案选型

- **方案 A（选定）**：全局项目 Atom + 侧边栏派生分组。复用 craft 的 `projectsAtom` + broadcast 模式，无新 IPC，Work/Code 共享状态天然同步。
- 方案 B（否决）：侧边栏独立拉取——与 Work 面板状态割裂，重复 fetch，与 craft 模式相悖。
- 方案 C（否决）：主进程预分组——改 IPC 契约，UI 分组语义泄漏进主进程，过度设计。

**对后续 Proma 功能移植的影响评估**：本设计纯渲染端 UI 层，主进程、IPC 契约、`@proma/shared` 类型、存储格式零改动；新增逻辑全部落在新文件或 LuxAgents 独有文件（`project-atoms.ts`、`WorkBoardView.tsx`）中，唯一共享热点 `LeftSidebar.tsx` 仅保留挂载点级 diff。

## 设计

### 1. 数据流

新增 `ProjectsInitializer`（挂 `renderer/main.tsx`，对齐 `AgentSettingsInitializer` 模式）：

- 监听 `currentAgentWorkspaceIdAtom` 变化 → `getWorkspaceRootPath(slug)` → `window.electronAPI.projects.list(workspaceRoot)` → 写入现有 `serverKanbanProjectsAtom`（`renderer/atoms/project-atoms.ts`）
- 订阅 `onProjectsChanged`，按 workspaceId 匹配当前工作区后刷新同一 atom
- `WorkBoardView` 移除自己的初始项目拉取（改由 initializer 供给），保留手动 refresh 回调
- 加载失败：console 告警 + 空列表，侧边栏退化为现状（无项目子分组），不阻塞会话列表

### 2. 侧边栏结构

- 新文件 `renderer/components/app-shell/sidebar-project-groups.ts`：纯函数 view-model
  - 输入：某工作区的会话列表 + 该工作区项目列表
  - 输出：`{ project, sessions }[]`（含空项目）+ 未绑定会话列表
  - 分组逻辑不进已 1300+ 行的 `LeftSidebar.tsx`，配单测
- 新文件 `renderer/components/app-shell/SidebarProjectSubgroup.tsx`：项目子分组渲染组件（分组头、色点、会话数、「+」、详情入口、子分组内会话列表）
  - **隔离目的**：`LeftSidebar.tsx` 是未来从 Proma 移植功能时的冲突热点，本次只在其中留挂载点级别的 diff（import + 分组循环一个分支 + 右键菜单一项），项目相关渲染全部收进新组件
- 工作区组内渲染顺序：项目子分组（色点 + 名称 + 会话数，按 `project.updatedAt` 降序）→ 未绑定会话维持现有日期分组（今天/昨天/更早）不动
- 项目子分组内会话按 updatedAt 降序，不再嵌日期分组（避免三层嵌套）
- 措辞修正：工作区组相关文案「项目」→「工作区」（新建、删除确认、排序失败等提示）

### 3. 绑定交互

- **项目内新建**：子分组头 hover「+」→ `createAgentSession(undefined, channelId, workspaceId)` → `sendSessionCommand(id, { kind: 'set_project_id', projectId })`。与 `TeambitionPicker.tsx` 现有写法一致；主进程 `task-handlers.ts` 已自动解析项目 workingDirectory，`agent-orchestrator.ts` 已注入项目 prompt 上下文
- **迁移**：会话右键菜单新增「移动到项目…」子菜单，列当前工作区项目 + 「移出项目」；同走 `set_project_id`（`projectId: undefined` 解绑），用命令返回的最新 meta 更新 `agentSessionsAtom`

### 4. 色条与详情入口

- 会话行左缘 2px 项目色条（`project.color`），对齐 craft `SessionProjectColorWrapper`
- 色条数据以当前工作区项目 atom 为准：置顶区中属于当前工作区的会话显示色条；跨工作区置顶会话因项目数据未加载而退化为无色条（可接受，不为此扩大加载范围）
- 子分组头「详情」入口：切到 Work 模式 + `setSelectedProjectId(projectId)` + 项目详情视图
  - 需把 `WorkBoardView` 的本地 `view` state（`'board' | 'project'`）提升为 atom（`workViewAtom`，放 `project-atoms.ts`）
  - 复用现有 `ProjectInfoPage`，不在 Code 内再嵌一份

### 5. 测试与验收

- 单测：`sidebar-project-groups.test.ts`（绑定/未绑定/空项目/排序/空项目列表退化）
- 主进程 `set_project_id` 路径已有测试（`task-handlers.test.ts`），不重复
- 验收：`bun test` 全绿 + `bun run typecheck` 通过
- 受影响包 patch 版本 +1（预计仅 `@proma/electron`；如动 shared 类型则一并递增）

## 涉及文件

| 文件 | 变更 |
|------|------|
| `renderer/main.tsx` | 挂载 `ProjectsInitializer` |
| `renderer/components/ProjectsInitializer.tsx`（新） | 全局项目加载 + `projects:changed` 订阅 |
| `renderer/atoms/project-atoms.ts` | 新增 `workViewAtom`；`serverKanbanProjectsAtom` 复用 |
| `renderer/components/app-shell/sidebar-project-groups.ts`（新） | 分组纯函数 view-model |
| `renderer/components/app-shell/SidebarProjectSubgroup.tsx`（新） | 项目子分组渲染组件（含「+」与详情入口） |
| `renderer/components/app-shell/LeftSidebar.tsx` | 仅挂载点级 diff：子分组挂载、右键「移动到项目…」、色条、措辞修正 |
| `renderer/components/work/WorkBoardView.tsx` | 移除初始项目拉取；`view` 提升为 `workViewAtom` |
