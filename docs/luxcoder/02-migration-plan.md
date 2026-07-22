# LuxCoder Migration Plan

> Derived from Proma (ErlichLiu/Proma)  
> Target: Enterprise AI R&D Workbench for Luxshare internal use

---

## 1. Proma 原始结构

```
proma-v2/
├── packages/
│   ├── shared/     # 共享类型、IPC 常量、配置、工具函数
│   ├── core/       # Provider Adapter、SSE、Shiki 高亮
│   └── ui/         # 共享 React UI 组件
└── apps/
    └── electron/   # Electron 桌面应用
        └── src/
            ├── main/       # Electron 主进程
            ├── renderer/
            │   └── atoms/  # Jotai 状态管理
            └── preload/    # contextBridge IPC 暴露
```

### 核心 Package

| Package | 版本 | 职责 |
|---|---|---|
| `@proma/electron` | 0.13.19 | Electron 桌面应用主体 |
| `@proma/shared` | 0.1.35 | 共享类型、IPC 常量、配置 |
| `@proma/core` | 0.2.11 | Provider Adapter、SSE、代码高亮 |
| `@proma/ui` | 0.1.9 | 共享 React UI 组件 |

### 本地数据目录（原 Proma）

```
~/.luxcoder/
├── conversations/
│   └── {conversation-id}.jsonl
├── agent-sessions.json
├── agent-sessions/
└── agent-workspaces/
    └── {workspace-slug}/
```

### 状态管理

- 渲染进程使用 Jotai 管理状态
- 关键 atoms 位于 `apps/electron/src/renderer/atoms/`
- Agent IPC 监听器在应用顶层全局挂载

---

## 2. LuxCoder 目标结构

```
luxcoder/
├── packages/
│   ├── shared/       # 改造：重命名 namespace，增加企业类型
│   ├── core/         # 改造：增加 Hermes provider（Phase 2）
│   ├── ui/           # 改造：LuxCoder 主题、三模式组件
│   └── connectors/   # 新增：Teambition、Git、RAG、spec-kit
└── apps/
    └── electron/
        └── src/
            ├── main/       # 改造：App 名称、数据目录、权限策略
            ├── renderer/
            │   ├── atoms/  # 改造：增加 WorkItem、Artifact atoms
            │   ├── modes/  # 新增：Chat / Code / Work 模式
            │   └── components/ # 改造：LuxCoder 组件库
            └── preload/    # 改造：增加 LuxCoder IPC channels
```

---

## 3. 迁移阶段总览

| 阶段 | 名称 | 分支 | 目标 | 预估周期 |
|---|---|---|---|---|---|
| Phase 0 | Baseline | `luxcoder/bootstrap` | 跑通 Proma，建立代码地图 | 1 周 |
| Phase 1a | Branding | `luxcoder/branding` | 品牌字符串 + 主题 + 数据目录 + 三模式 Tab + 完整品牌替换清单 | 1 周 |
| Phase 1b | Namespace | `luxcoder/namespace` | `@proma/*` → `@luxcoder/*` 包名替换（300+ import） | 1 周 |
| Phase 2 | Chat Mode | `luxcoder/chat` | Chat 模式保持现有 provider（anthropic），和 Agent 共用；后续 Phase 接入 Hermes | 1 周 |
| Phase 3 | Work Mode | `luxcoder/cowork` | TB API(MCP) + 六阶段看板 + 双向同步 + TaskOrchestrator | 4 周 |
| Phase 4 | Code Mode | `luxcoder/code` | Agent 模式重命名为 Code（不改功能），ModeSwitcher 标签替换 | 0.5 周 |
| Phase 5 | Enterprise | `luxcoder/enterprise` | SSO、RBAC、Model Gateway、审计、Cost Dashboard | 4 周 |

> **模式顺序**：Chat → Work → Code（与 Claude Desktop App 一致）
> **架构决策**：P2 Runtime Adapters 已取消。Hermes 作为 Agent SDK 的 provider 接入，部署在企业内网服务端，用户只需安装 LuxCoder。
> Phase 1 拆分原因：包名 namespace 替换影响 300+ 文件 import，与品牌字符串替换独立进行，降低单次 PR 风险。
> 术语统一：全项目使用「Claude Agent SDK」替代「Claude Code SDK」。

