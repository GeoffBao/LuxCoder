# Work 模式方案文档

> 版本：v1.0（合流版）
> 日期：2026-07-07
> 前置：`docs/plans/2026-07-07-work-mode-requirements.md`
> 取代：`2026-06-29-work-mode-kanban.md` 的架构部分（其组件级实现任务在 Phase 3 按新 UI 稿修订后沿用）与《LuxBuddy Work 模式方案文档 v0.9》
> 技术栈：TypeScript / Bun / Electron / React / Jotai / `@anthropic-ai/claude-agent-sdk@0.3.185`

---

## 1. 总体架构

```
┌────────────────────── LuxAgents 客户端 (Electron) ──────────────────────┐
│                                                                          │
│  ┌─ Work 模式 (新增) ─────────────────┐    ┌─ Code 模式 (现有，零改动*) ─┐│
│  │ 看板 UI (renderer/components/work) │    │ AgentOrchestrator          ││
│  │ WorkEngine (main/lib)              │───▶│ agent-session-manager      ││
│  │ LangGraph.js 闭环图                 │THO │ claude-agent-adapter       ││
│  │ JsonFileCheckpointSaver            │    │ (*仅 AgentSessionMeta      ││
│  └──────────┬─────────────────────────┘    │  加 2 个可选打标字段)       ││
│             │                              └────────────────────────────┘│
└─────────────┼─────────────────────────────────────────────────────────────┘
              │
   ┌──────────▼──────────┐        ~/.luxagents/
   │ TeambitionAdapter    │        ├── work-tasks.json          (索引)
   │ MCP 程序化调用为主    │        ├── work-tasks/{id}.jsonl    (迁移审计日志)
   │ Mock 兜底 / REST 备选 │        ├── work-checkpoints/{threadId}.json
   └─────────────────────┘        └── work-telemetry.jsonl     (遥测)
```

分层原则：
- **执行层**（Code 模式）：复用现有 `AgentOrchestrator` 全部基础设施，同进程直接调用，不走 HTTP/CLI
- **契约层**：Work ↔ Code 之间只有 THO（§4）
- **编排层**：LangGraph.js StateGraph 承载闭环（§3）
- **适配层**：每个外部系统一个 adapter，接口统一（§6）
- **横切层**：遥测两个采集点汇聚（§8）

## 2. 关键技术决策与理由

| 决策 | 选择 | 理由 | 否决的备选 |
|---|---|---|---|
| 编排引擎 | LangGraph.js | interrupt/resume 原生支撑双审核 gate 与编码等待；条件边表达失败回环；`buildLooperGraph(moduleConfig)` 是 P2-1 图模板化的自然表达；M2 加节点不换引擎；纯 JS 无原生依赖，esbuild 可打包 | 纯函数 reducer（五节点时够用，但 M2 八节点两回环 + P2-1 模板化必然重写）；Temporal（过重，P2-7 再评估） |
| Checkpoint 存储 | 自写 `JsonFileCheckpointSaver` | 遵守项目"无本地数据库"规范；实现 `BaseCheckpointSaver` 约 150 行；单机 N≤6 人规模文件方案足够 | SqliteSaver（引入 better-sqlite3 违反项目规范）。**重新评估阈值**：P2-6 KPI 聚合变慢或 checkpoint 并发冲突 |
| TW 集成 | **MCP 优先**，程序化调用 | 用户已实测打通 TW user-mcp；消掉 REST 开放平台应用注册审批风险；同一 MCP server 复用于 Agent 会话内自主查询 | REST 直连（降级为回写兜底：仅当 MCP 写工具缺失时启用）；纯轮询 REST（授权流程重、时间不可控） |
| Code 模式接入 | 同进程直接调用 `AgentOrchestrator` | 原 LuxBuddy 方案的"opencode headless 三档接入"整体作废——本产品执行内核是 claude-agent-sdk，与 Work 引擎同进程 | HTTP/CLI 封装（无谓的进程边界） |
| Spec 生成载体 | M1: provider 适配器直连（chat-service 模式，无工具） | 便宜、快、无需仓库访问；文档质量靠 work-sdd 模板约束 | M2 升级为只读 Agent 会话（读 repo 上下文生成更准方案，P1-8） |
| 角色编排 | THO 预留 `context.roles`，M1 不实现 | SDK `options.agents` 原生支持（`AgentDefinition`：description/prompt/tools/model/skills）；`claude-agent-adapter.ts` 透传管线已存在但零调用方；契约先行避免返工 | M1 直接实现（无验证数据支撑角色划分，过早） |

## 3. 闭环编排（LangGraph.js）

### 3.1 图定义

九阶段状态机（需求文档 §2.1）映射为图节点；`thread_id = 任务 ID`（TW objectId 或本地 CB-xxx），天然幂等——同一任务重复触发命中同一 thread 从 checkpoint 续跑。

