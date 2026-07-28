# Workspace Task / Context / Labels Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Use TDD for every behavior change and preserve all v1 Task/Session/Run data.

**Goal:** 将 LuxCoder 的 Workspace、Project、Task、Session、Context、Knowledge、Skills、Experts 与 Labels 收敛为一致的信息架构，并建立独立 Task 看板、Workspace Task、Project Knowledge、Workspace Context 以及可组合的 Status/Labels 筛选。

**Architecture:** Task 升级为独立聚合根，Session 只承担对话和执行载体；旧 `task.yaml` 与历史 Runs 继续双读，不静默搬迁。Workspace Labels 是独立分类维度，与 Project、Task Workflow、Run/Session Status 分开；会话侧栏和 Task 看板复用 Label 定义，但各自保存筛选状态。

**Tech Stack:** Electron、React、TypeScript、Jotai、Zod、JSON/JSONL/YAML、本地文件原子写、Bun test。

---

## 已确认产品不变量

1. Task 必须属于 Workspace，可以不属于 Project：
   - `scope = workspace`；或
   - `scope = project(projectId)`。
2. Run 的 cwd 唯一解析顺序：Task 显式 cwd → Project effective cwd → Workspace default cwd → `blocked:missing-cwd`。不得静默落入 Session 隔离目录。
3. Task、Task Workflow、Run Status、Session Runtime、Project、Labels 是不同概念，禁止互相推导。
4. 新侧栏 `Task 看板` 是唯一正式 Task 入口；旧 Session 看板保留兼容视图，不自动把普通聊天转成 Task。
5. Agent 技能页的“记忆”迁移为 `Workspace Context`；Project 长期知识进入 `Project Knowledge`。
6. Default Workspace 是 Skill canonical source；其他 Workspace 使用可更新但不自动覆盖的本地快照。
7. Expert 身份核继续全局存储，Skill/MCP binding 改为 Workspace scoped。
8. Labels v1 接入会话侧栏现有“筛选与排序”和 Task 看板：
   - Status 与 Labels 跨 facet 使用 AND；
   - 同一 facet 多选使用 OR；
   - v1 不做按 Label 排序或分组，避免多标签对象重复和顺序歧义。
9. 所有迁移必须可重复、可诊断，不在只读浏览时静默改写旧数据。
10. Generate 继续保持无副作用；Create 才物化；Run 才执行。

## Labels 与会话筛选的最终交互

会话侧栏菜单从：

```text
状态 / 分组方式 / 排序方式
```

演进为：

```text
归档状态：活跃 / 已归档 / 全部
标签：多选 Workspace Labels / 无标签 / 清除
分组方式：日期 / 项目 / 运行状态 / 自定义分组 / 不分组
排序方式：最近更新 / 名称 / 创建时间
管理标签…
```

筛选公式：

```text
archiveMatch
&& labelMatch
&& workspaceMatch
&& existingVisibilityRules
```

- 选中多个 Label 时，命中任意一个即可。
- “无标签”可与具体 Label 并选。
- Label 过滤必须在完整 Session tree 构建后执行；根或任一 child 命中时保留整棵任务族，不能把 child 提升成孤立根节点。
- Pinned Session 也必须遵守 Label 筛选，不能绕过活动 facet。
- 当前“状态”实际表示归档状态，应改名“归档状态”；运行状态仍由现有 `groupBy: state` 表达，首版不额外增加第二套运行状态过滤。

Task 看板使用独立筛选状态：

```text
Project facet AND Task Workflow facet AND Labels facet
```

不会与侧栏共享当前选择，只复用 Workspace Label definitions 和通用 Label picker。

---

# Release Slice A：规格、特征测试与兼容护栏

## Task 1：写入正式设计规格并标记旧规格被取代部分

**Files:**
- Create: `docs/superpowers/specs/2026-07-28-workspace-task-context-labels-architecture-design.md`
- Modify: `docs/superpowers/specs/2026-07-22-workspace-project-session-ia-design.md`
- Create: `docs/superpowers/plans/2026-07-28-workspace-task-context-labels-architecture.md`