---

## 4. Phase 0：Baseline（当前阶段）

### 目标

确认 Proma 原版可以在本地稳定运行，建立 LuxCoder 改造基线。

### 任务清单

- [ ] `bun install` 成功
- [ ] `bun run dev` 成功启动 Electron 窗口
- [ ] Chat 模式可正常使用
- [ ] Agent 模式可正常使用
- [ ] Skills 配置可见
- [ ] MCP 配置可见
- [ ] Provider 配置可见
- [ ] 记录本地数据目录结构 `~/.luxcoder/`
- [ ] 完成 `00-baseline.md`
- [ ] 完成 `01-code-map.md`
- [ ] 建立 GitHub 仓库 LuxCoder
- [ ] 推送 `luxcoder/bootstrap` 分支

### 验收标准

Proma 原版可以正常运行，文档齐全，GitHub 仓库已建立。

---

## 5. Phase 1a：Branding（品牌 + 主题 + 数据目录）

### 目标

把 Proma 视觉上变成 LuxCoder，建立三模式 Tab 框架，迁移数据目录。不改核心功能，不改包名。

### 改造范围

#### 5.1 字符串替换

| 原 | 改 |
|---|---|
| `Proma` | `LuxCoder` |
| `proma` | `luxcoder` |
| `~/.luxcoder` | `~/.luxcoder` |
| `proma-file://` 协议注册 | `luxcoder-file://` |
| `ai.proma.app` / `com.proma.app` | `com.luxshare.luxcoder` |
| `.luxcoder-backup` / `.luxcoder-share` 文件扩展名 | `.luxcoder-backup` / `.luxcoder-share` |

> ⚠️ 注意：IPC channel 常量（`AGENT_IPC_CHANNELS` 等）的字符串值**无 `proma:` 前缀**，无需替换。真正需要替换的是 `proma-file://` 自定义协议（`apps/electron/src/main/index.ts:33`）。

#### 5.2 视觉主题

新增 CSS Variables（`apps/electron/src/renderer/styles/globals.css`）：

```css
--color-bg: #1A1612;
--color-surface-1: #231E19;
--color-surface-2: #2D2520;
--color-accent: #DA7756;
--color-success: #10b981;
--color-text-primary: #F4F1EC;
--color-text-secondary: #B8AEA4;
--color-border: #3A3029;
--font-code: 'JetBrains Mono', monospace;
```

#### 5.3 App Shell 改造

- [ ] 窗口标题：Proma → LuxCoder
- [ ] macOS traffic lights 保留
- [ ] 顶部新增三模式 Tab：Chat / Code / Work
- [ ] Sidebar logo 替换
- [ ] About 页面更新（`AboutSettings.tsx`）
- [ ] App icon 占位替换
- [ ] Splash 替换

#### 5.4 数据目录迁移

- [ ] 找到所有 `~/.luxcoder` 引用：`rg "\.proma" apps/ packages/`
- [ ] 统一改为 `~/.luxcoder`（修改 `config-paths.ts`）
- [ ] 在 `migration-service.ts` 实现首次启动自动迁移：`~/.luxcoder → ~/.luxcoder`
- [ ] 确认 `agent-sessions.json`、`conversations/`、`agent-workspaces/` 路径全部更新

### 任务清单

- [ ] 全局替换字符串 `Proma` / `proma`（品牌字符串，不含包名）
- [ ] 替换 `proma-file://` 协议注册 → `luxcoder-file://`
- [ ] 数据目录改为 `~/.luxcoder`（`config-paths.ts`）
- [ ] 在 `migration-service.ts` 实现 `~/.luxcoder → ~/.luxcoder` 迁移逻辑
- [ ] 新增 LuxCoder CSS 主题 tokens
- [ ] 顶部三模式 Tab 框架（暂时只是 UI，不切换功能）
- [ ] App icon 占位
- [ ] `shared/src/config/index.ts` 改 `APP_NAME = 'LuxCoder'`
- [ ] `electron-builder.yml` 改 `appId`、`productName`、文件扩展名
- [ ] 验证 `bun run dev` 仍然正常

