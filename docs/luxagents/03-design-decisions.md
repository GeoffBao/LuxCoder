# LuxAgents Design Decisions

> Date: 2026-06-28
> 记录架构决策，供后续开发参考。

---

## Decision 1: 统一术语 — Claude Agent SDK

**背景**：方案文档中多处使用「Claude Code SDK」，但 Anthropic 不存在这个产品。

**决策**：全项目统一使用「Claude Agent SDK」指代 `@anthropic-ai/claude-agent-sdk`。

| 错误术语 | 正确术语 | 产品形态 |
|----------|----------|----------|
| Claude Code SDK | Claude Agent SDK | Node.js 库，程序化调用 |
| Claude Code | Claude Code CLI | 终端命令行工具 |
| - | Claude API | HTTP API，无 agent loop |

**影响**：方案文档、代码注释、变量名全部统一。

---

## Decision 2 (Updated): Hermes 作为 Agent SDK 的 Provider

**背景**：Chat 模式需要接 Hermes Agent。

**决策**：Hermes 作为 Claude Agent SDK 的 model provider 接入。不改 agent loop。

**Phase 1**：Chat 模式保持现有 provider（anthropic = Claude），和 Code 模式共用。
**Phase 2**：新增 `hermes-adapter.ts`，注册到 provider 表，用户在 Settings 切换。

**Hermes 部署**：
- 模式 A（企业）：企业内网部署一台 Hermes Server，100 人共享，HTTP 接入
- 模式 B（开发）：本地运行 Hermes Agent，localhost:8262

**实现**：
```typescript
// packages/core/src/providers/hermes-adapter.ts
// 实现 ModelProvider 接口
// chat(messages, tools, options) → AsyncIterable<StreamEvent>
// HTTP POST → Hermes /v1/chat → SSE stream → StreamEvent
```

```
Claude Agent SDK（唯一引擎）
    ├── provider: anthropic → Code 模式（默认）
    ├── provider: hermes    → Chat 模式（Phase 2）
    └── provider: deepseek  → 备选
```

---

## Decision 3 (Updated): Code 模式先不改

**背景**：Code 模式是什么？和现有 Agent 模式什么关系？

**最新决策**：Code 模式先不改，保持与现有 Agent 模式一致。ModeSwitcher 中 "Agent" → "Code"。后续再考虑改造为 project-centric 工程视图。

**Phase 4 内容**：
- ModeSwitcher 标签替换
- 功能完全不变
- 0.5 周

---

## Decision 4: 模式顺序 = Chat → Work → Code

**背景**：三个模式在 UI 中的排列顺序。

**决策**：Chat → Work → Code。与 Claude Desktop App 模式结构一致（对话 → 协同 → 执行）。

---

## Decision 5: Hermes 部署方案

**背景**：如果 Hermes 作为 provider，其他用户安装 LuxAgents 时是否需要额外安装 Hermes？

**决策**：不需要。Hermes 部署在企业内网服务端，LuxAgents 通过 Claude Agent SDK 的 hermes provider（HTTP endpoint）连接。用户只需安装 LuxAgents 一个应用。

```
LuxAgents (客户端) → Agent SDK → provider: "hermes" → Hermes Server (企业内网)
```

---

## Decision 6: TB 集成 — MCP 协议

**背景**：阿里给了定制 URL，Teambition 有 Open API。

**决策**：通过 MCP 协议对接 TB（teambition-mcp-server），与现有 MCP 体系统一。

**MCP Tools**：
- `teambition.getMyTasks()` — 拉取责任人是我的任务
- `teambition.uploadAttachment()` — 上传方案文档
- `teambition.addComment()` — 贴方案摘要
- `teambition.updateCustomField()` — 写 status/spec_url
- `teambition.getTaskStatus()` — 轮询审核状态

**审核状态同步**：定时轮询（每 5 分钟）+ 手动刷新。不用 webhook。

---

## Decision 7: Work 六阶段看板

**决策**：六阶段 = 待处理 → 方案设计 → TB审核中 → Coding → Gerrit审核中 → 已完成

| 列 | 说明 | 审核方 | 驳回回退 |
|----|------|--------|----------|
| 待处理 | 自动拉取 TB 上责任人是我的任务 | - | - |
| 方案设计 | 研发撰写方案文档（AI 辅助填充模板） | - | - |
| TB 审核中 | 专家在 TB 上 review 方案文档 | 专家负责人 | → 方案设计 |
| Coding | Agent SDK 在 worktree 写代码 | - | - |
| Gerrit 审核中 | 代码提交 Gerrit，等待 Code Review | 专家/同事 | → Coding |
| 已完成 | 代码合入 + TB 归档 | - | - |

**两个审核门**：
1. TB 审核 — 方案文档 review（内容对不对）
2. Gerrit 审核 — 代码 review（实现对不对）

**方案文档模板（植入 LuxAgents，上传 TB 存档）**：
- 问题描述
- 根因分析
- 方案对比
- 实施计划
- 测试计划

**任务类型分流**：
- 需求 → 必须走完整六阶段（含方案设计 + TB 审核）
- Bug/简单任务 → 跳过方案设计 + TB审核，直接从「待处理」进「Coding」

**Bug 跳过方案设计时**：提交 Gerrit 时附带最小化 fix description（非完整方案文档），供 Code Review 参考。

**看板视图**：个人视图（只显示责任人是自己的任务）。