**Steps:**
1. 将本计划中的领域不变量、导航、物理存储、删除语义、兼容策略和验收场景写成正式规格。
2. 在 2026-07-22 规格顶部增加 superseded notice，明确仅 `Task 必须属于 Project`、Project 主页 tabs、旧看板入口等冲突部分被新规格取代；其余仍有效。
3. 运行文档链接检查或 `rg "2026-07-22-workspace-project-session" docs`，确认引用未失联。
4. Commit：`docs: define workspace task and labels architecture`。

## Task 2：锁定旧 Task/Run/Session 行为

**Files:**
- Modify: `packages/shared/src/tasks/__tests__/schema.test.ts`
- Modify: `packages/shared/src/tasks/__tests__/storage.test.ts`
- Modify: `apps/electron/src/main/lib/task-repository.test.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.test.ts`
- Modify: `apps/electron/src/main/lib/task-runner.test.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts`

**Steps:**
1. 为无版本、无 Project、无 taskId、无 Labels 的旧 `task.yaml` 写通过测试。
2. 为历史 Run snapshot 优先于 live task.yaml、orchestrator Session 删除后仍可读取 Run 写测试。
3. 为 `materializeTaskFromSpec()` 在 Session 创建失败后留下孤儿 task 的当前缺陷写失败测试。
4. 为重复 runId 会覆盖/串写的当前缺陷写失败测试。
5. 锁定旧 `cowork/work` 导航、TaskEditor 入口、overlay 优先级。
6. 仅提交测试和必要 fixture，不在此任务改变行为。
7. Commit：`test: lock legacy task session and run compatibility`。

---

# Release Slice B：Task 聚合根、Workspace Task 与 Run 安全

## Task 3：建立最小 TaskRecord 与兼容聚合读取

**Files:**
- Create: `packages/shared/src/tasks/task-record.ts`
- Modify: `packages/shared/src/tasks/storage.ts`
- Modify: `packages/shared/src/tasks/index.ts`
- Modify: `apps/electron/src/main/lib/task-repository.ts`
- Test: `packages/shared/src/tasks/__tests__/task-record.test.ts`
- Test: `apps/electron/src/main/lib/task-repository.test.ts`

**Data contract:**

```ts
interface TaskRecordV1 {
  schemaVersion: 1
  taskId: string
  slug: string
  revision: number
  workflow: 'todo' | 'in-progress' | 'needs-review' | 'done' | 'cancelled'
  labelIds: string[]
  orchestratorSessionId?: string
  archivedAt?: number
  createdAt: number
  updatedAt: number
}
```

`task.json` 首版只拥有身份、Workflow、Labels、归档和 orchestrator link；不复制 `task.yaml` 的 title/project/cwd/plan 字段，防止双写真源。

**Steps:**
1. 写失败测试：旧 task 目录无 `task.json` 时可合成 `TaskAggregate`，但不会在只读时写盘。
2. 写失败测试：新 `task.json` 通过 Zod 验证，未知高版本只能只读诊断，不能覆盖。
3. 实现 `loadTaskRecord/saveTaskRecord/listTaskAggregates`，文件使用 temp + fsync/rename 原子替换。
4. `TaskAggregate` 同时返回 `taskId/slug/spec/record/diagnostics/runs`。
5. 保留所有现有 slug API；新增按 taskId 查询，不改变旧 API 参数语义。
6. Commit：`feat(tasks): add stable task records and compatibility projection`。

## Task 4：幂等回填旧 Task 身份

**Files:**
- Create: `apps/electron/src/main/lib/task-migration-service.ts`
- Create: `apps/electron/src/main/lib/task-migration-service.test.ts`
- Modify: `apps/electron/src/main/lib/task-repository.ts`

