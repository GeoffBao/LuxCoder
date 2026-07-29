# Workspace Task / Context / Labels 信息架构设计

**日期：** 2026-07-28

**状态：** 已确认

**范围：** Workspace、Project、Task、Plan、Run、Session、Context、Knowledge、Skills、Experts、Labels 与 Task 看板

**取代范围：** 本文取代 `2026-07-22-workspace-project-session-ia-design.md` 中“Task 必须属于 Project”、Project 主页旧 tabs、Code「会话｜看板」双模式以及 Project/Task 删除语义的对应设计；其余 Workspace、Project、Session、工作目录与侧栏原则继续有效。

## 1. 决策摘要

LuxCoder 将 Task 提升为独立领域实体，不再把 orchestrator Session 或普通顶层 Session 当作 Task 身份。

- Workspace 是能力、安全、数据和运行隔离边界。
- Project 是可选的长期工作容器；负责 Project Knowledge、Assets、默认 Expert 与有效 cwd。
- Task 必须属于 Workspace，可以是 Workspace Task，也可以绑定 Project。
- Plan Revision 是 Task 的可执行计划版本；Run 固定引用某个 Plan Revision。
- Session 是对话和执行载体，可以独立存在，也可以关联 Task、Run 和 DAG Node。
- Task 看板成为侧栏一等入口，只展示正式 Task；旧 Session 看板过渡期保留兼容视图。
- Agent 技能页中的“记忆”改为 Workspace Context；Project 长期工程知识进入 Project Knowledge。
- Labels 是 Workspace scoped 多值分类维度，与 Project、Task Workflow、Run/Session Status 分离。
- Default Workspace 是 Skill canonical source；其他 Workspace 使用本地快照。
- Expert 身份核全局共享，Skill/MCP binding 按 Workspace 隔离。

## 2. 领域模型

```text
Workspace
├── Workspace Context
├── Skills / MCP / Experts / Labels
├── Project*
│   ├── Project Knowledge
│   ├── Assets
│   ├── Session*
│   └── Task*
├── Workspace Task*
└── Unclassified Session*

Task
├── Plan Revision*
├── Run*
│   └── Node Session*
└── Related Session*
```

### 2.1 Workspace

Workspace 负责：

- Skills、MCP、Sources、渠道、模型和权限能力边界；
- Workspace Context 与 Auto Memory；
- Expert 的 Workspace binding；
- Labels definitions；
- Project、Task 与 Session 集合；
- 可选 Workspace default cwd。

Default Workspace 是第一公民，也是 Workspace Skill 分发的 canonical source。Workspace 不等同于单个 Repo 或 Project。

### 2.2 Project

Project 是 Workspace 内的长期工作容器，负责：

- Project Knowledge；
- Assets；
- 外部 workingDirectory 或托管 workdir；
- 默认 Expert 引用；
- Project Session 与 Project Task 投影。

Project 不复制 Workspace Skills/MCP。Project Task 仍属于 Workspace，只通过不可变 `projectId` 建立归属。

### 2.3 Task Scope

```ts
type TaskScope =
  | { kind: 'workspace' }
  | { kind: 'project'; projectId: string }
```

旧 `TaskSpec.project` 为空时映射为 Workspace Task；引用失效 Project 时必须显示 dangling diagnostic，不能静默当作正常 Workspace Task。

### 2.4 Task、Plan、Run 与 Session

- Task：长期工作身份、Workflow、Labels、归档和引用完整性。
- Plan Revision：DAG、模型、Expert、Skills/MCP、权限、预算和重试策略。
- Run：一次不可变执行，固定引用 Plan Revision 和运行时快照。
- Session：对话或执行载体，不承担 Task 身份。
- Conductor：Run 的 DAG runner，不是 Task 本身。

所有新关系使用不可变 `taskId/projectId/runId`。`slug` 只用于可读路径和兼容，不再作为长期外键。

## 3. 状态边界

```ts
type TaskWorkflow =
  | 'todo'
  | 'in-progress'
  | 'needs-review'
  | 'done'
  | 'cancelled'

type RunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'recovery-required'
```

