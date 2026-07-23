# 侧栏「项目」入口简化设计

## 背景

[2026-07-23-session-header-tabbar-unification-design.md](2026-07-23-session-header-tabbar-unification-design.md) 的 Task 6 把「会话｜看板」开关塞进了侧栏「最近会话｜项目」那一行，导致这一行要挤 2 个 segmented 控件 + 1 个「···」项目管理菜单，用户反馈"逻辑太复杂"。

排查过程中发现：现在的「最近会话｜项目」双投影，是 PR #9（`8d145cf0`，2026-07-22，设计见 [2026-07-22-workspace-project-session-ia-design.md](2026-07-22-workspace-project-session-ia-design.md)）特意用来**取代**独立「项目中心」一级入口的方案——当时的问题是"同一个 Project 多次出现"（Workspace 树 + Project 子分组 + 独立项目中心卡片三处重复），用户需要先理解内部数据层级。

本次不推翻 PR #9 的核心原则（"同一批 Session 不产生重复投影"），但把「项目」从"会话列表的一种排列方式"重新定位为"跟 Workspace 平级的导航入口"——用户在讨论中明确认为项目值得单独站出来，只是不希望它像当年的「项目中心」那样做成突兀的全屏卡片墙。

## 目标

- 侧栏会话列表标题行**只保留一个控件**：「会话｜看板」二态开关（`CodeMainViewSwitchControl`，已存在，不改）。
- 「项目」获得独立入口，视觉权重与 Workspace 选择器同级，但形态是轻量下拉菜单，不是全屏卡片墙。
- 会话列表**永远按时间平铺**（即当前的"最近会话"行为），不再有"切到项目分组视图"这件事；会话行已支持的项目色点（`AgentSessionItem` 的 `projectColor`）继续提供项目归属的视觉线索。
- 项目管理操作（显示已归档、添加扫描目录、浏览文件夹）从会话列表头的「···」菜单，挪到新的「项目」入口下拉里——这几个操作本来就是项目范畴，放在项目入口下更符合直觉。
- 不产生「项目」的重复列表/卡片渲染：新入口是导航菜单，不是数据视图。

## 非目标

- 不改变 Project 主页（`ProjectInfoPage`）内部结构。
- 不改变「会话｜看板」开关本身的行为（`codeMainViewAtom`/`workViewAtom` 不变）。
- 不改变会话与 Project 的绑定规则、cwd 解析等 PR #9 已定义的数据层语义。
- 不实现"按项目筛选会话列表"这类新筛选能力——那是需求增量，不在本次范围。

## 设计

### 1. 新增 `ProjectSwitcher` 组件

镜像现有 `WorkspaceSwitcher.tsx` 的结构（同款 `DropdownMenu` + trigger 按钮样式），新建 `apps/electron/src/renderer/components/app-shell/ProjectSwitcher.tsx`：

- **Trigger 按钮**：`FolderKanban` 图标 + "项目" 文案 + 右侧 `ChevronDown`，与 `WorkspaceSwitcher` 同高（`h-9`）、同圆角、同 `sidebar-control-surface` 背景，直接放在 `WorkspaceSwitcher` 下方（`px-3 pt-2` 沿用现有间距节奏，`pt-1.5` 或类似小间距衔接两者）。
- **下拉内容**：
  - 项目列表（当前 Workspace 下的 `serverKanbanProjectsAtom`，按 `updatedAt` 排序，默认排除已归档）；每项左侧项目色点 + 名称，右侧可选 session 计数；点击调用现有 `handleOpenProjectDetail(projectId)`（已存在，逻辑不变：`setSelectedProjectId` + `setWorkView('project')` + `setCodeMainView('work')` + `setActiveView('conversations')`）。
  - 分隔线。
  - 「显示已归档项目」/「隐藏已归档」toggle（复用 `showArchivedProjectsAtom`）。
  - 「添加扫描目录…」（复用现有 `handleAddScanRoot`）。
  - 「浏览文件夹…」（复用现有 `setNewTaskProjectFlowOpen(true)` + `setBrowseRequest` 时序，原样迁移）。
  - 空态（无项目时）：一行提示文案，不放交互内容，避免下拉打开即弹一堆空状态卡片。
  - **不新增「+ 新建项目」入口**：查过现状，项目创建目前只走「新会话/新任务」流程里的 `ProjectContextPicker`（选择或创建）和「打开文件夹」自动创建两条路径（`LeftSidebar.tsx` 现有注释"新建项目只走顶栏两流"证实了这一点），没有独立的"空手新建项目"入口。本次只做入口搬迁，不新增第三条创建路径，维持 PR #9"打开文件夹是本地工程一等入口"的既有原则。