**Steps:**
1. 写失败测试：旧 task 缺 `task.json` 时生成 UUID，不移动 `task.yaml/runs`。
2. 从唯一 orchestrator Session 的 `taskSlug` 关联回填 `orchestratorSessionId`；多候选时保留空值并写 diagnostic，不猜测。
3. workflow 从旧 orchestrator `kanbanColumn` 映射；未知列回退 `todo`。
4. 迁移逐 task 原子写，可重复执行；已存在 record 不改 taskId。
5. 迁移结果返回 migrated/skipped/conflicted 列表，供 UI 或日志展示。
6. Commit：`feat(tasks): backfill stable identities without moving data`。

## Task 5：统一 Workspace Task scope 与 cwd resolver

**Files:**
- Modify: `packages/shared/src/tasks/schema.ts`
- Modify: `packages/shared/src/tasks/build-minimal-spec.ts`
- Create: `apps/electron/src/main/lib/task-working-directory.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `apps/electron/src/main/lib/task-runner.ts`
- Modify: `apps/electron/src/main/lib/project-repository.ts`
- Test: `apps/electron/src/main/lib/task-working-directory.test.ts`
- Test: `apps/electron/src/main/lib/task-handlers.test.ts`
- Test: `apps/electron/src/main/lib/task-runner.test.ts`

**Steps:**
1. 保留 `TaskSpec.project?: string` 的 v1 读取；新增 normalize helper 将其解释为 Workspace/Project scope。
2. 实现唯一 resolver：explicit cwd → valid Project cwd → valid Workspace default cwd → blocked。
3. 验证 exists/isDirectory/permission policy；配置过但失效的路径不得静默降级。
4. Task 可在 missing cwd 状态保存；create-and-run、rerun、resume 阻止并返回结构化错误及修复建议。
5. Run 开始时冻结 resolved cwd 与来源；child dispatch 和 rehydrate 只使用冻结值。
6. UI/Agent tool/导入/编辑/恢复都调用同一 resolver。
7. Commit：`feat(tasks): support workspace tasks with deterministic cwd resolution`。

## Task 6：强化 Run 身份、快照与恢复

**Files:**
- Modify: `packages/shared/src/tasks/storage.ts`
- Modify: `apps/electron/src/main/lib/task-runner.ts`
- Modify: `apps/electron/src/main/lib/task-repository.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Test: `packages/shared/src/tasks/__tests__/storage.test.ts`
- Test: `apps/electron/src/main/lib/task-runner.test.ts`
- Test: `apps/electron/src/main/lib/task-repository.test.ts`

**Steps:**
1. 默认 runId 改 UUID，并使用原子目录创建拒绝复用。
2. 同一 Task 首版只允许一个 active Run；历史终态 Run 不受影响。
3. Run 派发前必须成功写：spec、taskId/slug、resolved cwd、scope、Expert/Skill/MCP hashes、permission mode。
4. snapshot 失败则 Run 不得开始。
5. Run log 增加连续 sequence；只容忍最后一行截断，中段损坏标记 `recovery-required`。
6. 节点派发写持久化 intent 和 correlation key `taskId/runId/nodeId/attempt`；恢复先查已有 Session。
7. 最新 Run 按 run-started 时间/显式索引选择，不再依赖 runId 字典序。
8. Commit：`fix(tasks): make runs collision-safe and recoverable`。

## Task 7：事务化 Task materialization

**Files:**
- Create: `apps/electron/src/main/lib/task-materialization-service.ts`
- Create: `apps/electron/src/main/lib/task-materialization-service.test.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`

**Steps:**
1. 为 create/attach/adopt 三条路径写故障注入测试。
2. 使用 `tasks/.transactions/<id>.json` 与 staging directory 表达 `draft → materializing → ready/recovery-required`。
3. 先准备完整 task.yaml/task.json，再创建或更新 Session，最后原子提交目录。
4. 每一步可重复；补偿失败保留 journal 和诊断，不静默隐藏。
5. 列表展示 materializing/recovery-required 项，而不是消失。
6. 编辑使用 `expectedRevision`，冲突返回 reload/merge 提示。
7. 保持 Generate 无副作用，不写 transaction 或正式 Task。
8. Commit：`feat(tasks): materialize tasks with recoverable transactions`。

---

# Release Slice C：唯一 Task 看板与导航

## Task 8：将导航收敛为唯一 Tasks/Project 主区

