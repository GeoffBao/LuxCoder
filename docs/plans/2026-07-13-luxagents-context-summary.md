# LuxAgents 项目当前上下文汇总

> 日期：2026-07-13
> 范围：Work 模式（九阶段状态机 + LangGraph 编排 + Teambition 集成）+ SDD 方法论参考
> 来源：10 份文档/代码文件交叉提取

---

## 1. 项目硬约束（从 AGENTS.md / CLAUDE.md 提取）

### 1.1 架构约束

| 约束 | 说明 |
|---|---|
| **Jotai 状态管理** | 全部状态管理使用 Jotai，不引入 Redux 或其他方案 |
| **无数据库** | 纯 JSON/JSONL 文件方案，`~/.luxagents/` 目录，不引入本地数据库（SQLite 等） |
| **四层 IPC 模式** | 类型定义（`@proma/shared`）→ 主进程 `ipcMain.handle()` → Preload `contextBridge` → 渲染进程 `window.electronAPI.*` |
| **ShadcnUI + Radix UI + Tailwind CSS** | UI 组件采用 ShadcnUI，卡片和阴影取代边框，饱满色彩 |
| **BDD 行为驱动开发** | 测试优先，`bun:test` |
| **Bun 运行时** | Bun 1.2.5+，替代 Node.js/npm/pnpm |
| **中文注释+日志** | 注释和日志优先中文，保留专业术语 |
| **`no any` 规则** | 永远不使用 `any` 类型，创建合适的 interface；interface 优先 type |
| **`import type`** | 尽可能使用 `import type` 进行仅类型导入 |

### 1.2 技术栈版本

| 层级 | 技术 | 版本 |
|---|---|---|
| 运行时 | Bun | 1.2.5+ |
| 桌面框架 | Electron | 39.5.1 |
| 前端框架 | React | 18.3.1 |
| 状态管理 | Jotai | 2.17.1 |
| 样式 | Tailwind CSS | 3.4.17 |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | 0.3.185 |
| 打包构建 | Vite 6 + esbuild 0.24+ | — |

### 1.3 Monorepo 结构

```
LuxAgents/
├── packages/
│   ├── shared/     # 共享类型、IPC 通道常量、配置、工具函数
│   ├── core/       # AI Provider 适配器、代码高亮
│   └── ui/         # 共享 UI 组件
└── apps/
    └── electron/   # Electron 桌面应用
        └── src/
            ├── main/       # 主进程 + 服务层 (main/lib/)
            ├── preload/    # IPC 上下文桥接
            └── renderer/   # React UI (Vite + Tailwind + Radix UI)
```

### 1.4 存储结构

```
~/.luxagents/
├── work-tasks.json          # 任务索引（{version, counter, tasks[]}）
├── work-tasks/{id}.jsonl    # 迁移审计日志
├── work-checkpoints/{threadId}.json  # 图执行 checkpoint
└── work-telemetry.jsonl     # 遥测
```

---

## 2. Work Mode 当前架构

### 2.1 九阶段状态机（权威状态模型）

**需求 / Feature 完整流程：**

```
pending → req-writing → req-reviewing → design-writing → design-reviewing
         → coding → gerrit-reviewing → pending-writeup → completed
```

**Bug / Task 捷径流程：**

```
pending → coding → gerrit-reviewing → pending-writeup → completed
```

**终态：** `completed` / `cancelled`

### 2.2 LangGraph 图定义（work-graph.ts）

**图节点（9个，完整流程）：**

| 节点 | 角色 | 类型 |
|---|---|---|
| `fetch_task` | 拉取任务详情 | 业务节点（withTelemetry） |
| `gen_req_doc` | 生成需求文档 | 业务节点 |
| `req_review` | 需求审核 gate | interrupt 节点 |
| `gen_design_doc` | 生成方案设计文档 | 业务节点 |
| `design_review` | 方案审核 gate | interrupt 节点 |
| `coding_start` | 启动编码会话 | 业务节点 |
| `coding_wait` | 等待编码完成 | interrupt 节点 |
| `writeup` | 撰写经验文档 | 业务节点 |
| `report` | 回写 TW | 业务节点 |