### 验收标准

1. 启动后显示 LuxCoder，不再出现 Proma
2. 三模式 Tab 可见（功能暂为占位）
3. 原有 Chat / Agent 功能不受影响
4. 数据目录已切换，老数据自动迁移

---

## 6. Phase 1b：Package Namespace 替换

### 目标

将 `@proma/*` 包名全部替换为 `@luxcoder/*`，统一 monorepo namespace。

### 改造范围

| 原 | 改 |
|---|---|
| `@proma/electron` | `@luxcoder/electron` |
| `@proma/shared` | `@luxcoder/shared` |
| `@proma/core` | `@luxcoder/core` |
| `@proma/ui` | `@luxcoder/ui` |

### 任务清单

- [ ] 修改四个 `package.json` 的 `name` 字段
- [ ] 修改根 `package.json` workspaces 中的内部引用
- [ ] 全库替换所有 `import ... from '@proma/*'`（约 300+ 处）
- [ ] 更新 `tsconfig.json` 路径别名
- [ ] `bun install` 重新链接 workspace
- [ ] 验证 `bun run typecheck` 全部通过
- [ ] 验证 `bun run dev` 正常启动

### 验收标准

1. `bun run typecheck` 零报错
2. `rg "@proma/"` 返回零结果
3. 应用功能完整

---

## 7. Phase 2：Chat Mode

### 目标

将 Proma 原有 Chat 改造为 LuxCoder Chat 模式，底层接 HermesAdapter。

### 改造范围

```
apps/electron/src/renderer/
└── modes/
    └── chat/
        ├── ChatMode.tsx        # Chat 模式主容器
        ├── ChatSidebar.tsx     # 会话列表 + 知识包 chips
        ├── ChatMessages.tsx    # 消息气泡区域
        ├── ChatInput.tsx       # 输入框 + 附件 + 发送
        └── KnowledgeChips.tsx  # Skills / MCP / RAG chips
```

### HermesAdapter 实现

- [ ] 接入 Hermes Agent（本地或远程）
- [ ] 实现 memory 读写
- [ ] 实现 skills 注入
- [ ] 实现 RAG context 注入
- [ ] 实现 MCP tools 调用
- [ ] 流式消息渲染

### 任务清单

- [ ] 实现 `ChatMode.tsx`
- [ ] 实现 `ChatSidebar.tsx`（会话列表 + chips）
- [ ] 实现 `KnowledgeChips.tsx`（Skills/MCP/RAG 三色标签）
- [ ] 实现 `ChatMessages.tsx`（AI 头像用赭石橙 L 方块）
- [ ] 实现 `ChatInput.tsx`
- [ ] 接入真实 `HermesAdapter`
- [ ] 实现"转 Code"入口
- [ ] 实现"转 Work"入口

### 验收标准

1. Chat 模式可以正常对话
2. 可以选择知识包 chips
3. Hermes memory 跨会话有效
4. 消息流式渲染正常

---

## 8. Phase 3：Work Mode

### 目标

新建 Work 模式，接入 Teambition（MCP 协议），实现六阶段看板、任务双向同步。

### 预估周期：4 周

### 阶段看板

```
待处理 ──→ 方案设计 ──→ TB审核中 ──→ Coding ──→ Gerrit审核中 ──→ 已完成
  ↑           │            │            │            │
  │           └── 上传TB ──→│            │            │
  │                        │            │            │
  └──── TB驳回 ←───────────┘            │            │
                                        │            │
                           ┌── Gerrit驳回 ←──────────┘
                           │
                           └── +2 → 已完成
```