### 2. 会话列表头简化 + 列表恒定按时间平铺

`LeftSidebar.tsx` 约 3013-3056 行的「会话投影切换」整块替换为单一开关：

```diff
-          {/* 会话投影切换：最近会话｜项目（仅切换；新建项目只走顶栏两流） */}
-          <div className="px-2 pt-2 pb-1 flex items-center gap-1.5 flex-shrink-0 titlebar-no-drag">
-            <div className="flex-1 min-w-0">
-              <SidebarSessionViewToggle />
-            </div>
-            <CodeMainViewSwitchControl compact />
-            {sidebarSessionViewMode === 'projects' ? (
-              <DropdownMenu>...项目管理菜单...</DropdownMenu>
-            ) : null}
-          </div>
-
-          {mode === 'agent' && sidebarSessionViewMode === 'projects' && kanbanProjects.filter(...).length === 0 ? (
-            <div>...项目为空提示...</div>
-          ) : null}
+          {/* 会话｜看板：切换主区视图；列表头不再需要投影切换，项目入口已上移到 ProjectSwitcher */}
+          <div className="px-2 pt-2 pb-1 flex items-center justify-end flex-shrink-0 titlebar-no-drag">
+            <CodeMainViewSwitchControl compact />
+          </div>
```

**重要修正（核实实现后发现，比最初设想的改动更深）**：`AgentProjectGroupItem`（`LeftSidebar.tsx:3660` 起，文件内部组件）本身就无条件按 `buildSidebarProjectGroups(group.sessions, projects, selectedProjectId)` 把已绑定项目的会话拆到各自的 `SidebarProjectSubgroup` 子分组里渲染，只有未绑定会话走平铺 `treeItems`。今天的"最近会话"模式**不是靠平铺渲染实现的**，而是调用方（约 3083/3122 行）在 `sidebarSessionViewMode === 'recent'` 时给 `AgentProjectGroupItem` 传 `projects={EMPTY_PROJECTS}`（空数组），把分组"挤没"——副作用是 `projectColorMap`（会话行左侧项目色点）也是从这同一个 `projects` prop 算出来的（`buildProjectColorMap(projects)`），所以**今天"最近会话"模式下，会话行本来就不显示项目色点**，跟"设计文档写的两个视图共享同一份色彩线索"并不一致。

因此本次要做的不是删掉一个三元判断，而是：

- `AgentProjectGroupItem` 内部删除 `buildSidebarProjectGroups` 分组渲染分支（`projectGroups.map(...) => <SidebarProjectSubgroup />` 那一段）和 `unboundSectionLabel` 标题渲染，恒定用 `buildAgentSessionTrees(buildRecentSessionList(group.sessions))` 生成 `treeItems`（即今天"未绑定会话"那条平铺路径，套用到全部会话）。
- 调用方**始终传真实的 `currentWorkspaceProjects`**（不再有 `EMPTY_PROJECTS` 分支），保证 `projectColorMap` 正常算出——这样"恒定平铺"反而比今天的"最近会话"模式多了一个好处：项目色点终于会显示了，用户仍能一眼看出会话归属，不需要靠分组结构。
- `AgentProjectGroupItem` 的 `onNewSessionInProject`（子分组标题栏 hover 出的"+新建会话"）、`unboundSectionLabel` 两个 prop 一并从接口删除——它们只服务于子分组渲染。等价能力仍在：进 Project 主页新建会话，或走「新会话」流程里的项目选择器。
- `onDeleteProject`（子分组标题菜单里的"删除项目"）一并删除——核实过 `ProjectInfoPage.tsx:352-360` 已有"归档项目/取消归档"和"删除项目"，子分组这份是重复入口，删掉不损失功能。
- `onOpenProjectDetail` 保留，改由新的 `ProjectSwitcher` 调用（原来是子分组标题栏点击触发）。
- `onMoveToProject` 保留——这是单个会话行右键"移动到项目"用的，跟子分组渲染无关，`AgentSessionItem` 层面继续需要。