**MVP 实现状态（2026-06-29，feature/work-mode-kanban 分支）：**
- ✅ `WorkTask` 独立实体（六阶段状态机 + 任务类型分流）
- ✅ 本地 JSON 持久化（`~/.luxagents/work-tasks.json`）
- ✅ 全屏分屏视图（左：任务列表按状态分组 + 右：任务详情）
- ✅ 内嵌 AgentView（任务进入 coding 阶段时显示 Agent 对话）
- ✅ 状态流转按钮（基于类型决定允许的下一步）
- ⏳ TB API 集成（自动拉取 TB 任务，Phase 2）
- ⏳ Gerrit 集成（Phase 2）
- ⏳ 方案文档模板（Phase 2）

详见实现计划：`docs/plans/2026-06-29-work-mode-kanban.md`

---

## Decision 8: 去掉 P2 Runtime Adapters

**背景**：方案文档 P2 是「Runtime Adapters — 建立 AgentRuntime 接口、HermesAdapter stub、ClaudeCodeAdapter stub」。

**决策**：去掉 P2，因为 adapter 模式已存在（`claude-agent-adapter.ts`），Hermes provider 直接在 P3 扩 provider 注册表实现。

**新阶段划分**：
```
P0 Baseline     (1w) → 跑通 Proma，代码地图
P1a Branding    (1w) → 品牌替换 + 主题 + 数据目录 + 三模式 Tab
P1b Namespace   (1w) → @proma/* → @luxagents/* 包名替换
P3  Chat Mode   (2w) → Hermes provider + Chat UI + chips
P4  Code Mode   (3w) → Agent 模式重构为工程视图 + log stream + diff
P4  Work Mode (4w) → TB API(MCP) + 六阶段看板 + 双向同步 + TaskOrchestrator
P6  Enterprise  (4w) → SSO/RBAC/审计/Cost
```

---

## Decision 12: RAG 知识库设计

**背景**：Agent 执行任务时需要注入相关知识（Chip docs、历史 RCA、代码规范）。

**决策**：项目级知识库，本地 FTS5 索引，ACL 控制在 Phase 5 实现。

**知识来源**：
- Chip 参考手册 / ISP 调优指南
- 历史 RCA 根因分析报告
- 代码模式 / 常见 bug fix 模板
- 个人 Wiki（Wiki/concepts/、Wiki/sources/）

**技术路线**：
- 文档切片存储为 JSONL
- FTS5 全文索引（参考 craft-agents-max）
- Agent 执行前按任务描述 + 模块名检索 top-K
- 检索结果注入 Agent system prompt

---

## Decision 13: 文档模板库

**背景**：Work 模式需要文档模板供研发选择使用。

**决策**：模板植入 LuxAgents，分三层共享。

```
内置模板（打包）  → 方案设计文档 / RCA 报告 / Bug Fix 说明 / 测试报告
项目模板（Git）   → .luxagents/templates/ 目录，git clone 即得
个人模板（本地）  → 用户自建
```

**工作流**：选模板 → AI 根据 TB 任务自动填充草稿 → 人确认 → 导出上传 TB。

**MVP 方式**：Git 驱动共享（方式 A），零额外服务器依赖。

---

## Decision 14: 企业数据分层

**决策**：三层架构 — 个人（本地）/ 项目（Git/共享目录）/ 企业（Server）。

| 数据 | 层级 | 共享方式 |
|------|------|----------|
| Chat 历史 / 配置 | 👤 个人 | 本地存储，不上传 |
| 看板状态 | 👤 个人 | 本地，TB 同步 |
| Skills / 模板 / RAG 知识 | 📁 项目 | Git repo `.luxagents/` |
| MCP 配置 / Provider 密钥 | 👤 个人 | 本地加密 |
| 方案文档 / RCA 报告 | 📁 项目 | TB 附件归档 |
| SSO / 审计 / 成本 | 🌐 企业 | 企业 Server（Phase 5） |

**共享原则**：MVP 阶段全走 Git + TB，Phase 5 再加企业 Server。

---

## Decision 15: 存储方案 — JSON/JSONL 为主，SQLite FTS5 为辅

**背景**：方案文档提到「MVP 用 JSON/JSONL → SQLite」，但 CLAUDE.md 规定「不采用本地数据库方案」。

**决策**：参考 craft-agents-max 的混合方案。

| 数据类型 | 存储 | 说明 |
|----------|------|------|
| 会话/对话消息 | JSONL | 不改，流式追加天然适合 |
| 配置/用户/记忆 | JSON + Markdown | 不改 |
| Work 看板数据 | JSON/JSONL | MVP 阶段 |
| 全文搜索 | SQLite FTS5 | 后续按需加入，参考 craft-agents-max `memory-index/` |

**原则**：MVP 阶段零数据库依赖，JSON/JSONL 够用。需要全文搜索或复杂查询时再加 FTS5。

---

## Decision 16: Permission Broker 沿用现有

**背景**：方案文档提到 4-tier Permission Broker（low/medium/high/critical）。

**决策**：沿用现有 `agent-permission-service.ts`，如果已支持 4-tier 就直接用，不足则扩。

**不做**：不新写 Permission Broker。

---

## Decision 18: spec-kit 集成

**背景**：GitHub spec-kit 是 spec-driven development 的开源工具集（specify → plan → implement → verify）。

**决策**：spec-kit 作为 MCP tool 嵌入 Agent SDK，驱动 Work 的方案设计和编码阶段。

**工作流映射**：
```
方案设计 → /specify (生成 spec.md) + /plan (生成 plan.md) → 上传 TB 审核
编码中   → /implement (Agent 按 plan 逐任务写代码)
```

**定制**：Camera BSP 专用模板替换 spec-kit 默认模板（问题描述/根因分析/方案对比/实施计划/测试计划）

**产物归档**：`.luxagents/specs/{task-id}/spec.md` + `plan.md`，同时上传 TB 附件。
