# `create_task` Agent 工具设计

## 背景

craft-agents-oss 对比评审（见 [craft-agents-oss project/kanban 迁移完整性评审]，2026-07-23）发现的唯一一个"移植基线之后 craft 新增、LuxCoder 未跟进"的功能：v0.11.2 的 `create_task` session tool——Agent 对话中可以直接把一张 todo 卡片落到看板上（写 `task.yaml` + 建 orchestrator 会话），只创建不运行，是否启动交给用户或自动化决定。

这是本轮 craft 高价值补齐（"期二"）的第一项，也是唯一"post-port 真正的新功能"（其余候选如看板就地列管理、卡片快速操作都是"移植时被简化掉的旧功能"，性质不同）。

## 目标

- Agent 对话中新增 `create_task` 工具：给定 title + description（其余字段可选），在当前 Workspace 落一个 `todo` 状态的任务（task.yaml + orchestrator 会话），**不自动运行**。
- 未指定 `projectId` 时，继承发起会话的 `projectId`（若有）。
- `sources`/`skills` 传入未知 slug 时返回 warning，不阻断创建（对齐 craft 语义）。
- 与现有 `TASK_IPC_CHANNELS.CREATE`（渲染进程"新建任务"表单）共享同一条任务落盘路径，不新造第二套写入逻辑。
- 复用 LuxCoder 现有的"内置 MCP 注册中心"机制（`builtin-mcp/registry.ts` + `settings.ts`），跟 `collaboration`/`automation`/`nano-banana` 同一套注入/开关模式。

## 非目标

- **不做 Pi runtime 支持**：核实过 `automation-agent-tools.ts`（同样是单一职责的内置工具）只有 Claude SDK 版本，没有 Pi 版本——只有 `collaboration`（委派协作，核心到需要双跑时）才双写。`create_task` 按 `automation` 的先例来，只做 Claude 路径，属于合理的范围收窄，不是遗漏。
- **不返回 `taskLabelId`**：craft 用通用 labels 系统标记"这是个 Task 会话"；LuxCoder 用 `sessionStatus`/`taskSlug` 已经原生实现了同样的区分，labels 字段本身是无消费方的死代码（craft 对比评审已发现）。硬要打通是给死代码找理由，不在本次范围。
- **不做看板就地列管理 / 卡片快速操作**（评审报告优先级 #2、#3）——这些是独立的后续项，本次只做 `create_task`。
- **不新增"允许无项目任务"或"多选项目过滤器"**这两个待定的存疑分叉——虽然评审已经确认了方向（对齐 craft），但那是给"手动建任务表单"用的，跟 Agent 工具的 `projectId` 可选/继承语义是两回事，本次 `create_task` 的 `projectId` 可选本来就是 craft 原生设计，不冲突，不需要等那两项一起做。

## 设计

### 1. 共享的"最小任务 Spec"构建函数（新）

新建 `packages/shared/src/tasks/build-minimal-spec.ts`：

```ts
export interface BuildMinimalTaskSpecInput {
  title: string
  description: string
  acceptanceCriteria?: string
  sources?: string[]
  skills?: string[]
  llmConnection?: string
  model?: string
  workingDirectory?: string
  projectId?: string
}

export function buildMinimalTaskSpec(input: BuildMinimalTaskSpecInput): TaskSpec {
  // slug 由 title 派生（复用/迁移 task-spec-form.ts 现有的 slugify 实现）
  // 单节点 orchestrator spec：description 同时作为 goal 与首节点 prompt
  // sources/skills/acceptanceCriteria/workingDirectory/projectId 直接映射到 TaskSpec 对应字段
}
```

`slugify` 目前只在 `apps/electron/src/renderer/components/app-shell/kanban/task-spec-form.ts`（渲染进程私有）实现，主进程侧的新工具无法直接复用——迁移到 `packages/shared/src/utils/slug.ts`，两边都从这里导入，不重复实现。