### 3. 删除的代码

- `apps/electron/src/renderer/atoms/sidebar-session-view.ts`（`sidebarSessionViewModeAtom` 整个文件）
- `apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx`
- `apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx`
- `apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts` 里的 `buildSidebarProjectGroups`（`buildProjectColorMap` 保留，色点计算仍要用）
- `apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts` 里的 `buildProjectSessionView`/`sameSessionIdSet`（核实过，除了自己的测试文件外全仓无其他消费方；`buildRecentSessionList` 保留，仍要用）及对应测试用例
- `LeftSidebar.tsx` 中对上述内容的全部引用：import、`useAtom(sidebarSessionViewModeAtom)`、`forceRecent` 判断、`AgentProjectGroupItem` 内的子分组渲染分支与 `onNewSessionInProject`/`unboundSectionLabel`/`onDeleteProject` 相关 prop 与实现

### 4. 已知取舍（明确记录，不是遗漏）

- **子分组标题栏的"+ 在此项目新建会话"快捷按钮消失**：等价路径仍在（Project 主页新建会话 / 新会话流程选项目），但从侧栏少了一步直达。用户已认可"项目搬到独立入口"的方向，这是随之而来的合理代价。
- **今天"项目"模式下的展开/收起单个项目子分组能力消失**：项目改为通过 `ProjectSwitcher` 跳到 Project 主页查看其会话，而不是在侧栏就地展开。

### 5. 折叠侧栏

折叠态目前没有「项目」相关入口（`SidebarSessionViewToggle` 本来就只在展开态渲染），本次不新增折叠态项目入口——与「会话｜看板」在折叠态的现有取舍一致（折叠时看不到，展开侧栏后可见）。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/electron/src/renderer/components/app-shell/ProjectSwitcher.tsx` | 新增，镜像 WorkspaceSwitcher 结构 |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | 插入 `<ProjectSwitcher />`；简化会话投影切换区为单一「会话｜看板」开关；`AgentProjectGroupItem` 删除子分组渲染分支，恒定平铺 + 恒传真实 `projects`；相关 prop 精简 |
| `apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx` | 删除 |
| `apps/electron/src/renderer/atoms/sidebar-session-view.ts` | 删除 |
| `apps/electron/src/renderer/components/app-shell/SidebarProjectSubgroup.tsx` | 删除 |
| `apps/electron/src/renderer/components/app-shell/sidebar-project-groups.ts` | 删除 `buildSidebarProjectGroups`，保留 `buildProjectColorMap` |
| `apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts` | 删除 `buildProjectSessionView`/`sameSessionIdSet`，保留 `buildRecentSessionList` |
| `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts` | 同步删除已移除函数的测试用例 |

## 验证计划

- 类型检查：`bun run typecheck`
- 单测：`bun test`（现有 `sidebar-session-views.test.ts` 等相关测试文件清理后仍应全绿）
- 手动过一遍（`bun run dev`）：
  - Code 模式侧栏：Workspace 选择器下方出现「项目」入口，点开显示项目列表 + 归档/扫描目录/浏览文件夹操作
  - 点某个项目 → 主区正确跳到该项目的 Project 主页，行为与现状点击项目子分组标题一致
  - 会话列表头只剩「会话｜看板」一个开关，不再拥挤；点击行为不变
  - 会话列表始终按时间平铺展示，**项目色点现在应该出现**（这是相对今天"最近会话"模式的行为变化，属预期改进，不是回归）
  - 单个会话行右键"移动到项目"仍正常工作
  - 项目为空时，「项目」下拉显示空态提示而不是报错或空白
  - Chat 模式下不受影响（这些改动只在 `mode === 'agent'` 分支内）