**Files:**
- Modify: `apps/electron/src/renderer/atoms/active-view.ts`
- Modify: `apps/electron/src/renderer/atoms/project-atoms.ts`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/code-main-view-model.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/SidebarProjectsTab.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/NewTaskProjectFlowDialog.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/CodeMainViewSwitcher.tsx`

**Steps:**
1. 将 `codeMainView` 演进为 `session | tasks | project`；`activeView` 继续承载 automations/skills/experts 等覆盖页。
2. 在侧栏 Agent 专家下新增 `Task 看板`，重复点击 no-op，不做隐式 toggle。
3. MainArea 只挂载一个 Task Board 实例；旧 `work` 和 `cowork` 作为兼容 alias 重定向。
4. Project 菜单“看板”改为“查看任务”，导航到 tasks 并设置 project facet。
5. 打开 Session 回到 session；返回 Task Board 时恢复该 Workspace 的筛选和滚动位置。
6. 切换 Workspace 时保留 tasks 模块，但清除失效 Project filter 和未保存 Task 草稿。
7. 一轮兼容发布后再删除 `workViewAtom` 和死 `CodeMainViewSwitcher` 写入链。
8. Commit：`feat(navigation): add a single workspace task board entry`。

## Task 9：让正式 Task 看板从 TaskRepository 投影

**Files:**
- Rename later: `apps/electron/src/renderer/components/work/WorkBoardView.tsx` → `TaskBoardPage.tsx`
- Modify: `apps/electron/src/renderer/atoms/kanban-atoms.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/kanban-view-model.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx`
- Modify: `apps/electron/src/main/lib/task-repository.ts`
- Modify: `packages/shared/src/protocol/channels.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Test: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts`

**Steps:**
1. 新增 TaskRepository list IPC，返回 `TaskAggregateSummary`，而不是从全部顶层 Session 推断 Task。
2. 正式卡片以 `taskId` 为 React key 和业务 ID，slug 只用于路径/兼容。
3. Task workflow 来自 `task.json`；Run execution 作为独立 badge，不覆盖 workflow。
4. Run 开始只自动 `todo → in-progress`；成功/失败进入 `needs-review`；done/cancelled 仅用户修改。
5. 旧 Session 卡片保留在“会话看板（兼容）”，不自动转换；提供显式“转为 Task”。
6. 新建 Quick Task 直接物化最小正式 Task + orchestrator Session。
7. Rename/archive/delete 操作改为 Task-aware API；历史 Session 标题/归档不默认联动。
8. Commit：`feat(tasks): project task records into the task board`。

---

# Release Slice D：Workspace Labels 与组合筛选

## Task 10：建立 Workspace Label definitions 与安全存储

**Files:**
- Create: `packages/shared/src/labels/schema.ts`
- Create: `packages/shared/src/labels/index.ts`
- Create: `packages/shared/src/labels/__tests__/schema.test.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`
- Create: `apps/electron/src/main/lib/workspace-label-service.ts`
- Create: `apps/electron/src/main/lib/workspace-label-service.test.ts`

**Storage:**

```text
<workspaceRoot>/labels/config.json
```

```ts
interface WorkspaceLabel {
  id: string
  name: string
  color?: `#${string}`
  archivedAt?: number
  createdAt: number
  updatedAt: number
}
```

**Steps:**
1. 写 workspace 隔离、名称大小写不敏感唯一、颜色校验、stable ID、原子写测试。
2. v1 使用平面 Label；schemaVersion 预留层级演进，但不偷做 `primaryLabelId`。
3. 删除默认实现为 archive；不清历史 Run snapshot。显式“从所有当前对象移除”才批量清 refs。
4. Label rename/color change 不改引用。
5. Commit：`feat(labels): add workspace-scoped label definitions`。

## Task 11：打通 Session/Task Label refs 与 IPC

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`
- Modify: `apps/electron/src/main/lib/agent-session-manager.test.ts`
- Modify: `apps/electron/src/main/lib/task-repository.ts`
- Modify: `packages/shared/src/protocol/channels.ts`
- Modify: `packages/shared/src/protocol/__tests__/channels.test.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/electron/src/main/ipc.ts` or register a dedicated label handler module