### 2. `task-handlers.ts` 抽出可复用的"落盘 + 建会话"核心函数

现状：`TASK_IPC_CHANNELS.CREATE` 的 `ipcMain.handle` 回调里内联了"校验 YAML → `saveTaskSpec` → 通过 `getSessionHost().createSession()` 建会话"的全部逻辑，且 `getSessionHost` 是模块私有函数，新工具在另一个文件里无法直接复用。

改法：把这段逻辑抽成一个导出函数（沿用现有变量名/参数顺序即可，不改变 IPC handler 的行为）：

```ts
export async function materializeTaskFromSpec(
  workspaceRoot: string,
  workspaceId: string,
  spec: TaskSpec,
): Promise<{ slug: string; orchestratorSessionId: string }>
```

IPC handler 内部改为调用这个函数；新的 `create_task` 工具也调用它——两条创建路径（表单 UI / Agent 工具）共享同一条写入逻辑，不产生第二套"建任务"实现。

### 3. 新建 `apps/electron/src/main/lib/create-task-agent-tool.ts`

镜像 `automation-agent-tools.ts` 的单一职责结构（不是 `agent-collaboration-tools.ts` 那种多工具大文件——`create_task` 只有一个工具）：

```ts
export async function injectCreateTaskMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
  ctx: CreateTaskToolContext,
): Promise<void>
```

`ctx` 需要：`sessionId`（用于继承 `projectId`）、`workspaceId`、`workspaceSlug`（解析 `workspaceRoot` 用）。

工具实现要点：

- **入参 Zod schema**：`title`（必填）、`description`（必填，成为 goal + 首节点 prompt）、`acceptanceCriteria`（可选）、`sources`/`skills`（可选字符串数组）、`llmConnection`/`model`（可选）、`workingDirectory`（可选）、`projectId`（可选——省略时从 `getAgentSessionMeta(ctx.sessionId)?.projectId` 继承，跟 `agent-collaboration-tools.ts` 里父子会话继承 `projectId` 的写法一致）。
- **workspaceRoot 解析**：`getAgentWorkspace(ctx.workspaceId)?.slug` → `getAgentWorkspacePath(slug)`（均已存在于 `agent-workspace-manager.ts`/`config-paths.ts`，直接复用）。
- **sources/skills 校验**：用 `getWorkspaceSkills(workspaceSlug)`（已存在）核对 `skills` 数组，`getWorkspaceMcpConfig(workspaceSlug)`（已存在）核对 `sources` 数组；未知 slug 收进 `warnings` 数组返回，不抛错、不阻断创建（对齐 craft 语义）。
- **调用链**：`buildMinimalTaskSpec(args)` → `materializeTaskFromSpec(workspaceRoot, workspaceId, spec)` → 返回 `{ slug, orchestratorSessionId, warnings }`。
- **工具描述**：参照 craft 原文本改写为中文，明确"CREATION ONLY，不会自动运行，需要用户或自动化显式启动"，避免 Agent 误以为调用后任务立刻执行。

### 4. 注册进内置 MCP 单一事实源（`default-mcp.json`）

排查发现 `builtin-mcp/registry.ts` 不是唯一要改的地方——`automation`/`collaboration`/`nano-banana` 的展示元数据（id/name/displayName/description/category/tools 列表）统一来自 `apps/electron/src/main/lib/builtin-mcp/default-mcp.json`（单一事实源，`baseline.ts` 加载后供注入器、设置面板"能力列表" UI、`RESERVED_BUILTIN_KEYS` 保留名校验共用）。不加这一条，工具能跑，但设置面板里看不到、也没法手动关闭。

`default-mcp.json` 的 `servers` 数组新增一项：

```json
{
  "id": "create-task",
  "name": "create_task",
  "displayName": "创建任务",
  "description": "在 Agent 对话中直接创建看板任务（写 task.yaml + 建 orchestrator 会话），只创建不运行。",
  "category": "task",
  "kind": "internal",
  "deletable": false,
  "defaultEnabled": true,
  "toggleable": true,
  "tools": [
    { "name": "create_task", "description": "创建一个 todo 状态的看板任务，不自动运行。" }
  ]
}
```