```
fetch_task → gen_req_doc → [interrupt: req 审核] → gen_design_doc → [interrupt: design 审核]
                ▲驳回──────────┘          ▲驳回──────────┘
   → coding(THO) → [interrupt: 等会话完成事件] → gerrit_cr(M2) → auto_test(M2) → writeup → report/回写
        ▲失败且 retries<N ──────────────────────────────┘
```

- **两类 interrupt**：人工 gate（req/design 审核、Gerrit CR）与事件等待（编码会话完成、Jenkins 构建完成）。UI 操作或事件回调通过 `Command({ resume })` 恢复图执行
- **条件边**：审核出边按批准/驳回分叉；测试出边按 通过 / 失败且 retries<N / 失败且 retries≥N 三分叉
- **Bug/Task 捷径**：图构建时按任务类型裁剪节点（`buildLooperGraph` 输入含 taskType）
- **手动迁移**：详情面板流转按钮 = 直接向图发送对应 resume/事件，人与自动化走同一条边，状态永不分叉
- **节点幂等**：coding 节点 resume 重入时先查 `agentSessionId` 是否已存在/已完成——对账而非重跑

### 3.2 `buildLooperGraph(moduleConfig)`

M1 一份写死 default 配置，函数签名先立住（P2-1 图模板化不返工的关键，成本≈0）：

```ts
interface ModuleConfig {
  taskType: WorkTaskType
  maxRetries: number            // 默认 3
  skills?: string[]             // M1 取工作区当前生效 skills
  knowledgeRefs?: string[]      // P2
  roles?: string[]              // P2-2 角色编排
}
```

### 3.3 持久化三层

| 层 | 路径 | 职责 |
|---|---|---|
| Checkpoint | `~/.luxagents/work-checkpoints/{threadId}.json` | 图执行状态，恢复续跑用（机器读） |
| 审计日志 | `~/.luxagents/work-tasks/{id}.jsonl` | 每次迁移追加一行（人类可读，who/when/what/why） |
| 任务索引 | `~/.luxagents/work-tasks.json` | 看板轻量数据源 `{ version, counter, tasks[] }`，CB-xxx 自增 |

## 4. Task Handoff Object（THO）v1.0 — 系统唯一契约

```jsonc
// ---- 下发 (Work → Code 模式) ----
{
  "tho_version": "1.0",
  "task": {
    "id": "TW-<objectId> | CB-xxx",
    "title": "…",
    "type": "requirement|bug|feature|task",
    "repo": { "workspaceId": "…", "branch": "feature/…", "authorized_paths": ["src/…"] },  // M1 记录，M2 强制
    "spec": {
      "requirement_doc": ".luxagents-tasks/{id}/requirements.md",
      "design_doc": ".luxagents-tasks/{id}/design.md",     // 已过审批 gate 的版本
      "acceptance": ["…"]
    },
    "context": {
      "skills": ["work-sdd", "…"],          // M1: 工作区生效 skills 清单
      "knowledge_refs": [],                  // P2
      "roles": []                            // P2-2 预留：角色编排，对应 SDK options.agents
    },
    "constraints": { "model_tier": "standard|flagship", "token_budget": 200000 }
  }
}

// ---- 回传 (Code → Work 模式) ----
{
  "tho_version": "1.0",
  "task_id": "…",
  "status": "success | failed | partial",
  "outputs": {
    "commits": [{ "sha": "…", "message": "…" }],
    "changed_files": ["…"],
    "test_scripts": ["…"],
    "impl_doc": ".luxagents-tasks/{id}/implementation.md",
    "failure": { "stage": "build|unit|lint", "log_ref": "…", "summary": "…" }
  },
  "telemetry": {                              // 必填段，不可裁剪
    "duration_ms": 0,
    "tokens": { "prompt": 0, "completion": 0, "by_model": {} },
    "skills_loaded": [], "skills_referenced": [],
    "tool_calls": 0, "retries": 0
  }
}
```

- `tho-assembler.ts` 是唯一"懂两边"的模块：THO → systemPrompt/prompt 组装（含 work-sdd 模板、spec 文档内容、skills 清单），golden file 单测重点对象
- 版本策略：加字段向后兼容，删改字段升 major

## 5. Code 模式集成（方案 C：复用 + 打标）

- `AgentSessionMeta` 新增可选字段：`origin?: 'work'`、`workTaskId?: string`
- 编码节点调用 `AgentOrchestrator.startSession()`，会话走现有全部基础设施（持久化/流式/权限/工具展示）
- Code 模式会话列表**默认过滤** `origin:'work'` 会话（可切"显示全部"）
- Work 详情面板"执行日志"标签内嵌现有 `AgentMessages` 组件，通过 `workTaskId → agentSessionId` 反查实时展示
- 会话完成回调（现有 done/error 事件）→ WorkEngine → 图 resume

## 6. 适配层与 WorkEngine