**Steps:**
1. `AgentSessionMeta` 增加 `labelIds?: string[]`；历史缺失视为空集合。
2. label-only 更新不改变 `updatedAt`，不取消 archived；仿照 starred-only 行为写测试。
3. Task Label refs 写入 `task.json.labelIds`，不写入 Plan/task.yaml，避免 UI 分类污染执行计划。
4. 新增 list/create/update/archive/setSessionLabels/setTaskLabels API，写入前验证引用属于同一 Workspace。
5. Task-backed orchestrator 的有效 Labels 从 TaskRecord 投影；普通 Session 使用自身 labelIds，禁止形成双真源。
6. `TaskNode.labels` 暂保留 legacy execution metadata，不在 Labels v1 自动创建定义或映射；另开后续 adapter。
7. Commit：`feat(labels): persist task and session label references`。

## Task 12：将 Labels 接入会话“筛选与排序”按钮

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/types/settings.ts`
- Modify: `apps/electron/src/renderer/atoms/session-list-preference-atoms.ts`
- Create: `apps/electron/src/renderer/atoms/workspace-labels-atoms.ts`
- Create: `apps/electron/src/renderer/components/app-shell/session-facet-filter.ts`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/session-facet-filter.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/SessionListFilterMenu.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/sidebar-session-tree.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-tree.test.ts`

**Preference:**

```ts
interface SessionListPreference {
  status: 'active' | 'archived' | 'all'
  groupBy: SessionListGroupBy
  sortBy: SessionListSortBy
  labelIdsByWorkspace?: Record<string, string[]>
  includeUnlabeledByWorkspace?: Record<string, boolean>
}
```

**Steps:**
1. 旧 settings 水合时补默认字段，不覆盖 status/groupBy/sortBy。
2. 在菜单新增 Label checkbox submenu、无标签、清除和“管理标签…”。
3. 多 Label OR；Labels 与归档状态 AND。
4. 先构建 Session tree，再判断根或任一 child 是否命中；保留完整 family。
5. Pinned、日期、项目、状态、自定义分组、不分组全部调用同一纯筛选函数。
6. 删除/归档 Label 时清理当前 Workspace 的失效 preference ID，不影响其他 Workspace。
7. v1 不增加 `groupBy: label` 或 `sortBy: label`。
8. Commit：`feat(labels): filter session trees by workspace labels`。

## Task 13：将 Project/Workflow/Labels 接入 Task 看板筛选

**Files:**
- Create: `apps/electron/src/renderer/atoms/task-board-filter-atoms.ts`
- Create: `apps/electron/src/renderer/components/app-shell/kanban/TaskBoardFilters.tsx`
- Create: `apps/electron/src/renderer/components/labels/LabelFacetPicker.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/kanban-view-model.ts`
- Modify: `apps/electron/src/renderer/atoms/kanban-atoms.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts`

**Steps:**
1. 写 Project + Workflow + Label 三 facet AND、多值 facet 内 OR 的失败测试。
2. Workflow 使用 TaskRecord workflow；未知 legacy column 先归一化再过滤。
3. Board/List 消费同一过滤结果。
4. 显示清除筛选和 active filter count。
5. 选择状态按 Workspace 保存，但与侧栏会话 preference 分离。
6. Commit：`feat(labels): combine task workflow and label filters`。

## Task 14：增加 Label 管理与赋值入口

**Files:**
- Create: `apps/electron/src/renderer/components/labels/WorkspaceLabelManagerDialog.tsx`
- Create: `apps/electron/src/renderer/components/labels/LabelChips.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AgentSessionItem.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/SidebarProjectsTab.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanColumn.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoard.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx`

**Steps:**
1. Session 菜单增加多选 Labels；Task 卡片使用 Task-aware API。
2. 卡片/会话行最多显示两个 chip，剩余显示 `+N`。
3. archive Label 前显示当前引用数量；默认不破坏历史引用。
4. Workspace 切换时关闭旧 Workspace 的管理弹窗并清空草稿。
5. Commit：`feat(labels): manage and assign labels across tasks and sessions`。