`category` 用了一个新值 `'task'`——现有 `BuiltinMcpCategory`（`packages/shared/src/types/agent.ts`）只有 `system | automation | collaboration | memory | media | browser`，没有贴切的桶。硬塞进 `'automation'` 会跟"定时任务"那个条目的语义混在一起（`automation` 分类的既有描述明确指"定时/计划任务"，不是"看板任务"），容易在设置面板里看错。新增一个 `'task'` category 是最小必要改动，同步把 `BuiltinMcpCategory` 类型扩一个值。

`builtin-mcp/registry.ts` 新增注入调用（跟 `automation` 同样的写法，不需要 `collaborationAvailable` 那种复杂门槛判断——`create_task` 没有委派深度/触发来源的限制）：

```ts
if (isBuiltinMcpUserEnabled('create-task')) {
  await injectBuiltinSafely('create-task', () => injectCreateTaskMcpServer(ctx.sdk, ctx.mcpServers, {
    sessionId: ctx.sessionId,
    workspaceId: ctx.workspaceId,
    workspaceSlug: ctx.workspaceSlug,
  }))
}
```

`builtin-mcp/settings.ts` 本身**不需要改代码**——`DEFAULT_DISABLED_IDS` 黑名单不包含 `create-task`，默认走"未加入黑名单即视为开启"的分支，天然默认开启，符合本次确认的产品决策。

### 5. Pi runtime

不做（见"非目标"）。若未来需要，`pi-builtin-tools.ts` 里加一段跟 `buildPiCollaborationTools` 同样的调用即可，接口已经预留了扩展空间。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `packages/shared/src/utils/slug.ts` | 新增，从 `task-spec-form.ts` 迁移 `slugify` |
| `packages/shared/src/tasks/build-minimal-spec.ts` | 新增，`buildMinimalTaskSpec` |
| `apps/electron/src/renderer/components/app-shell/kanban/task-spec-form.ts` | 改为从 `packages/shared` 导入 `slugify`，删除本地实现 |
| `apps/electron/src/main/lib/task-handlers.ts` | 抽出并导出 `materializeTaskFromSpec`，IPC handler 内部改为调用它 |
| `apps/electron/src/main/lib/create-task-agent-tool.ts` | 新增，`injectCreateTaskMcpServer` |
| `apps/electron/src/main/lib/builtin-mcp/registry.ts` | 接入新工具注入 |
| `apps/electron/src/main/lib/builtin-mcp/default-mcp.json` | 新增 `create-task` 条目（单一事实源，驱动设置面板展示 + 保留名校验） |
| `packages/shared/src/types/agent.ts` | `BuiltinMcpCategory` 新增 `'task'` |

## 验证计划

- 类型检查：`bun run typecheck`
- 单测：`buildMinimalTaskSpec`（纯函数，覆盖 slug 派生、字段映射、可选字段缺省）、`materializeTaskFromSpec`（如现有 `task-handlers.ts` 测试基建允许）
- 手动过一遍（`bun run dev`）：
  - Code 模式下跟 Agent 对话，让它调用 `create_task` 创建一个任务 → 确认看板上出现一张 `todo` 卡片，且**没有自动运行**
  - 省略 `projectId` 时，确认新任务继承了当前会话的项目
  - 传入不存在的 `skills` slug → 确认返回 warning 而不是报错，任务仍然创建成功
  - 通过表单 UI（现有"新建任务"流程）新建任务 → 确认行为与改动前一致（回归检查 `materializeTaskFromSpec` 抽取没有破坏原有路径）
  - 设置面板的能力列表（读 `WorkspaceCapabilities.builtinMcpServers`）确认 `create-task` 出现、分类为"创建任务"、默认开启态；手动关闭后 Agent 对话中确认工具不再可用
