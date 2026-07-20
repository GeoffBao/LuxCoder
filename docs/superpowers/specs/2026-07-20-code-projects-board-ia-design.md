# Code 壳 Projects + Board 信息架构设计

日期：2026-07-20  
状态：已评审（brainstorming）  
范围：P0 实现边界 + P1/P2 展望

## 1. 问题

1. Work 模式主区右侧固定 `ProjectsListPanel`（`w-72`）遮挡 Kanban 视野。
2. Project 创建/详情过薄（创建仅 name/description），与 craft 项目一等公民模型不一致。
3. Work 与 Code 双入口导致 Projects 心智分裂；需要向 Codex / Claude / craft 的主流 IA 收敛。

## 2. 行业与参考结论

| 产品 | 左栏主轴 | Project | Board/任务板 |
|------|----------|---------|--------------|
| Codex App | Project → Threads | 顶层容器 | 无一等 Kanban；任务外挂 Linear / Automations |
| Claude Desktop | Code = Sessions（可按 project 分组） | 分组维度；另有顶栏 Cowork | 会话内 tasks pane，非并列左栏模块 |
| 阿里 Qoder | Quest/任务侧栏 | Workspace 多项目 | 「My Quests」状态总览 |
| 腾讯 CodeBuddy | 任务列表 | 配置+上下文容器 → 任务 | Plan / 共享任务列表 |
| craft-agents-max | Navigator 中栏 Projects 列表 | 点选进详情 | Kanban = Sessions board 视图；Navigator 在 board 时折叠 |

**共识**：左栏主公民是 Session/Thread/Task；Project 是容器或分组；Board 是视图，不是与 Projects 平级的第三左栏入口。

**否决**：Code 左栏并排 `Projects | Kanban` 两个功能模块。

## 3. 目标信息架构

```
顶栏：Chat | Work（过渡入口） | Code

Code / Work 共用左栏壳：
  Sessions（主列表，可按 Project 分组）
  Projects（次级区块：列表 / 搜索 / +）

主区（互斥视图）：
  Session 对话 | Board(Kanban) | Project 详情
```

### 3.1 交互语义（混合 C）

- **单击**已有 Project → 设置 `selectedProjectIdAtom`，过滤 Board（及会话分组高亮）；主区优先留在 Board（若当前在 Board）。
- **新建** → `CreateProjectDialog` → 成功后 `workViewAtom = 'project'`，在详情补齐厚度。
- **详情入口**：顶栏「项目详情」、列表项次级操作（ⓘ / 右键）。
- **删除** Work 主区右栏 `ProjectsListPanel`。
- **Chat 模式**：不渲染 Projects 次级区。

### 3.2 craft 字段对齐说明

craft 的 `CreateProjectDialog` 实际只收集 **name**；cwd / color / details 等在 `ProjectInfoPage`。

本设计：

- 创建：name 必填；description / workingDirectory / color 为可选快捷字段。
- 厚度在详情：可编辑 `description`、`workingDirectory`、`details`、`color` / `colorTheme`、归档。
- `kanbanColumns` 自定义列 → P2。

后端类型已具备（`CreateProjectInput` / `ProjectConfig`），缺的是 UI。

## 4. 组件边界

### 4.1 复用

| 组件 / Atom | 动作 |
|-------------|------|
| `ProjectsListPanel` | 抽 `variant="sidebar"`（或新建 `SidebarProjectsSection` 包装）；去右栏 card 壳；`max-h` + 内滚 |
| `WorkBoardView` | 删除右栏 aside；主区全宽 |
| `ProjectInfoPage` | 补齐核心字段编辑 |
| `SidebarProjectSubgroup` | 保留；负责会话归属分组，不替代实体 CRUD |
| `serverKanbanProjectsAtom` / `selectedProjectIdAtom` / `workViewAtom` | 不变；Work/Code 共享 |

### 4.2 新增 / 调整

1. `SidebarProjectsSection`（或等价 variant）挂入 `LeftSidebar`：在「自动任务」与会话列表之间；`appMode === 'cowork' | 'agent'` 时显示。
2. `CreateProjectDialog`：对齐 `CreateProjectInput` 核心字段（不必抄 craft 仅 name 的极限简版，允许可选快捷字段）。
3. BDD / 单测覆盖过滤、新建进详情、无右栏、Chat 不显示。

### 4.3 本轮不做

- 砍掉顶栏 Work
- 左栏 Kanban 入口
- craft 三栏 Navigator 全仿
- 第二套 Projects 数据源

## 5. 数据流

```
单击 Project
  → selectedProjectIdAtom
  → Board kanbanItems 过滤
  → Sessions subgroup 同源 id

+ 新建
  → CreateProjectDialog
  → electronAPI.projects.create(workspaceRoot, input)
  → upsert serverKanbanProjectsAtom
  → selectedProjectId + workViewAtom='project'

ⓘ / 顶栏项目详情 → workViewAtom='project'
顶栏看板 → workViewAtom='board'
```

### 5.1 边界

| 情况 | 行为 |
|------|------|
| 无 workspace | Projects 区隐藏或空态（与现 Work 一致） |
| 选中项归档/删除 | 清空 `selectedProjectId`，Board 回全部 |
| Work 与 Code | 同一 atom，选中态共享 |
| 左栏高度 | `max-h`（约 180–240px）+ 可折叠 |
| create/update 失败 | toast，不切详情 |
| cwd 无效 | 详情保存时校验 |

## 6. 分期

### P0（本轮）

1. 去掉 Work 右栏，看板全宽。
2. LeftSidebar 次级 Projects（Work + Code）。
3. 单击过滤；新建 → 详情；详情可编辑核心字段。
4. Chat 无 Projects 区块。

### P1

- 顶栏 Work 收成 Code 内 Board 入口。
- Sessions list / board 视图切换（更贴 craft）。

### P2

- 项目级 `kanbanColumns`。
- 更完整资产库体验。

## 7. 成功标准（P0）

1. Work 主区无右栏，看板可用宽度明显增加。
2. Work/Code 左栏可选项目并过滤看板。
3. 新建后进入详情，且能改 cwd / 颜色等核心字段。
4. Chat 左栏无 Projects。

## 8. 风险

| 风险 | 缓解 |
|------|------|
| LeftSidebar 拥挤 | max-h + 可折叠 |
| Work/Code 双入口混乱 | 同一组件 + 同一 atom；Work 仅作 Board 快捷入口 |
| 详情字段过多 | P0 只做核心字段；列自定义 P2 |
| 合入 Proma 冲突 | UI 隔离在 `SidebarProjectsSection`，少改 LeftSidebar 主干 |

## 9. 预估触点文件

- `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx`
- `apps/electron/src/renderer/components/work/WorkBoardView.tsx`
- `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx`
- 新建：`CreateProjectDialog.tsx`（或同目录等价）
- 测试：`project-view-model` 及相关 BDD

## 10. 开放决策（已锁定）

- IA：定案 A — Projects 次级左栏 + Kanban 主区视图；不双左栏并列。
- 模式显示：Work + Code；Chat 不显示。
- 单击：留 Board 过滤；新建进详情。
- 创建厚度：详情为主；创建可带可选快捷字段。
