# Workspace / Project / Session 信息架构设计

**日期：** 2026-07-22

**状态：** 已完成交互确认，待书面规格复核

**范围：** Code 模式中的 Workspace、Project、Session、Task 归属与导航

**取代范围：** 本文在 Workspace / Project 侧栏层级和独立「项目中心」入口方面，取代 `2026-07-20-code-projects-board-ia-design.md` 与 `2026-07-21-projects-hub-agent-experts-design.md` 的对应设计；其中 Kanban、Agent 专家运行期等无冲突内容继续有效。

## 1. 决策摘要

LuxCoder 保留 Proma `AgentWorkspace` 的运行隔离能力，但不再把 Workspace 和 Craft Project 作为两个并列的日常导航层级。

- **Workspace** 是用户命名的顶层环境与隔离边界，默认名称为 `Default Space`。
- **Project** 是用户日常工作的主容器，属于一个 Workspace。
- **Session** 是一次具体 Agent 对话，必须属于 Workspace，可以暂不属于 Project。
- **Task** 是正式工作项，必须属于 Project；Teambition 任务也必须先确定 Project。
- 独立「项目中心」入口删除，Project 通过侧栏「项目」视图和单项目主页完成导航与管理。
- 侧栏不再显示无实际功能的「工作」分区标题。
- 「最近会话」和「项目」是同一批 Session 的两种投影，不产生重复数据。
- 「打开文件夹」成为本地工程开发的一等入口：自动识别或创建 Project，然后进入 Project Draft Session。
- Repo Wiki、Browser、Terminal、多 Repo 等能力不在本阶段实现，只保留未来的项目级扩展边界。

## 2. 背景与问题

Proma 最初的 `AgentWorkspace` 同时承担 Agent cwd、Session、Skills、MCP、文件和 Memory，是一个“项目 + 运行沙箱 + 能力配置”的混合容器。Proma 后续又将其 UI 文案改为 Project，但底层仍使用 Workspace。

LuxCoder 引入 Craft Project 后形成了新的嵌套：

```text
AgentWorkspace
└── Craft Project
    ├── Session
    ├── Task / Kanban
    ├── Assets / Memory
    └── workingDirectory
```

当前界面又同时提供 Workspace 树、Project 子分组和独立「项目中心」，导致同一个 Project 多次出现，Workspace 与 Project 也都像用户的工作容器。用户需要先理解产品内部的数据层级，才能判断“当前 Agent 在哪里运行、当前工作属于哪里”。

本设计拆分 Proma 混合容器的职责：Workspace 保留环境隔离价值，Project 承接用户可感知的长期工作，Session 承接具体执行。

## 3. 目标与非目标

### 3.1 目标

1. 用户始终能判断当前 Workspace、Project 和 Session。
2. 打开本地工程后可以直接开始 Agent 对话，无需先手动搭建 Workspace 和 Project。
3. 保持现有 Workspace、Project、Session、Task 数据兼容，不进行破坏性迁移。
4. Project 成为任务、会话、资料、Memory 和工作目录的统一入口。
5. Workspace 继续为 Skills、MCP、渠道、权限和专家提供隔离。
6. UI 只有一套 Project 导航，不再同时维护侧栏分组和项目中心卡片。
7. 保持本地优先、JSON/JSONL 存储和 Jotai 状态管理。

### 3.2 非目标

- Repo Wiki（Karpathy LLM Wiki 式本地知识库）
- Browser、Terminal 或右侧文件面板重构
- 多 Repo 或多主目录 Project
- Finder 双击、CLI `luxcoder .`、系统深链
- Project 级 Skills/MCP 副本
- Workspace 存储目录的大规模搬迁
- Workspace 删除语义的重新设计

## 4. 术语与对象边界

### 4.1 Workspace

Workspace 是用户可创建、命名和切换的顶层隔离单元。产品 UI 始终使用 **Workspace**，不显示「Agent 环境」这一内部解释性名称。

Workspace 负责：

- Skills
- MCP / Sources
- 渠道与默认模型
- 权限策略
- Agent 专家
- Workspace Memory 与配置
- Project 集合
- 未归类 Session

新安装自动创建 `Default Space`。Workspace 选择器始终显示，即使当前只有一个 Workspace，也作为当前上下文提示和管理入口存在。

Workspace 选择器使用正式图标组件：左侧为 Workspace 图标或颜色标识，右侧为 Lucide `ChevronDown`。禁止使用 `▾` 等 Unicode 字符模拟下拉图标。

### 4.2 Project

Project 必须属于一个 Workspace，是用户日常工作的主容器。

Project 负责：