Session Runtime 继续表达 idle/processing/error/archived 等会话态。

自动规则：

- Run 开始时只允许 `todo → in-progress`；
- Run 成功或失败后 Task 进入 `needs-review`；
- `done/cancelled` 只由用户决定；
- Run/Session 状态不得覆盖用户 Task Workflow；
- Labels 不得映射或推导任何状态。

## 4. cwd 与运行不变量

唯一解析顺序：

```text
Task 显式 cwd
→ Project effective cwd（Project Task）
→ Workspace default cwd
→ blocked:missing-cwd
```

- 没有有效 cwd 的 Task 可以创建、编辑和排队，但不得创建 Run/Node Session。
- 配置过但失效的路径不得静默回退。
- Run 开始前验证 exists、isDirectory 与访问策略。
- Run snapshot 保存 resolved cwd 及来源；运行中 Project/Workspace 配置变化只影响未来 Run。
- rehydrate 使用 snapshot，不重新解析 live Project。

## 5. 物理存储与兼容

短期保留 Workspace 根平铺目录：

```text
<workspaceRoot>/
├── labels/config.json
├── skills/
├── expert-bindings/
├── projects/<projectSlug>/
│   ├── config.json
│   ├── MEMORY.md
│   ├── assets/
│   └── workdir/
├── tasks/<taskSlug>/
│   ├── task.json
│   ├── task.yaml               # 旧/当前可执行 spec
│   └── runs/<runId>/
└── <sessionId>/.context/
```

首版 `task.json` 只拥有：

- stable taskId；
- slug；
- revision；
- Task Workflow；
- labelIds；
- orchestratorSessionId；
- archivedAt 与时间戳。

`task.json` 不复制 `task.yaml` 的 title/project/cwd/plan 字段，避免双写真源。旧 task 目录缺少 `task.json` 时可以内存合成；只读浏览不写盘。幂等迁移显式回填 taskId，不移动 task.yaml 或 Runs。

长期结构演进为：

```text
tasks/<slug>/
├── task.json
├── plans/0001.yaml
├── plans/0002.yaml
└── runs/<runId>/
    ├── run.json
    ├── spec.json
    ├── context-snapshot.json
    ├── run-log.jsonl
    └── nodes/
```

Plan Revision 先写成功，再原子更新 active revision pointer。历史 Run snapshot 永不随 live Task、Project、Expert、Skill 或 Label 变化改写。

## 6. 创建、运行和恢复

Generate、Create、Run 三段边界继续强制：

- Generate：无工具、无写盘、无 Session/Run 副作用；
- Create：物化 TaskRecord、Plan 与 orchestrator link；
- Run：创建 Run snapshot 后才执行节点。

Task materialization 使用可恢复事务：

```text
draft → materializing → ready
                        ↘ recovery-required
```

事务需要 staging、journal、幂等步骤和失败补偿。列表必须展示 materializing/invalid/recovery-required，而不是让孤儿 Task 消失。

Run 要求：

- runId 使用 UUID，原子目录创建并拒绝复用；
- 首版同一 Task 只允许一个 active Run；
- snapshot 写失败时禁止派发；
- 节点派发使用 `taskId/runId/nodeId/attempt` correlation key；
- 恢复先查找已存在 Session，避免重复副作用；
- JSONL 只容忍尾行截断，中段损坏进入 recovery-required。

## 7. 导航与页面

侧栏顺序：

```text
Agent 自动化
Agent 技能
Agent 专家
Task 看板
────────────
会话 / 项目
```

Task 看板是唯一正式 Task 页面。旧 `codeMainView='work'` 与 cowork 入口在兼容期重定向到该页面，之后移除死状态和旧文案。

Project Page：

```text
Overview | Sessions | Knowledge | Assets | Settings
```

Project 的“查看任务”跳转唯一 Task 看板并设置 Project facet，不创建第二套看板数据源。

Agent 技能页面改为：

```text
Skills | MCP | Context
```

其中页面标题明确为 Workspace Context，并持续显示 scope badge。

## 8. Context 与 Knowledge

Workspace Context 聚合：

