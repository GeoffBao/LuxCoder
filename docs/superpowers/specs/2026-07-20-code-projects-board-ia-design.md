# Code 壳 Projects + Board 信息架构设计

日期：2026-07-20（2026-07-21 修订：§4.4 左栏模块契约、§4.1 删除已不存在的 ProjectsListPanel、§8/§9 同步）  
状态：已评审（brainstorming）— **§4.4「项目 collapsible 展开」已被 `2026-07-21-projects-hub-agent-experts-design.md` 废止**（改为入口行 → 项目中心 Hub）  
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
顶栏：Chat | Code

Code 左栏壳：
  Sessions（主列表，可按 Project 分组）
  Projects（次级区块：列表 / 搜索 / +）

主区（互斥视图，由 codeMainViewAtom + workViewAtom 决定）：
  Session 对话 | Board(Kanban) | Project 详情
```

遗留 `appMode === 'cowork'`：启动时迁移为 `agent` + `codeMainView='work'`；顶栏不再暴露 Work。

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
| ~~`ProjectsListPanel`~~ | **已删除**（P0 完成）；侧边栏唯一实现为 `work/SidebarProjectsSection.tsx`，本表保留此行仅为记录 |
| `WorkBoardView` | 删除右栏 aside；主区全宽 |
| `ProjectInfoPage` | 补齐核心字段编辑 |
| `SidebarProjectSubgroup` | 保留；负责会话归属分组，不替代实体 CRUD |
| `serverKanbanProjectsAtom` / `selectedProjectIdAtom` / `workViewAtom` | 不变；Work/Code 共享 |

### 4.2 新增 / 调整

1. `SidebarProjectsSection` 挂入 `LeftSidebar`：顺序为 新会话 → 自动任务 → Agent 技能 → **项目** → 会话/工作区列表；`appMode === 'cowork' | 'agent'` 时显示。（已实现，2026-07-21 代码勘查确认）
2. `CreateProjectDialog`：对齐 `CreateProjectInput` 核心字段（不必抄 craft 仅 name 的极限简版，允许可选快捷字段）。
3. BDD / 单测覆盖过滤、新建进详情、无右栏、Chat 不显示。

### 4.4 左栏模块契约（2026-07-21 修订，P0+）

**动因**：「项目」需升级为与「Agent 技能」同级的左栏一等模块——"次级"指导航层级次于 Sessions，不是视觉规格降级。代码勘查结论：

- 左栏无共享模块抽象，三套 ad-hoc 实现并存：入口行（`AutomationSidebarEntry` / `SkillsSidebarEntry`，icon + title + badge，不可折叠）、`SidebarProjectsSection`（bespoke 折叠区）、`AgentProjectGroupItem`（会话树组头）。属绿地，无既有抽象需兼容。
- 视觉语言不一致：entry 行 `py-2 rounded-md text-[13px]`，项目区 header `py-1 text-[12px]`。
- 项目区折叠态为组件内 `useState`，不持久化；收起态 rail 完全跳过「项目」。

**契约设计** —— 新增 `app-shell/SidebarModule.tsx`：

```ts
interface SidebarModuleProps {
  icon: LucideIcon
  title: string
  count?: number                        // 徽标；>99 显示 "99+"
  badgeTone?: 'neutral' | 'accent'      // accent = 有更新（蓝点/蓝徽标）
  collapsible?: boolean                 // false = 纯入口行（整行点击导航）
  defaultCollapsed?: boolean
  headerActions?: ReactNode             // hover 浮现操作（如「+ 新建」）
  visibleIn: Array<'chat' | 'cowork' | 'agent'>
  railIcon?: boolean                    // 收起态 rail 是否显示 icon 入口
  children?: ReactNode                  // collapsible 时的展开体
}
```

**迁移映射**：

| 模块 | 形态 | 说明 |
|------|------|------|
| 自动任务 | `collapsible: false` 入口行 | 现有 `AutomationSidebarEntry` 逻辑迁入 |
| Agent 技能 | `collapsible: false` 入口行 | 现有 `SkillsSidebarEntry` 逻辑迁入，仅 `agent` |
| 项目 | `collapsible: true` 内容模块 | `SidebarProjectsSection` 用 `SidebarModule` 壳重写；atoms 与交互语义（单击过滤 Board、ⓘ 进详情、hover 新建）不变 |

**统一规则**：

1. 视觉规格对齐现有 entry 行（`py-2 rounded-md text-[13px]`）；项目展开体（搜索 / 归档 / 列表）作为 `children` 保持现有布局。
2. 折叠态持久化到 `settings.json`（遵守"配置文件优于 localStorage"约束），按 `mode + moduleId` 存储。
3. 收起态 rail：「项目」以 `FolderKanban` icon 呈现（对齐技能的 rail 形态），点击展开左栏并定位到项目区。
4. `LeftSidebar.tsx` 只保留模块装配，三套私有实现收敛为 `SidebarModule` 实例，降低与 Proma 上游的合并冲突面。

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

- 左栏模块契约收敛：新建 `SidebarModule`，迁移自动任务 / Agent 技能 / 项目三个模块（见 §4.4）。
- ~~顶栏 Work 收成 Code 内 Board 入口~~：**已完成**（ModeSwitcher 仅 Chat|Code；cowork 启动迁移到 `agent` + `codeMainView='work'`）。
- Sessions list / board 视图切换（更贴 craft）——Code 主区已由 `codeMainViewAtom` 承载。

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
| LeftSidebar 拥挤 | `SidebarModule` 折叠契约 + 折叠态持久化（见 §4.4） |
| Work/Code 双入口混乱 | 顶栏 Work 已下线；看板统一走 Code `codeMainViewAtom` |
| 详情字段过多 | P0 只做核心字段；列自定义 P2 |
| 合入 Proma 冲突 | UI 收敛到 `SidebarModule` + `SidebarProjectsSection`，LeftSidebar 主干只留装配（见 §4.4） |
| 遗留 cowork 持久化 | AppShell 启动迁移；MainArea 保留一帧兜底分支 |

## 9. 预估触点文件

- `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（三套私有实现收敛为 `SidebarModule` 实例）
- 新建：`apps/electron/src/renderer/components/app-shell/SidebarModule.tsx`（模块契约壳）
- `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx`（用契约壳重写，交互语义不变）
- `apps/electron/src/main/lib/settings-service.ts`（折叠态持久化）
- `apps/electron/src/renderer/components/work/WorkBoardView.tsx`
- `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx`
- 新建：`CreateProjectDialog.tsx`（或同目录等价）
- 测试：`project-view-model` 及相关 BDD

## 10. 开放决策（已锁定）

- IA：定案 A — Projects 次级左栏 + Kanban 主区视图；不双左栏并列。
- 模式显示：Chat | Code；Projects 仅 Code（及遗留 cowork 迁移后）显示；Chat 不显示。
- 单击：留 Board 过滤；新建进详情。
- 创建厚度：详情为主；创建可带可选快捷字段。
- 顶栏 Work：已下线（P1）。
