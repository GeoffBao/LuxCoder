# Project & Kanban 完整迁移设计

日期：2026-07-13
状态：已获用户批准
权威实现：`/Users/admin/Workspace/ClaudeCode/craft-agents-max` 的 `260705-agent`，版本 `v0.11.1-craft.1`

## 1. 目标

将 `craft-agents-max/260705-agent` 中的 Projects、Task/Conductor、Kanban 和 Teambition-Kanban 集成完整迁移到 LuxAgents。

迁移完成后，Project + Task/Conductor + Kanban 是唯一的 Work 实现。用户可以在一个 Agent Workspace 内管理多个 Project，查看和归类所有普通 Agent Session，创建和编辑 DAG Task，运行/暂停/恢复/停止任务，并通过 Teambition 领取任务与同步进度。

## 2. 已确认的边界

- 以当前 `craft-agents-max/260705-agent` 源码为功能权威；现有 `v0.11.0` 迁移文档仅作辅助。
- Project 是 Agent Workspace 内的子实体，不替代 Workspace，也不跨 Workspace 共享。
- 现有普通 Agent Session 全部保留；未绑定 Project 或看板列的 Session 进入默认 Inbox/Backlog。
- 旧 WorkTask 数据不迁移，不保留只读旧看板。
- 旧 Work Mode、九阶段 LangGraph、WorkEngine、WorkTask、THO、旧 Work IPC、旧 atoms/components 和旧 checkpoint/telemetry 直接删除。
- Teambition 领取、绑定、卡片徽标、状态同步、进度回写、冲突和重新认证状态都属于本次迁移范围。
- 功能交互与信息结构跟随权威 Craft 实现；视觉适配 LuxAgents 现有主题、Jotai、Radix/Tailwind 组件和三段式 App Shell。
- 本次不做移动端专门布局；窄窗口使用单列横向滚动。

## 3. 总体架构

### 3.1 层级关系

```text
Agent Workspace
├── Projects
│   ├── config.json
│   ├── assets/
│   └── MEMORY.md
├── Sessions
│   ├── projectId
│   ├── kanbanColumn
│   ├── parentSessionId
│   └── taskSlug/taskRunId/taskNodeId
└── Tasks
    ├── <slug>/task.yaml
    └── <slug>/runs/<runId>/run-log.jsonl + node outputs
```

### 3.2 四层边界

1. Shared contracts：Project/Task/Session DTO、Zod schema、storage 类型和 IPC channel 常量。浏览器安全入口不能导出 `fs`、`path`、`crypto` 或文件存储实现。
2. Main runtime：ProjectRepository、TaskRepository、TaskRunner、ConductorSessionHost、TeambitionService 和 IPC handler。
3. Preload bridge：类型安全的 Projects、Tasks、Session commands、Teambition API 和事件订阅。
4. Renderer：Jotai atoms、Project 面板、Kanban、TaskEditor、拖拽交互、运行状态和 Teambition 视图模型。

### 3.3 单一职责模块

- `ProjectRepository`：Project 配置、资产、Memory 的文件 CRUD。
- `TaskRepository`：task.yaml、run-log、node output 和 snapshot；不负责创建 Session。
- `ConductorSessionHost`：TaskRunner 与现有 Agent SessionManager/Orchestrator 的唯一适配层。
- `TaskRunner`：DAG 依赖调度、并发、输入引用、重试、预算、verdict、repair 和恢复。
- `TeambitionService`：能力探测、领取、binding、状态/进度同步、冲突和 reauth。
- `KanbanViewModel`：纯函数合并 Session、Project、Run 和 Teambition binding，生成 renderer 专用模型。

## 4. 数据模型

### 4.1 Project

`ProjectConfig` 存储：`id`、`slug`、`name`、`description`、`workingDirectory`、`details`、`colorTheme`、`color`、时间戳、归档时间和可选 `kanbanColumns`。

Project 目录存储在当前 Workspace 下，包含 `config.json`、`assets/` 和 `MEMORY.md`。资产路径只在读取时解析，不写入配置；Project prompt context 只提供受限的资产 manifest 和 Memory 内容。

### 4.2 Session

在现有 SessionMeta/SessionHeader/SessionMetadata 中持久化：

- `projectId`
- `parentSessionId`
- `kanbanColumn`
- `taskSlug`
- `taskRunId`
- `taskNodeId`
- `taskNodeCount`
- `taskDraft`

Kanban 卡片以 Session 为持久化事实源。`KanbanTask`、`KanbanSubtask`、`TeambitionViewFields` 都是运行时派生模型，不直接写入 SessionMeta。

### 4.3 TaskSpec 与 TaskRun

TaskSpec 使用 `task.yaml`，字段包括 `id`、`title`、`goal`、`acceptance_criteria`、`project`、`cwd`、`runner`、`sources`、`skills`、`defaults`、`params`、`token_budget`、`max_parallel`、`max_iterations`、`nodes` 和 `outputs`。

Node 支持 `kind`、prompt、模型、连接、权限、依赖、inputs、outputs、retry、timeout、cache 和控制流字段。v1 执行 `session` 节点与依赖图；其他控制流字段可解析和 round-trip，但不得在 UI 中伪装成已执行能力。

TaskRun 使用追加式 `run-log.jsonl` 和节点 output 文件保存状态。内存快照可以丢失，但必须能从日志重建。

### 4.4 Teambition Binding

Binding 与本地 Session/Project 建立关系，Teambition 的任务展示字段在 Kanban render 时 join，不写入 SessionMeta。同步状态至少包含 `synced`、`pending`、`conflict`、`stale`；凭证缺失或过期返回 `needsReauth`，不阻塞本地看板使用。