---

# Release Slice E：Project Page、Knowledge 与 Workspace Context

## Task 15：建立正式 Project Page

**Files:**
- Create: `apps/electron/src/renderer/components/project/ProjectPage.tsx`
- Create: `ProjectOverviewTab.tsx`
- Create: `ProjectSessionsTab.tsx`
- Create: `ProjectKnowledgeTab.tsx`
- Create: `ProjectAssetsTab.tsx`
- Create: `ProjectSettingsTab.tsx`
- Modify: `apps/electron/src/renderer/components/work/ProjectSettingsDialog.tsx`
- Test: `apps/electron/src/renderer/components/project/__tests__/project-page-model.test.ts`
- Test: `apps/electron/src/renderer/components/project/__tests__/project-knowledge-model.test.ts`

**Steps:**
1. 复用现有 Project list/read/write memory/assets IPC，不创建第二份 Knowledge 真源。
2. Knowledge 成为 `MEMORY.md` 主编辑入口；Settings 只保留 metadata/cwd/default expert。
3. 修复现有空字符串无法清空 MEMORY.md 的 dirty-state bug。
4. Tasks 入口跳唯一 Task 看板并预设 Project facet，不复制另一套看板。
5. Project 被归档/删除时安全返回，不白屏。
6. Commit：`feat(projects): add project knowledge and assets page`。

## Task 16：将“记忆”迁移为 Workspace Context