- Workspace CLAUDE.md；
- Workspace Auto Memory；
- workspace-files/.context；
- 附加目录与文件；
- Skills/MCP 能力摘要；
- 当前 Project overlay 摘要和跳转。

Project Knowledge 聚合：

- Project details/instructions；
- Project MEMORY.md；
- Assets；
- Repo-local CLAUDE.md/AGENTS.md 等可发现指令。

工程架构、命令和决策写 Project Knowledge；跨项目偏好、环境事实和稳定经验写 Workspace Context。Session `.context` 是临时工作台，不自动进入长期知识。

## 9. Skills 与 Experts

- Default Workspace Skill 是 canonical source。
- 其他 Workspace 下载后运行本地快照。
- 快照记录 origin、revision/hash、syncedAt、localModified、detached。
- canonical 更新只提示，不自动覆盖；本地修改允许 diff、保留、覆盖或 detach。
- canonical 删除不删除已下载快照。

Expert 分层：

```text
Global Expert Identity
└── IDENTITY / SOUL / RULES

Workspace Expert Binding
└── skillSlugs / mcpIds / overrides
```

“从专家移除 Skill”只解除 binding，不卸载 Workspace Skill。Run snapshot 保存最终解析的 Expert/Skill/MCP hashes；缺失能力阻止运行，不静默降级。

## 10. Labels

Workspace Labels v1 是稳定 ID 的平面 definitions：

```ts
interface WorkspaceLabel {
  id: string
  name: string
  color?: string
  archivedAt?: number
  createdAt: number
  updatedAt: number
}
```

Project、Status、Labels 的边界：

```text
Project = 单值结构归属，可为空
Task Workflow / Session archive status = 单值状态
Labels = 多值横向分类
```

会话侧栏“筛选与排序”增加 Label 多选：

- 归档状态与 Labels 使用 AND；
- 同一 Label facet 多选使用 OR；
- 支持“无标签”；
- Session tree 中根或任一 child 命中时保留整棵 family；
- Pinned 同样遵守筛选；
- v1 不按 Label 分组或排序。

Task 看板采用：

```text
Project AND Task Workflow AND Labels
```

Task labelIds 以 TaskRecord 为真源；task-backed orchestrator 只显示投影，不保存第二份真源。普通 Session 使用自身 labelIds。`TaskNode.labels` 暂保留 legacy execution metadata，Labels v1 不自动创建或映射 Workspace definitions。

Label 默认 archive，不破坏历史引用；显式“从所有当前对象移除”才批量清理 live refs。历史 Run 保存名称/颜色快照。

## 11. 删除与移动

- Project 默认归档；永久删除前展示 Task、Session、Run、Knowledge、Assets 和 workdir 影响。
- active Run 或受管 workdir 被引用时禁止 purge。
- 用户可将 Project Task 转为 Workspace Task、移动到其他 Project或取消；不得静默解绑。
- Task 支持 archive、soft-delete、purge。
- 删除 Session 不删除 Task/Run；删除 Task 不默认删除历史 Session。
- 首版禁止只把 task-backed Session 移到另一 Workspace；完整 Task 迁移后续实现。
- 历史 Run snapshot 永不因 Project/Task/Label 删除改写。

## 12. 验收标准

1. 旧 task.yaml、旧无 Project Task、旧 Session 看板和历史 Runs 可读且未被静默搬迁。
2. Workspace Task 缺 cwd 时可保存但不可运行，UI 提供修复入口。
3. 正式 Task 看板不把普通顶层聊天称为 Task。
4. Status、Labels、Project 可组合筛选，修改 Label 不改变 Status。
5. 会话侧栏所有分组模式得到一致结果，Pinned 不绕过 Label 筛选。
6. Workspace Context 与 Project Knowledge 没有双写入口。
7. Skill 更新不覆盖其他 Workspace 本地修改。
8. 同一 Expert 在不同 Workspace 的 binding 互不覆盖。
9. Project/Task 删除前有影响预览，active Run 和受管 cwd 不被破坏。
10. 所有创建入口、Agent tool、导入、重跑和恢复遵守同一 scope/cwd/identity 规则。