**条件边路由：**
- `req_review` → 批准→ `gen_design_doc`，驳回→ `gen_req_doc`
- `design_review` → 批准→ `coding_start`，驳回→ `gen_design_doc`
- `coding_wait` → 成功→ `writeup`，失败且 retries < max → `coding_start`，失败且 retries >= max → `report`

**关键设计决策：**
- interrupt 节点与业务节点**拆分为两个节点**——避免 resume 时副作用重复触发
- 两条拓扑（shortcut/full）各用一条完整的 fluent chain 构建——TypeScript 类型安全要求
- `thread_id = 任务 displayId`，天然幂等

### 2.3 WorkGraph 状态（WorkStateAnnotation）

```typescript
const WorkStateAnnotation = Annotation.Root({
  taskId: Annotation<string>,
  phase: Annotation<WorkPhase>,
  docs: Annotation<{...}>({ reducer: 浅合并 }),
  approval: Annotation<WorkApprovalRecord>({ reducer: 替换 }),
  agentSessionId: Annotation<string>({ reducer: 替换 }),
  retries: Annotation<number>({ reducer: 替换 }),
  lastFailure: Annotation<{stage, summary}>({ reducer: 替换 }),
  telemetry: Annotation<WorkNodeTelemetry[]>({ reducer: concat }),
})
```

### 2.4 WorkLooperNodeImpls（图节点业务注入接口）

```typescript
interface WorkLooperNodeImpls {
  fetchTask(state): Promise<Partial<WorkGraphState>>
  genReqDoc(state): Promise<Partial<WorkGraphState>>
  genDesignDoc(state): Promise<Partial<WorkGraphState>>
  startCoding(state): Promise<{ agentSessionId: string }>
  writeup(state): Promise<Partial<WorkGraphState>>
  report(state): Promise<Partial<WorkGraphState>>
}
```

### 2.5 WorkEngine 编排逻辑（work-engine.ts）

**核心职责：**
- 事件统一入口：TW 拉取 / 审批操作 / 编码会话完成回调 → 图 invoke/resume
- 落地任务索引 + 审计日志 → 推送变更事件
- 并行编码会话上限（默认 2，由 `activeCoding` Set 管理）
- 启动对账：核对非终态 thread 与 agentSessionId 实际终态

**依赖注入设计：**

```typescript
interface WorkEngineDeps {
  adapter: TeambitionAdapter
  nodeImpls: WorkLooperNodeImpls
  store: WorkTaskStoreDeps          // 单测注入内存实现
  resolveModuleConfig: (task) => WorkModuleConfig
  checkCodingSessionStatus?: (agentSessionId) => Promise<'running'|'completed'|'failed'>
  onTaskChanged?: (task) => void
  onCodingStarted?: (task, agentSessionId) => void  // 必须在 graph.invoke() 完全返回后触发，避免 ALS 上下文嵌套
  maxParallelCoding?: number        // 默认 2
  staleThresholdMs?: number         // 默认 24h
  checkpointDir?: string
  telemetryPath?: string
}
```

**主要方法：**

| 方法 | 触发 | 效果 |
|---|---|---|
| `createLocalTask(input)` | 手动创建 | 创建 → startTask → 入图 |
| `pullFromTw(projectId)` | TW 轮询 | 拉取 → 新任务起图，已存在只刷新 |
| `startTask(task)` | 起图 | 从 pending 跑到第一个 interrupt |
| `submitApproval(taskId, approval)` | 审批操作 | resume interrupt → 继续图执行 |
| `notifyCodingResult(taskId, resume)` | 编码完成 | resume coding_wait → 继续图执行 |
| `reconcileOnStartup()` | 启动 | 核对 coding 中任务的会话状态 |
| `cancelTask(taskId)` | 取消 | 只更新索引态，不操作 checkpoint |

### 2.6 THO 契约（Task Handoff Object v1.0）

**下发（Work → Code）：** task.id/title/type/repo/spec/context/constraints

**回传（Code → Work）：** status/outputs(commits/changedFiles/testScripts/failure)/telemetry(durationMs/tokens/skills/toolCalls/retries)