**Files:**
- Modify: `apps/electron/src/renderer/atoms/active-view.ts`
- Modify: `apps/electron/src/renderer/components/agent-skills/AgentSkillsView.tsx`
- Move/refactor: `apps/electron/src/renderer/components/agent-skills/WorkspaceMemoryTab.tsx`
- Create: `apps/electron/src/renderer/components/workspace/WorkspaceContextPage.tsx`
- Create: `apps/electron/src/renderer/components/workspace/workspace-context-model.ts`
- Test: `apps/electron/src/renderer/components/workspace/__tests__/workspace-context-model.test.ts`
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts`

**Steps:**
1. AgentSkills 页面改为 Skills/MCP/Context，其中 UI 标题明确“Workspace Context”，或将 Context 作为 Workspace Page 主入口且保留能力页快捷入口；最终只挂一个编辑实例。
2. 展示 CLAUDE.md、Auto Memory、workspace-files/.context、附加目录/文件、能力摘要和 Project overlay 跳转。
3. 修改提炼 prompt：Project 架构、命令、决策写 Project Knowledge；Workspace 只收跨项目规则、偏好与经验。
4. 页面始终显示 scope badge；切 Workspace 重置文件树、dirty state 和异步请求结果。
5. 不物理移动现有 Memory/Context 文件。
6. Commit：`feat(context): separate workspace context from project knowledge`。

---

# Release Slice F：Workspace Skill 来源与 Expert Binding

## Task 17：给 Workspace Skill 快照增加来源与更新状态

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts`
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.test.ts`
- Modify: `apps/electron/src/renderer/components/agent-skills/*`

**Steps:**
1. 为非 Default Workspace 快照记录 origin workspace/slug、source hash/revision、syncedAt、localModified、detached。
2. Default 更新只显示“有更新”，不自动覆盖。
3. 本地修改提供 diff/覆盖/保留并 Detach；slug 冲突不得静默覆盖。
4. canonical 删除后本地快照继续可用，只标记源移除。
5. Commit：`feat(skills): track workspace skill snapshot provenance`。

## Task 18：将 Expert Skill/MCP binding 改为 Workspace scoped

**Files:**
- Create: `packages/shared/src/experts/workspace-binding.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`
- Create: `apps/electron/src/main/lib/expert-binding-service.ts`
- Create: `apps/electron/src/main/lib/expert-binding-service.test.ts`
- Modify: `apps/electron/src/main/lib/expert-service.ts`
- Modify: `apps/electron/src/main/lib/task-runner.ts`
- Modify: `apps/electron/src/renderer/components/agent-experts/ExpertDetailSheet.tsx`
- Modify: expert IPC/preload contracts

**Steps:**
1. Global expert 只保留 IDENTITY/SOUL/RULES；Workspace binding 保存 skillSlugs/mcpIds/overrides。
2. 迁移旧全局 binding：复制到升级时已有 Workspace；缺失引用保留 unresolved，不静默删除。
3. 新 Workspace 默认空 binding。
4. UI 明确“当前 Workspace 的能力绑定”；“从专家移除”不卸载 Workspace Skill。
5. Run snapshot 记录最终解析的 Expert/Skill/MCP hashes；缺失资源进入 blocked，不警告后降级执行。
6. Commit：`feat(experts): scope capability bindings to workspaces`。

---

# Release Slice G：删除治理、清理与发布验收

## Task 19：Project/Task 删除影响预览与安全语义

**Files:**
- Modify: `apps/electron/src/main/lib/project-repository.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `packages/shared/src/projects/storage.ts`
- Create: `apps/electron/src/main/lib/project-impact-service.ts`
- Create: `apps/electron/src/main/lib/project-impact-service.test.ts`
- Modify: Project/Task delete dialogs

**Steps:**
1. Project 默认归档；删除前扫描 Task/Session/Run/Knowledge/assets/workdir。
2. active Run 或受管 workdir 被引用时阻止 purge。
3. 提供 Task 转 Workspace scope、移动到其他 Project、取消；不得静默解绑。
4. 历史 Run snapshot 永不改写。
5. Task 支持 archive/soft-delete/purge；删除 Session 不删除 Task/Run，删除 Task 不默认删历史 Session。
6. 首版禁止只移动 task-backed Session 到另一 Workspace。
7. Commit：`feat(data): add impact previews and safe deletion semantics`。

## Task 20：全量回归与分阶段发布

**Commands:**

```bash
cd /Users/admin/Workspace/ClaudeCode/LuxAgents
bun test packages/shared/src/tasks
bun test apps/electron/src/main/lib/task-repository.test.ts
bun test apps/electron/src/main/lib/task-handlers.test.ts
bun test apps/electron/src/main/lib/task-runner.test.ts
bun test apps/electron/src/main/lib/agent-session-manager.test.ts
bun test apps/electron/src/main/lib/workspace-label-service.test.ts
bun test apps/electron/src/renderer/components/app-shell/__tests__
bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__
bun run typecheck
```

**Steps:**
1. 逐 slice 跑相关测试，不等到最终一次性排错。
2. 为旧 Task、无 Project Task、孤立 Run、多个同 slug Session、损坏 JSONL 建 fixture migration test。
3. 手工验证：侧栏筛选、Workspace 切换、Task Board、Project Knowledge、Labels assignment、Expert binding。
4. 全量 `bun test` 如出现已知 worktree 重复收纳或 mock 污染，按项目 MEMORY 要求单文件复核。
5. Release notes 只写用户功能，不出现参考竞品来源。
6. 每个 Release Slice 可独立发布和回滚；禁止把全部二十项压成一次不可审查提交。

---

## 最终验收门槛

- 旧 task.yaml、旧无 Project Task、旧 Session 看板和历史 Runs 均可读取且未被静默搬迁。
- Workspace Task 缺 cwd 时可保存但不能运行；错误有明确修复入口。
- 正式 Task 看板不再把普通顶层聊天称作 Task。
- Status、Labels、Project 三者可组合筛选，修改 Label 不改变 Status。
- 会话侧栏所有分组模式得到一致筛选结果，Pinned 不绕过筛选。
- Workspace Context 与 Project Knowledge 写入路由明确且无双写编辑入口。
- Default Workspace Skill 更新不覆盖其他 Workspace 的本地修改。
- 同一 Expert 在不同 Workspace 的 Skill/MCP binding 互不覆盖。
- 删除 Project/Task 前显示影响，active Run 和受管 cwd 不被破坏。
- `bun run typecheck` 通过，相关测试全绿。