| 列 | 说明 | 审核方 | 驳回回退 |
|----|------|--------|----------|
| 待处理 | 自动拉取 TB 上责任人是我的任务 | - | - |
| 方案设计 | 研发撰写方案文档（AI 辅助填充模板） | - | - |
| TB 审核中 | 专家在 TB 上 review 方案文档 | 专家负责人 | → 方案设计 |
| Coding | Agent SDK 在 worktree 写代码 | - | - |
| Gerrit 审核中 | 代码提交 Gerrit，等待 Code Review | 专家/同事 | → Coding |
| 已完成 | 代码合入 + TB 归档 | - | - |

**两个审核门**：
1. **TB 审核** — 方案文档 review（内容对不对）
2. **Gerrit 审核** — 代码 review（实现对不对）

### TB MCP Tools

通过 MCP 协议对接 TB（阿里定制 URL）：
- `teambition.getMyTasks()` — 拉取我的任务
- `teambition.uploadAttachment()` — 上传方案文档
- `teambition.addComment()` — 贴方案摘要
- `teambition.updateCustomField()` — 写 status/spec_url
- `teambition.getTaskStatus()` — 轮询审核状态

### 改造范围

```
apps/electron/src/renderer/
└── modes/
    └── cowork/
        ├── WorkMode.tsx        # Work 模式主容器
        ├── WorkBoard.tsx       # 六阶段看板
        ├── WorkItemCard.tsx      # 任务卡片
        ├── WorkDetail.tsx      # 详情面板（方案文档/审核状态/Coding 进度）
        └── WritebackPanel.tsx    # TB 回写状态

packages/connectors/src/
└── teambition/
    ├── mcp-server.ts    # TB MCP Server（对接阿里定制 API）
    ├── sync.ts          # 任务拉取同步
    └── writeback.ts     # 回写（附件+评论+自定义字段）
```

### 任务清单

- [ ] 实现六阶段看板 UI（WorkBoard + WorkItemCard）
- [ ] 实现 TB MCP Server（对接阿里定制 URL）
- [ ] 实现任务拉取（按责任人过滤，自动进入待处理列）
- [ ] 实现方案文档模板 + AI 辅助生成
- [ ] 实现上传 TB（附件 + 评论区 Markdown + 自定义字段更新）
- [ ] 实现 TB 审核状态轮询（每 5 分钟）+ 驳回处理
- [ ] 实现 Coding 阶段启动（创建 worktree + Agent SDK 运行）
- [ ] 实现 Gerrit 提交 + Code Review 状态轮询
- [ ] 实现 Gerrit 驳回处理（回到 Coding 列 + 显示 review 意见）
- [ ] 实现完成回写（TB status + spec_url）

### 验收标准

1. 可以自动拉取 TB 上责任人是我的任务
2. 任务可以从待处理走到完成
3. 方案文档可上传 TB 并触发审核流程
4. 审核通过/驳回状态正确流转
5. AI 产物可以回写到 TB

---

## 9. Phase 4：Code Mode

### 目标

Code 模式暂与现有 Agent 模式保持一致。ModeSwitcher 中 "Agent" → "Code"，功能不变。后续再考虑改造。

### 改造范围

无。Agent 模式即 Code 模式。

### 任务清单

- [ ] ModeSwitcher 标签 "Agent" → "Code"
- [ ] 后续按需改造为 project-centric UI

---

## 10. Phase 5：Enterprise

### 目标

完成企业化能力，支持部门级推广。

### 改造范围

| 模块 | 内容 |
|---|---|
| SSO | 企业账号登录 |
| RBAC | 用户/团队/项目权限 |
| Model Gateway | 统一模型入口，替换本地 provider 配置 |
| Knowledge ACL | RAG 知识包权限过滤 |
| Audit Log | 中心化审计，append-only |
| Eval Service | Agent 执行质量评估 |
| Cost Service | Token 成本统计 |
| Admin Console | Skills/MCP/知识包管理 |
| Internal Update | 企业内部分发更新通道 |

### 任务清单

- [ ] 接入企业 SSO
- [ ] 实现 RBAC 策略引擎
- [ ] 实现 Model Gateway Client
- [ ] 实现 RAG ACL filter
- [ ] 实现中心化 Audit Log 上报
- [ ] 实现 Eval runner
- [ ] 实现 Cost dashboard
- [ ] 实现 Admin Console 页面
- [ ] 配置内部更新通道