- Project Session
- Task / Kanban / Teambition 映射
- Assets / 资料
- Project Memory
- 默认 Agent 专家引用
- LuxCoder 托管工作目录
- 可选外部主工作目录

Project 不复制 Workspace 的 Skills/MCP。Project 只引用 Workspace 中的默认专家；专家再引用允许使用的 Skills/MCP。

### 4.3 Session

Session 必须具有 `workspaceId`，`projectId` 可选。

- 从全局「新会话」创建：默认未归类。
- 从 Project 行内或 Project 主页创建：自动绑定该 Project。
- 从 TaskRunner 创建：必须绑定 Task 所属 Project。
- Session 一旦绑定 Project，就继承 Project 上下文和有效工作目录。

未归类不是单独 Project，也不使用伪造的 `projectId`。它只是 `projectId` 为空的 Session 投影。

### 4.4 Task

Task 是正式、可追踪的工作项，必须具有 `projectId`。新建 Task 和 Teambition 导入都必须在 Project 上下文中完成。用户取消 Project 选择时，不创建或导入 Task。

## 5. 目录与运行语义

### 5.1 托管工作目录

每个 Project 始终具有一个 LuxCoder 托管工作目录。该目录由 Workspace 与 Project slug 派生并按需创建，不要求用户选择外部文件夹。

物理位置固定为：

```text
~/.luxcoder/agent-workspaces/{workspace-slug}/projects/{project-slug}/workdir/
```

开发模式继续位于 `~/.luxcoder-dev/`。`workdir/` 与 `config.json`、`assets/`、`MEMORY.md` 分离，避免 Agent 把项目元数据目录当成普通源码目录编辑。

### 5.2 外部主工作目录

Project 可以通过现有 `workingDirectory` 绑定一个外部文件夹或 Repo。本阶段最多绑定一个外部主目录。

有效工作目录规则：

```text
未配置外部主目录
→ effectiveCwd = Project 托管 workdir

已配置且路径可访问
→ effectiveCwd = workingDirectory

已配置但路径不可访问
→ 不静默回退；阻止依赖 cwd 的 Agent 运行并提示重新定位
```

不静默回退可以避免用户以为 Agent 正在修改 Repo，实际却修改了内部目录。

### 5.3 路径唯一性

- 选择外部目录后，对路径执行绝对化、符号链接解析与平台适配的规范化。
- 同一 Workspace 内，一个规范化路径只能绑定一个 Project。
- 同一路径允许被不同 Workspace 使用，以支持不同 Skills/MCP/权限环境。
- 存储时保留可展示路径；比较时使用规范化路径。

## 6. 侧栏信息架构

### 6.1 总体结构

```text
LuxCoder

[Workspace 图标] Default Space [ChevronDown]
[＋ 新会话] [打开文件夹]

自动任务
Agent 技能
Agent 专家

[最近会话｜项目]                  [＋]

项目视图：
⌄ ● AI Dev                         7
    物理世界模型
    综合报告撰写
› ● LeedsA                         3

未归类会话
    临时问题排查
```

删除以下元素：

- 独立「项目中心」模块行
- 展开的 Workspace 树
- 「工作」分区标题
- 同一 Project 的重复卡片和侧栏入口

### 6.2 Workspace 选择器

- 始终显示当前 Workspace 名称。
- 点击打开 Workspace 列表，并保留现有新建、切换、重命名与管理能力。
- 切换 Workspace 时，Project、Session、专家和能力资源一起切换。
- 切换期间不得短暂显示上一 Workspace 的数据。

### 6.3 最近会话视图

- 按 `updatedAt` 展示当前 Workspace 的全部 Session。
- Project Session 显示 Project 色点或紧凑标签。
- 未归类 Session 正常参与时间排序。
- 搜索、置顶和归档继续作用于真实 Session，不创建视图副本。

### 6.4 项目视图

- 展示当前 Workspace 的 Project。
- Project 名称点击后打开 Project 主页。
- Project 行左侧 disclosure icon 只负责展开和收起 Session。
- Session 行点击后打开具体 Agent 对话。
- `projectId` 为空的 Session 在底部进入「未归类会话」分组。
- Project 右键或 `…` 菜单提供重命名、颜色、打开主目录、归档等操作。
- Project 视图工具栏提供新建 Project；更多菜单提供「显示已归档项目」。
- 项目和会话查找复用全局搜索，不新建一套项目中心搜索。

## 7. Project 主页

Project 主页是单个 Project 的稳定落点，不是所有 Project 的卡片中心。

```text
AI Dev
主目录：~/Workspace/AI-Dev
默认专家：通用软件专家

[新会话] [新建任务] [… ]

概览｜会话｜任务｜资料
```

### 7.1 概览

聚合当前 Project 的：