## 5. UI 设计

### 5.1 Work 模式

- 左侧 Rail 保留 Chat、Work、Code 模式切换。
- Work 模式中间区域替换会话 Tab 内容，不影响 Chat/Code。
- Project 侧栏提供全部任务、Project 搜索、归档 Project 和创建入口。
- 主区提供 Board/List 切换、Project filter、Teambition 领取和新任务入口。
- 默认列为 Inbox/Todo、In Progress、Done；Project 可定义完整有序的自定义列。
- 卡片显示 Project、运行状态、模型、子任务进度、成本、最近活动、flag 和 Teambition sync badge。

### 5.2 交互

- 拖拽更新 `kanbanColumn`；IPC 失败回滚 optimistic UI，并显示 toast。
- 普通 Session 打开会话预览；spec-backed Session 打开 TaskEditor。
- TaskEditor 负责创建/编辑 task.yaml、表单验证、节点编辑、模型/权限/预算和运行操作。
- 子任务支持追加、编辑、展开进度和跳转到 child Session。
- ProjectInfo 使用 Sessions、Assets、Memory、Settings 四个视图。
- Teambition Picker 负责领取；绑定后卡片即时显示远端任务和同步状态。

## 6. 执行与恢复

### 6.1 正常流程

```text
TaskEditor validation
  → atomic task.yaml write
  → create/adopt parent Session
  → TaskRunner.run
  → dispatch ready nodes within maxParallel
  → child Session completion events
  → append output/run-log and schedule dependents
  → verifying and orchestrator verdict
  → PASS or bounded repair frontier
  → completed + Teambition sync
```

### 6.2 状态和护栏

- `running`：按依赖和并发限制派发。
- `paused`：不派发新节点，已运行节点可完成。
- `verifying`：节点完成，等待父 Session verdict。
- `repairing`：FAIL 后只重跑 repair frontier，次数受 `max_iterations` 与硬上限约束。
- `completed`、`failed`、`stopped`：明确终态，不隐式伪装成功。
- token budget 达限自动 pause；stop 取消活动 child session 并写日志。
- malformed verdict 的格式重问与真正 repair 使用独立上限。

### 6.3 冷启动恢复

启动时扫描非终态 run-log，重建 node state、attempt、token、output 和依赖图，再核对 SessionMeta 的实际终态。已记录的节点不得重复派发；找不到对应 Session 的节点标记失败；仍运行的任务恢复事件订阅并继续调度。

### 6.4 Teambition 一致性

本地 Project/Task/Session 事务不依赖远端成功。Teambition 写失败记录 pending/conflict/stale，可重试；写操作先做 capability 和 binding 校验；领取与同步使用幂等键，避免重复领取、评论或状态更新。

## 7. 实施阶段

### P0：边界清理

锁定权威源码快照、版本契约、依赖和删除清单；保护用户当前未提交改动；建立迁移专用测试入口。

### P1：Shared

完整迁移 Projects、Tasks、Protocol、schema、storage、refs、validation、generator prompt 和 renderer-safe exports，补齐包 exports 与类型测试。

### P2：Main Runtime

扩展 Session 持久化字段；实现 Project/Task IPC handlers、Preload API、Session commands、TaskRunner、ConductorSessionHost、事件广播和冷启动恢复。

### P3：Kanban UI

迁移 atoms、类型、Board、Column、Tile、子任务、状态徽章、编辑器、Project list/detail、filter、list toggle 和 TaskChatPreview；接入 LuxAgents App Shell 与主题。

### P4：Teambition

迁移 gateway/adapter、Picker、binding、徽标、claim、status/progress sync、capability、reauth 和冲突展示；加入 mock gateway 测试。

### P5：收口

删除旧 WorkTask、九阶段 LangGraph、WorkEngine、THO、旧 IPC/atoms/components、旧 storage/checkpoint/telemetry 和兼容桩；移除 `@ts-nocheck`、临时迁移标记与旧 Work 调用。

## 8. 测试矩阵

- Shared：schema、slug、重复节点、YAML round-trip、storage atomicity、资产和 Memory。
- Main：Project CRUD、Task CRUD、IPC 参数、TaskRunner DAG、并发、预算、pause/resume/stop、verdict、repair、rehydrate。
- Session：字段持久化、父子关联、列移动、事件广播、普通旧 Session 默认归类。
- Renderer：拖拽回滚、filter、subtask merge、editor validation、Project tabs、Board/List、主题和窄窗口。
- Teambition：capability、claim 幂等、binding、sync conflict、needsReauth、status update、mock gateway。
- Smoke：`bun run dev` 冷启动无白屏、无 renderer `fs` externalization 错误；生产 main/preload/renderer build 通过。

## 9. 最终完成标准

1. Workspace 内可创建、编辑、归档和删除 Project。
2. Project 可查看 Sessions、Assets、Memory 和 Settings。
3. 普通 Session、quick-add task、spec task 都能进入看板。
4. 拖拽、筛选、列表切换、TaskEditor、子任务管理可用。
5. DAG 运行、暂停、恢复、停止、verdict、repair 和冷启动恢复可用。
6. Teambition 领取、绑定、同步、冲突和重新认证提示可用。
7. `bun run typecheck`、相关测试、生产构建和 `bun run dev` 冷启动全部通过。
8. 不存在旧 Work 调用、`@ts-nocheck`、临时迁移标记或只为兼容而保留的旧数据路径。
9. 只修改迁移所需文件；`AGENTS.md` 和 `README.md` 在用户明确允许后同步更新。