Telemetry 为**必填段，不可裁剪**。

---

## 3. TeambitionAdapter 接口契约

### 3.1 接口定义（teambition-adapter.ts）

```typescript
interface TeambitionAdapter {
  listTools(): Promise<TeambitionToolDescriptor[]>
  fetchTasks(projectId: string): Promise<TeambitionTaskRaw[]>
  fetchTaskDetail(taskId: string): Promise<TeambitionTaskRaw>
  updateStatus(taskId: string, phase: WorkPhase): Promise<void>
  postComment(taskId: string, text: string): Promise<void>
  close(): Promise<void>
}
```

### 3.2 类型定义

| 类型 | 定义 | 说明 |
|---|---|---|
| `TeambitionTaskRaw` | `Record<string, unknown>` | 原始负载，字段未知，上层按需窄化 |
| `TeambitionToolDescriptor` | `{ name, description? }` | 工具描述 |
| `TeambitionToolNames` | `{ listTasks, getTaskDetail, updateStatus, postComment }` | 需探测后填值的工具名映射 |
| `McpTeambitionAdapterConfig` | `{ server: McpServerEntry, toolNames: TeambitionToolNames }` | 连接配置 |

### 3.3 两个实现

**`McpTeambitionAdapter`：**
- 使用 `@modelcontextprotocol/sdk` Client + `StreamableHTTPClientTransport`
- 连接复用现有 `McpServerEntry` 配置形状（`type:'http'` + `url` + `headers` 带 token）
- `listTools()` 首次连接时调用 `client.listTools()`
- 所有 `callTool` 通过 `extractToolPayload()` 解析返回体（兼容 `isError` / `structuredContent` / `text` 三种格式）
- 写方法（updateStatus/postComment）缺失时应抛错，由上层回退到 REST 兜底

**`MockTeambitionAdapter`：**
- 内存 Map 存储种子任务，开发/演示/单测兜底
- 默认种子：TW-MOCK-1001（需求）、TW-MOCK-1002（Bug）
- `updateStatus`/`postComment` 操作内存态

### 3.4 现有测试覆盖（teambition-adapter.test.ts）

| 测试 | 覆盖 |
|---|---|
| Mock: listTools | 返回 4 个 mock 工具名 |
| Mock: fetchTasks + fetchTaskDetail | 种子任务读写 |
| Mock: fetchTaskDetail 不存在 | 抛错 |
| Mock: updateStatus + postComment | 内存态变更 + 可读回 |
| Mock: 自定义 seedTasks | 覆盖默认种子 |
| Mcp: 缺少 url | 抛明确错误 |
| Mcp: close() 未连接 | 安全 no-op |

### 3.5 当前骨架状态

- `TeambitionToolNames` 为占位接口——**从未真正跑过 listTools()**
- `TeambitionTaskRaw` 为 `Record<string, unknown>`——**字段映射未做**
- `updateStatus` 当前参数为 `(taskId, phase)`，但 Teambition 实际要求 4 步调用链（查任务→查任务类型→查工作流状态→改状态）
- 从 TW 原始负载到 `WorkTask` 的映射函数 `mapRawTwTaskToWorkTask()` 已存在于 `work-engine.ts`，但其字段名（`raw.id/title/type/priority/projectId`）是**猜测的候选字段，未经真实负荷验证**

---

## 4. 存储设计

### 4.1 目录结构（约定在 `~/.luxagents/`）

| 路径 | 格式 | 职责 | 备注 |
|---|---|---|---|
| `work-tasks.json` | `{version, counter, tasks[]}` | 任务索引 | 看板轻量数据源，CB-xxx 自增 |
| `work-tasks/{id}.jsonl` | 每行 `WorkAuditLogEntry` | 迁移审计日志 | 每次迁移追加一行，人类可读 |
| `work-checkpoints/{threadId}.json` | LangGraph checkpoint | 图执行状态 | 机器读，恢复续跑 |
| `work-telemetry.jsonl` | 每行 `WorkTelemetryEntry` | 遥测 | 两个采集点：THO 回传 + 节点迁移 |

### 4.2 任务编号规则