- 正在进行的 Task
- 最近 Session
- 最近资料
- 外部主目录状态
- 默认专家摘要

### 7.2 会话

展示当前 Project 的全部 Session，并支持新建 Project Session。

### 7.3 任务

复用现有 `WorkBoardView` 和 Kanban 数据源。新建 Task 与 Teambition 拉取入口位于该 Project 的任务上下文，不放入 Project 设置。

### 7.4 资料

展示 Project Assets 与 Memory 相关入口。资料不等同于外部 Repo 文件树；右侧文件面板不在本阶段调整。

### 7.5 设置

名称、颜色、默认专家、外部主目录和归档属于低频操作，通过 Project `…` 菜单或设置面板进入，不占用主要标签。

## 8. 核心用户流程

### 8.1 全局新会话

```text
点击「新会话」
→ 创建当前 Workspace 下的 Draft Session
→ projectId 为空
→ 输入区显示可选 Project 标签
→ 首次发送后持久化 Session
→ 未发送即离开时丢弃 Draft，不留下空会话
```

用户在首次发送前选择 Project 时，Session 绑定该 Project 并采用 Project 有效 cwd。

### 8.2 Project 内新会话

```text
Project 行内或主页点击「新会话」
→ 创建 Draft Session
→ workspaceId = Project.workspaceId
→ projectId = Project.id
→ cwd = Project.effectiveCwd
→ 首次发送后持久化
```

### 8.3 打开本地文件夹

```text
选择本地文件夹
→ 校验访问权限并规范化路径
→ 在当前 Workspace 查找绑定该路径的 Project
→ 找到：复用 Project
→ 未找到：以文件夹名自动创建 Project 并绑定 workingDirectory
→ 创建绑定 Project 的 Draft Session
→ 直接打开 Agent 输入界面
→ 首次发送后持久化
```

再次打开同一路径会复用原 Project，但可以创建新的 Draft Session。放弃 Draft 不会增加历史会话数量。

项目配置仍保存在 `~/.luxcoder` 或 `~/.luxcoder-dev`，未经用户明确操作不向外部 Repo 写入 `.luxcoder` 等配置文件。

### 8.4 新建与导入 Task

```text
进入 Project 任务页
→ 新建 Task 或打开 Teambition Picker
→ Task 自动绑定当前 Project
→ TaskRunner 创建的 Session 继承相同 workspaceId / projectId / cwd
```

脱离 Project 上下文的 Task 创建入口必须先要求用户选择 Project。

## 9. 数据兼容与迁移

本阶段采用非破坏迁移：

- `AgentWorkspace` 的 ID、slug、目录、Skills 和 MCP 不变。
- 产品 UI 将其称为 Workspace；不要求立即重命名 TypeScript 类型。
- 新安装默认名称为 `Default Space`。
- 已有 Workspace 名称不自动修改，包括用户已经重命名的默认 Workspace。
- 现有 Craft Project 的 ID、slug、Task、Assets、Memory、归档状态与 `workingDirectory` 不变。
- 现有 `workspaceId + projectId` Session 继续归入原 Project。
- 只有 `workspaceId` 的 Session 进入「未归类会话」。
- 删除「项目中心」只删除 UI 入口，不删除任何 Project 数据。
- Project `workdir/` 按需创建，不批量移动已有文件。

本设计不引入伪 Project 来承载未归类 Session，也不把旧 Workspace 自动转换为 Project。

## 10. 技术边界与组件职责

### 10.1 主进程

- `agent-workspace-manager`：继续负责 Workspace CRUD、Skills、MCP、Workspace Memory 和 Workspace 存储根。
- `project-repository`：继续负责 Project CRUD、Assets、Memory、`workingDirectory`，并提供托管 `workdir/` 路径。
- 新增独立的 Project 路径解析流程：规范化路径、按路径查找 Project、复用或创建 Project、计算 `effectiveCwd`。
- Session 创建继续通过现有 Session manager；Project/Task 绑定继续通过明确的命令或创建参数完成。

路径识别、重复判断和有效 cwd 计算必须位于主进程服务层，不能只存在于 React 组件中。

### 10.2 Renderer 与 Jotai

- 使用 Jotai 保存当前 Workspace、Project 列表、视图模式和当前 Project。
- `LeftSidebar` 只负责组合，不继续内联全部 Workspace、Project、Session 逻辑。
- Workspace 选择器、最近/项目切换器、Project 行、未归类分组分别成为边界清晰的组件或 view-model。
- Project 主页复用现有 Project atoms、`ProjectInfoPage` 和 `WorkBoardView`，不创建第二套看板数据。
- 「最近会话」与「项目」视图都从同一个 Session atom 派生。