### 验收标准

1. 支持多人使用，项目权限隔离
2. 所有关键操作有审计记录
3. 支持管理员配置 Skills/MCP/知识包
4. 支持成本和质量追踪

---

## 12. 关键改造文件索引

> 随着 Phase 0 代码地图完善，持续更新此表。

| 文件/目录 | 改造类型 | 所在阶段 |
|---|---|---|
| `apps/electron/package.json` | 重命名 app name / bundle ID | Phase 1a |
| `apps/electron/electron-builder.yml` | appId、productName、文件扩展名 | Phase 1a |
| `packages/shared/src/config/index.ts` | `APP_NAME` 常量 | Phase 1a |
| `apps/electron/src/main/lib/config-paths.ts` | `~/.luxcoder` → `~/.luxcoder` | Phase 1a |
| `apps/electron/src/main/lib/migration-service.ts` | 新增 proma→luxcoder 目录迁移 | Phase 1a |
| `apps/electron/src/main/index.ts` | 协议注册、窗口标题、菜单 | Phase 1a |
| `packages/*/package.json`（全部） | namespace `@proma/*` → `@luxcoder/*` | Phase 1b |
| `apps/electron/src/renderer/atoms/` | 新增 WorkItem / Artifact atoms | Phase 2 |
| `packages/shared/src/` | namespace 替换、新增企业类型 | Phase 1b |
| `packages/core/src/` | 新增 Hermes provider（扩 provider 注册表） | Phase 2 |
| `packages/ui/src/` | LuxCoder 主题 tokens | Phase 1a |
| `apps/electron/src/renderer/modes/` | 三模式 UI（全新） | Phase 2-4 |
| `packages/connectors/` | Teambition/Git/RAG（全新） | Phase 4 |

---

## 13. 不改造的部分

| 模块 | 原因 |
|---|---|
| Electron 桌面框架 | 已满足需求 |
| Bun monorepo 结构 | 保留，只改 namespace |
| Jotai 状态管理 | 保留，只增加新 atoms |
| Local-first 数据思路 | 保留，JSON/JSONL 为主，按需加 SQLite FTS5 |
| Skills 概念 | 保留，升级为 Enterprise Skills |
| Workspace 概念 | 保留，映射为 Project Workspace |
| `agent-orchestrator.ts` 核心逻辑 | 复用，不重写 |

---

## 14. 风险记录

| 风险 | 影响 | 应对 |
|---|---|---|
| `~/.luxcoder` 路径改名影响已有数据 | 用户数据丢失 | `migration-service.ts` 首次启动自动迁移 |
| Hermes 集成复杂度 | Chat MVP 延迟 | 先用 stub，再逐步接真实 Hermes |
| Claude Agent SDK 权限事件不完整 | 安全风险 | `PermissionBroker` 统一拦截（沿用现有 agent-permission-service） |
| Teambition API 权限受限 | Work 闭环受阻 | 先只读同步 + 手动回写 |
| 全局字符串替换遗漏 | 品牌不一致 | 用 `rg "proma\|Proma"` 验证 |
| Jotai atoms 命名冲突 | 状态异常 | 新增 atoms 统一加 `luxcoder` 前缀 |
| Phase 1b 包名替换引入构建错误 | 开发中断 | 单独分支，typecheck 通过后合并 |

---

## 15. 当前状态

- [x] Phase 0 进行中
- [ ] Phase 1a 待开始
- [ ] Phase 1b 待开始
- [ ] Phase 2（Chat）待开始
- [ ] Phase 3（Code）待开始
- [ ] Phase 4（Work）待开始
- [ ] Phase 5（Enterprise）待开始

---

## 16. 参考资源

- Proma 上游：https://github.com/ErlichLiu/Proma
- Claude Agent SDK TypeScript：https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk
- NousResearch Hermes Agent：https://github.com/NousResearch/hermes-agent
- Craft Agents Max（架构参考）：本地 `/Users/admin/Workspace/ClaudeCode/craft-agents-max`