- **本地通道**：`CB-xxx`（自增编号，从 `work-tasks.json.counter` 读取）
- **TW 通道**：复用 Teambition 任务原始 ID（`displayId`）
- **内部 UUID**：所有任务 `id` 字段为 `crypto.randomUUID()`

### 4.3 三层持久化

| 层 | 人类可读 | 用途 |
|---|---|---|
| Checkpoint | ❌ | 图执行状态，恢复续跑用 |
| 审计日志 | ✅ | who/when/what/why，可回溯 |
| 任务索引 | ✅ | 看板轻量数据源 |

### 4.4 任务实体（WorkTask）关键字段

```typescript
interface WorkTask {
  id: string                    // 内部 UUID
  displayId: string             // CB-xxx 或 TW 任务 ID
  title: string
  description: string
  type: WorkTaskType            // requirement|bug|feature|task
  priority: WorkTaskPriority    // P1|P2|P3|P4
  phase: WorkPhase              // 九阶段状态机
  origin: WorkTaskOrigin        // 'tw' | 'local'
  externalLinks?: WorkExternalLink[]  // TW 通道时必有一条
  artifacts: WorkTaskArtifact[]
  agentSessionId?: string       // 关联编码会话
  workspaceId?: string
  docs?: { requirementDoc?, designDoc?, implDoc?, experienceDoc? }
  lastApproval?: WorkApprovalRecord
  retries: number
  failed?: boolean
  assigneeName?: string
  createdAt: number
  updatedAt: number
}
```

---

## 5. 已有集成设计范围裁决

### 5.1 核心裁决（2026-07-12-teambition-integration-spec.md §0）

来自 oss 调研三选项的方案②（新增独立能力，与 Work 模式并存），**部分采纳**：

| oss 能力 | 处置 | 理由 |
|---|---|---|
| **Project 实体**（工作区级分组，文件系统持久化） | **采纳** | 与 JSON/JSONL 规范兼容，对 Work 模式零侵入 |
| **Kanban 拖拽交互**（`@dnd-kit`） | **不采纳** | 与 Work 模式"状态由 LangGraph 驱动"哲学冲突 |
| **Task DAG + Conductor 引擎** | **不采纳** | LuxAgents 已有等价物（LangGraph.js + 九阶段状态机） |
| **Teambition 同步** | **采纳，走现有 TeambitionAdapter 插槽** | 填实骨架，不新建适配层 |

### 5.2 功能需求（FR-1 ~ FR-8）

| ID | 需求 | 优先级 |
|---|---|---|
| FR-1 | `listTools()` 首次配置 TW 时自动调用，展示给用户确认工具名映射 | P0 |
| FR-2 | `TeambitionTaskRaw → WorkTask` 字段映射函数，集中在一个函数 | P0 |
| FR-3 | `updateStatus` 实现官方 4 步调用链（查任务→查任务类型→查工作流状态→改状态） | P0 |
| FR-4 | MCP 写缺失→REST 兜底（appAccessToken 自签 JWT） | P1 |
| FR-5 | 企业域名/Token 走设置面板 + safeStorage 加密 | P0 |
| FR-6 | Project 实体最小实现（CRUD + 关联 + 过滤） | P1 |
| FR-7 | WorkPhase ↔ TW 工作流状态映射表可配置（项目级） | P0 |
| FR-8 | 遥测新增 TW 同步事件类型 | P1 |

### 5.3 WorkPhase ↔ Teambition 状态映射（9→3 多对一）

```typescript
interface WorkflowStatusMapping {
  twProjectId: string
  phaseToTwStatus: Record<WorkPhase, string>  // LuxAgents phase → TW taskflowstatusId
  twStatusToPhase?: Record<string, WorkPhase>  // 反向（M1 不实现）
}
```

### 5.4 分阶段交付