### 10.3 IPC

只有在现有 Project IPC 无法支持以下行为时才新增最小通道：

- 选择本地目录
- 按规范化路径查找或创建 Project
- 查询 Project 有效 cwd 与路径状态
- 重新定位不可用主目录

若新增 IPC，必须同步 shared 类型、主进程 handler、preload bridge 和 renderer 调用四层。

## 11. 异常与安全规则

- 外部主目录不存在、无权限或磁盘离线时，Project 和历史数据仍可浏览。
- 配置了但不可用的外部目录不得静默回退到托管目录。
- 用户重新定位目录后，更新 `workingDirectory`，Project ID 与历史 Session 不变。
- 同一 Workspace 内路径已绑定时，直接打开已有 Project，不创建重复项目。
- 文件夹名称与已有 Project 重名但路径不同，新 Project 使用现有 slug 去重策略生成唯一 slug。
- Workspace 切换时取消或隔离尚未完成的列表请求，避免旧结果覆盖新 Workspace。
- Project 归档不删除 Session、Task、Assets 或 Memory。
- 本阶段不改变 Workspace 删除行为；任何后续删除语义重构需要单独设计。

## 12. BDD 验收场景

### 12.1 默认 Workspace 与侧栏

```gherkin
Given 用户首次启动 LuxCoder
When 进入 Code 模式
Then 侧栏显示名为 "Default Space" 的 Workspace 选择器
And 使用 Lucide 图标而不是 Unicode 下拉字符
And 不显示「工作」标题
And 不显示「项目中心」入口
```

### 12.2 两种 Session 投影

```gherkin
Given 当前 Workspace 同时有 Project Session 和未归类 Session
When 用户在「最近会话」和「项目」之间切换
Then 两个视图使用同一批 Session 数据
And 不创建 Session 副本
And Project Session 在两个视图中都能定位到相同 Session ID
```

### 12.3 全局与 Project 新会话

```gherkin
Given 用户位于 Code 侧栏
When 从全局入口新建会话并发送第一条消息
Then Session 具有当前 workspaceId
And projectId 为空

Given 用户位于某个 Project 上下文
When 新建会话并发送第一条消息
Then Session 自动具有该 Project 的 workspaceId 和 projectId
And Agent 使用该 Project 的有效 cwd
```

### 12.4 打开新文件夹

```gherkin
Given 当前 Workspace 没有绑定目标文件夹的 Project
When 用户选择「打开文件夹」
Then LuxCoder 以文件夹名创建 Project
And 将该路径保存为 workingDirectory
And 打开一个绑定该 Project 的 Draft Session
And 用户发送第一条消息前不持久化空 Session
```

### 12.5 重复打开路径

```gherkin
Given 当前 Workspace 已有 Project 绑定目标文件夹
When 用户再次打开同一路径
Then LuxCoder 复用原 Project ID
And 不创建重名 Project
And 可以创建新的 Draft Session
```

### 12.6 不可用路径

```gherkin
Given Project 配置了一个当前不可访问的外部主目录
When 用户打开 Project 或尝试运行 Agent
Then 历史 Session、Task 和资料仍可浏览
And 依赖 cwd 的运行被阻止
And UI 提供重新定位目录的操作
And 系统不静默切换到托管 workdir
```

### 12.7 Teambition 与 TaskRunner

```gherkin
Given 用户准备从 Teambition 导入任务
When 尚未确定 Project
Then 系统要求选择 Project
And 取消选择不会导入任务

Given Task 已绑定 Project
When TaskRunner 创建 Agent Session
Then Session 继承 Task 的 workspaceId、projectId 和有效 cwd
```

### 12.8 升级兼容

```gherkin
Given 用户升级前已有 Workspace、Project、Session、Task 和归档数据
When 启动采用新信息架构的版本
Then 原有 ID 与存储目录保持不变
And Project Session 仍属于原 Project
And 无 projectId 的 Session 出现在未归类分组
And 删除的只是旧项目中心 UI 入口
```

## 13. 完成标准

只有同时满足以下条件，本阶段才算完成：

1. UI 中 Workspace、Project、Session 三层术语和层级一致。
2. 侧栏只有「最近会话 / 项目」一套 Session 导航。
3. Project 主页成为单项目稳定落点。
4. 本地文件夹可以一步进入绑定 Project 的 Agent Draft Session。
5. 全局未归类 Session 与正式 Project Task 的归属规则得到强制执行。
6. 现有本地数据无破坏、无自动误分类、无重复 Project。
7. BDD 场景、类型检查和相关回归测试通过。
8. 经用户允许后，`AGENTS.md` 与 `README.md` 同步更新最终产品行为。