```ts
interface TeambitionAdapter {
  listTools(): Promise<ToolDescriptor[]>          // 首任务：枚举 user-mcp 工具确认读写覆盖面
  fetchTasks(projectId: string): Promise<TWTask[]>
  fetchTaskDetail(taskId: string): Promise<TWTask>
  updateStatus(taskId: string, phase: WorkPhase): Promise<void>   // 写能力缺失时抛 NotSupported
  postComment(taskId: string, text: string): Promise<void>
}
```

实现：`McpTeambitionAdapter`（`@modelcontextprotocol/sdk` client 程序化调用，鉴权复用已验证 token）+ `MockTeambitionAdapter`（本地 JSON 种子任务，开发/演示/测试兜底）。

**WorkEngine**（`main/lib/work-engine.ts`）职责：
- 事件统一入口：TW 轮询定时器 / 审批与流转 IPC / Agent 会话完成回调 → 图 invoke/resume
- 并行编码会话上限（默认 2，可配）
- 启动对账：遍历非终态 thread，核对挂起 interrupt 与 `agentSessionId` 实际终态，漂移则按会话事实修正
- 状态变更 → `webContents.send`（`WORK_IPC_CHANNELS`，四文件同步模式）

## 7. UI 设计规格（要点，详见 Phase 0 高保真原型）

设计基准：Linear 信息密度与键盘效率 + WorkBuddy 多 Agent 并行可视化 + craft-agents 收件箱审批范式。

- **待我处理聚合带**（永远置顶，空时收起）：审批请求（红）/ 失败任务（橙）/ 停留超时（黄），点击直达操作
- **看板列**：待办（含 5 子阶段徽标）/ 编码中 / 待回写 / 归档入口；**列不可拖拽**——状态由状态机驱动，人只有预定义动作
- **卡片**：CB-xxx 编号 + 类型角标（需求蓝/Feature紫/Bug红/Task灰）+ 子阶段标签 + 优先级 + **实时活动波形**（agent 工具调用跳动）+ 当前动作一行字
- **详情面板（380px overlay）**：九阶段 stepper（失败回环画回退弧标 retries n/N）→ 审批置顶横幅（非弹窗，驳回必填意见）→ 状态流转按钮 → 产出物区（文档生成状态/查看/标记已上传）→ 执行日志（内嵌 AgentMessages）→ 遥测页（节点耗时条形/token/skills 引用）→ 描述
- **左侧工作区栏**：全部任务 + 各工作区计数过滤（沿用 v1.2 设计）
- **键盘**：J/K 卡片移动、Enter 详情、A 批准当前审批项、Cmd+K 命令面板
- **空状态**：三步引导卡（连 TW → 选项目 → 领第一个任务）
- 暗/亮双主题；状态语义色 token 一套贯穿列头/徽标/stepper/波形；卡片+阴影不用边框

## 8. 遥测

采集点只有两处（避免埋点散落）：THO 回传、图节点迁移。追加写 `~/.luxagents/work-telemetry.jsonl`，字段第一天全量：任务 ID/来源(tw|local)/节点/耗时/token 分模型/skills_loaded/skills_referenced/tool_calls/retries/审批人与耗时与驳回意见/终态。本地通道任务打 `origin:'local'` 标，KPI 聚合时排除。

## 9. work-sdd 默认 Skill

沿用 v1.2 设计：`apps/electron/default-skills/work-sdd/`（SKILL.md + req-template.md + design-template.md + experience-template.md），遵守 default-skills 版本契约（改动必须递增 SKILL.md frontmatter version）。Spec 生成与 THO 组装均引用其模板。

## 10. 安全与权限

- Code 子会话工作目录限定 THO.repo.authorized_paths（M1 记录，M2 强制）
- TW token 存客户端安全存储（safeStorage AES-256-GCM，复用 channel-manager 模式），不进图状态、不进遥测
- 审批操作人取客户端登录态（user-profile），写入图状态，agent 不可伪造

## 11. 测试策略

- THO 组装器：golden file 单测（THO 输入 → 期望 prompt / 输出解析）
- 图级测试：mock 各节点与 adapter，覆盖双审核驳回回路、失败重试回路、重试上限落 failed、kill 进程后 checkpoint resume、启动对账修正漂移
- `JsonFileCheckpointSaver`：读写/并发/损坏文件容错单测
- 端到端：一条真实 TW 测试项目任务跑通 M1 闭环（验收用例）

## 12. 迭代计划

| 阶段 | 内容 | 换挡信号 |
|---|---|---|
| M0 | 本文档冻结 + UI 高保真原型评审 | 用户批准 |
| M1（2–3 周） | 图引擎 + TW MCP adapter + THO + 看板 UI + 遥测 | 闭环 demo 通过 |
| M2（3–4 周） | Gerrit/Jenkins/自动化测试节点 + Skill 注入增强 + 授权边界强制 | 单模块日常任务跑闭环 |
| M3+ | 图模板化 / 角色编排 / IM 遥控 / 夜间队列 / KPI 看板 / 技能沉淀飞轮 | 按 M2 反馈排序 |