| 阶段 | 内容 |
|---|---|
| **阶段 0** | 本文档冻结 + UI 高保真原型评审 |
| **阶段 1** (P0) | 图引擎 + TW MCP adapter + THO + 看板 UI + 遥测 |
| **阶段 2** (P1) | Gerrit/Jenkins/自动化测试节点 + Skill 注入增强 + 授权边界强制 |
| **阶段 3+** (P2) | 图模板化 / 角色编排 / IM 遥控 / 夜间队列 / KPI 看板 / 技能沉淀飞轮 |
| **集成 Phase** | T1 工具探测 → T2 字段映射 → T3 工作流映射 → T4 updateStatus 实现 → T5 postComment → T6 凭据安全 → T7 错误处理 → T8 遥测扩展 → T9 Project 实体 → T10 契约测试 |

---

## 6. SDD 文档模板参考

### 6.1 Design Spec 15 字段骨架

源自 craft-agents-max 的 Design Spec 模板，适用于 LuxAgents 后续集成设计：

```
1.  目标（用户故事 + 明确"第一阶段不做"）
2.  官方能力结论（含官方文档引用，标注"未验证"）
3.  总体架构（分层图）
4.  集成边界（新增模块文件树 + 宿主侧最小改动）
5.  Gateway 接口（TS interface，契约先行）
6.  本地绑定与快照（数据模型 + 目录结构 + 唯一键）
7.  领取/交互流程（mermaid 图）
8.  同步策略（显式规则，禁止静默覆盖）
9.  凭据安全（Token 存储 + 日志脱敏）
10. 分阶段交付（阶段 0..N + 验收标准）
11. 错误处理（场景→处理方式映射表）
12. 测试策略（fake gateway/contract/idempotency/conflict/redaction）
13. 分支策略（fork/upstream 同步）
14. 明确不做清单
15. 设计结论
```

可选的 UI Amendment 补充文档（按需拆分，不强塞进主设计文档）。

### 6.2 Implementation Plan 模板

```
# Header: Goal / Architecture / Tech Stack / Global Constraints

## Task N: <组件名>
- Files: Create/Modify/Test 精确路径
- Interfaces: Consumes / Produces（精确类型签名）
- Step 1..N: 每步含完整代码/命令/期望输出
```

**硬性规则（No Placeholders）**：禁止 TBD/TODO/"add appropriate error handling"/"similar to Task N"。

### 6.3 四层文档 vs 三段式

| 层级 | 文件 | 产出者 |
|---|---|---|
| Design Spec（含需求） | `docs/superpowers/specs/*-design.md` | 产品/架构师 |
| Implementation Plan | `docs/superpowers/plans/*.md` | 架构师 |
| Task Brief | `.superpowers/sdd/task-N-brief.md` | 从 Plan 自动抽取 |
| Task Report | `.superpowers/sdd/task-N-report.md` | Implementer subagent |

### 6.4 自检清单（写 Plan 后必做）

- [ ] Spec 覆盖检查：spec 每一节都能对应到某个 Task
- [ ] 占位符扫描：无 TBD/TODO/"add appropriate error handling"
- [ ] 类型一致性：跨 Task 的函数名/类型名前后一致

---

## 引用文件清单（全部已读取）

| # | 文件 | 路径 |
|---|---|---|
| 1 | Work Mode 方案设计 | `docs/plans/2026-07-07-work-mode-design.md` |
| 2 | Work Mode 需求文档 | `docs/plans/2026-07-07-work-mode-requirements.md` |
| 3 | Work Mode Kanban 设计 | `docs/plans/2026-06-29-work-mode-kanban.md` |
| 4 | Teambition 集成设计 | `docs/plans/2026-07-12-teambition-integration-spec.md` |
| 5 | SDD 方法论调研 | `docs/plans/2026-07-12-sdd-methodology-research.md` |
| 6 | AGENTS.md | `/AGENTS.md` |
| 7 | CLAUDE.md | `/CLAUDE.md` |
| 8 | TeambitionAdapter 骨架 | `apps/electron/src/main/lib/teambition-adapter.ts` |
| 9 | TeambitionAdapter 测试 | `apps/electron/src/main/lib/teambition-adapter.test.ts` |
| 10 | WorkGraph 图定义 | `apps/electron/src/main/lib/work-graph.ts` |
| 11 | WorkEngine 编排 | `apps/electron/src/main/lib/work-engine.ts` |
| 12 | Work 类型定义 | `packages/shared/src/types/work.ts` |
