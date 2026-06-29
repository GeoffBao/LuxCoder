# Work 模式需求文档

> 版本：v1.2
> 日期：2026-06-29
> 状态：设计确认，待实现
> 关联方案：`docs/plans/2026-06-29-work-mode-kanban.md`

---

## 1. 背景与目标

### 1.1 背景

LuxAgents 当前有 Chat / Agent / Scratch 三个模式。Work 模式（`cowork`）目前是空壳，需要改造为支持研发工程师日常工作流的协同看板。

目标用户：嵌入式 / 芯片领域的研发工程师，日常工作流程包括：
- 从 Teambition 接收需求 / Bug 任务
- 撰写需求文档、方案设计文档 → 专家 TB 审核 → 开始编码
- 提交 Gerrit Code Review → 合入代码
- 将经验文档回写到 Teambition 归档

### 1.2 核心目标

将 Work 模式打造为 **SDD 工作流脚手架**：让工程师在一个界面内管理任务全生命周期，每个阶段都有对应的 AI 辅助能力（MVP 阶段先可视化，Phase 2 再串联 AI 执行）。

### 1.3 语言

MVP 阶段所有 UI 文案使用中文，不引入 i18n 框架。国际化作为独立迭代后续统一处理。

---

## 2. 核心设计哲学 — Spec-Driven Development（SDD）

### 2.1 什么是 SDD

SDD 的核心思想：**先写规格（Spec），再让 AI 写代码**。

传统 AI 编程是把需求直接扔给 AI，让它"猜"你想要什么；SDD 是让 AI 先产出一份结构化的规格文档（包含为什么做、做什么、怎么做、任务列表），人类审查对齐后，AI 再按图索骥实现。

### 2.2 SDD 流程

```
specify → plan → implement → verify
```

| SDD 步骤 | 含义 | LuxAgents 技能 |
|---------|------|--------------|
| specify | 探索需求，产出需求文档草稿 | `/brainstorming` |
| plan | 生成详细实施计划 | `/writing-plans` |
| implement | 逐任务执行 | `/executing-plans`（Agent 模式） |
| verify | 验证实现是否符合需求 | `/code-review` |

### 2.3 SDD 在状态机中的映射

| Work 阶段 | SDD 对应 | 工具 / 技能 | 审核方 |
|----------|---------|-----------|-------|
| `pending` | 需求到来 | - | - |
| `req-writing` | **specify**：撰写需求文档 | `/brainstorming` + Agent 协同 | - |
| `req-reviewing` | 需求文档 TB 审核 | 上传 TB，等专家 review | TB 专家负责人 |
| `design-writing` | **plan**：撰写方案设计文档 | `/writing-plans` + Agent 协同 | - |
| `design-reviewing` | 方案设计 TB 审核 | 上传 TB，等专家 review | TB 专家负责人 |
| `coding` | **implement**：按 plan 写代码 | `/executing-plans`，Agent 执行 | - |
| `gerrit-reviewing` | **verify**：代码 Review | `/code-review` + Gerrit CR | 专家 / 同事 |
| `pending-writeup` | 经验归档 | 撰写经验文档，回写 TB | - |

> **MVP 做的是把这个工作流可视化**——工程师知道自己在哪个阶段、下一步该做什么。Phase 2 再把各阶段的 AI 执行能力和 TB 自动同步串起来。

---

## 3. 功能范围

### 3.1 MVP 范围（本次实现）

- ✅ 三列 Kanban 看板（待办 / 进行中 / 待回写）
- ✅ 左侧工作区导航（方案 B：工作区列表 + 任务统计）
- ✅ 任务卡片（编号 / 类型 / 优先级 / AI 状态指示）
- ✅ 右侧详情面板（滑入 overlay，380px）
  - ✅ 阶段进度条（全流程可视化）
  - ✅ 状态流转按钮（正向推进 + 驳回回退）
  - ✅ 产出物区域（文档生成状态 + 前往 Agent 执行入口）
- ✅ 九阶段状态机 + 任务类型分流
- ✅ 新建任务 Dialog
- ✅ 已完成 / 已取消归档视图
- ✅ 本地 JSON 持久化（`~/.luxagents/work-tasks.json`）
- ✅ KanbanHeader（统计 + 新建按钮 + TB 连接状态灰显占位）
- ✅ work-sdd 默认 Skill（需求文档 / 方案设计模板）

### 3.2 Phase 2 范围（本次不做）

- ⏳ TB MCP 自动拉取任务
- ⏳ TB 自动上传产出物文档
- ⏳ TB 审核状态自动轮询推进状态
- ⏳ SPEC-KIT 进度条（rca / implement / verify / test 四步）
- ⏳ Sub-task checklist（手动）
- ⏳ plan.md 解析自动填充子任务
- ⏳ TB 子任务同步
- ⏳ RAG 知识库 chip 配置
- ⏳ 空状态引导（无工作区时的新建引导）
- ⏳ 描述字段 inline 编辑
- ⏳ Jira / Linear / GitHub Issues 等其他外部系统接入
- ⏳ 国际化（i18n）

---

## 4. 用户故事

```
作为研发工程师，
我想在 Work 模式看到自己当前所有任务的阶段分布，
以便快速了解工作全局状态。

作为研发工程师，
我想手动创建任务并将其归属到某个工作区（代码项目），
以便在没有 TB 同步时也能使用看板。

作为研发工程师，
我想在任务详情面板里看到完整的阶段流转进度条，
以便清晰知道当前处于哪一步、还剩哪些步骤。

作为研发工程师，
我想点击"前往 Agent 执行"按钮，自动切换到 Agent 模式
并预填任务上下文，以便快速开始 AI 协同撰写文档。

作为研发工程师，
我想在详情面板看到需求文档 / 方案文档是否已生成，
以便知道是否可以提交 TB 审核。

作为研发工程师，
我想通过左侧工作区列表切换只看某个项目的任务，
以便专注于当前项目。
```

---

## 5. 数据模型

### 5.1 WorkTask 实体

```typescript
interface WorkTask {
  id: string                   // UUID
  taskId: string               // CB-001 格式，全局自增
  title: string
  description: string          // Markdown（MVP 只读展示）
  type: WorkTaskType           // requirement | bug | feature | task
  priority: WorkTaskPriority   // P1 | P2 | P3 | P4
  status: WorkTaskStatus       // 见 §5.2

  // 外部系统链接（泛化，支持 TB / Jira / Linear 等）
  externalLinks?: ExternalLink[]

  // 产出物（见 §5.5）
  artifacts?: WorkTaskArtifact[]

  // 关联本地资源
  agentSessionId?: string      // 最近一次关联的 Agent 会话
  workspaceId?: string         // 关联的 AgentWorkspace

  // Phase 2 字段（存储但 MVP 不在 UI 展示）
  specKitSteps?: SpecKitStep[]
  injectedSkills?: string[]    // MCP server 名称列表
  injectedRag?: string[]       // MCP server 名称列表
  domainTags?: string[]

  assigneeName?: string
  createdAt: number
  updatedAt: number
}

interface ExternalLink {
  system: 'teambition' | 'jira' | 'linear' | 'github' | string
  projectId: string
  taskId: string
  url?: string
}
```

### 5.2 九阶段状态机

**需求 / Feature 类型（完整流程）：**

```
pending
  → req-writing        需求文档撰写（Agent 协同）
    → req-reviewing    需求文档 TB 审核中
      ↓ 通过                ↓ 驳回 → 退回 req-writing
  → design-writing     方案设计撰写（Agent 协同）
    → design-reviewing 方案设计 TB 审核中
      ↓ 通过                ↓ 驳回 → 退回 design-writing
  → coding             编码（Agent 执行）
    → gerrit-reviewing Gerrit CR
      ↓ 通过                ↓ 驳回 → 退回 coding
  → pending-writeup    撰写经验文档，回写 TB
    → completed        已完成
```

**Bug / Task 类型（跳过文档撰写和审核）：**

```
pending → coding → gerrit-reviewing → pending-writeup → completed
```

**终态**（不在看板展示，进入归档视图）：`completed`、`cancelled`

**看板列映射：**

| 看板列 | 包含状态 | 指示色 |
|-------|---------|-------|
| 待办 | pending, req-writing, req-reviewing, design-writing, design-reviewing | 灰色圆点 |
| 进行中 | coding | 橙色圆点 |
| 待回写 | gerrit-reviewing, pending-writeup | 紫色圆点 |

**状态流转按钮（详情面板，动态渲染）：**

| 当前状态 | 正向按钮 | 驳回 / 回退按钮 |
|---------|---------|--------------|
| pending（req/feature） | 开始撰写需求文档 → | - |
| pending（bug/task） | 开始编码 → | - |
| req-writing | 提交 TB 审核 → | - |
| req-reviewing | 审核通过，开始方案设计 → | ← 驳回，退回修改 |
| design-writing | 提交 TB 审核 → | - |
| design-reviewing | 审核通过，开始编码 → | ← 驳回，退回修改 |
| coding | 提交 Gerrit → | - |
| gerrit-reviewing | 合入完成，待回写 → | ← 驳回，退回修改 |
| pending-writeup | 标记完成 ✓ | - |

### 5.3 AgentWorkspace 扩展字段

在现有 `AgentWorkspace` 类型追加（Phase 2 使用，MVP 存储不必填）：

```typescript
interface ProjectMapping {
  mcpServerName: string   // 对应 workspace mcp.json 中的 key
  projectId: string       // 该外部系统中的项目 ID
}

// AgentWorkspace 追加
projectMappings?: ProjectMapping[]
```

### 5.4 持久化

```
~/.luxagents/
└── work-tasks.json     # { version, counter, tasks[] }
```

全量 JSON，任务数 < 200 完全够用，无需数据库。`counter` 用于生成 CB-xxx 全局自增编号（不区分工作区，不复用已用编号）。

### 5.5 产出物结构

每个 WorkTask 在工作区 cwd 下有专属任务目录：

```
{workspace.cwd}/
└── .luxagents-tasks/
    └── CB-001/
        ├── requirements.md    ← 需求文档（req-writing 阶段产出）
        ├── design.md          ← 方案设计文档（design-writing 阶段产出）
        └── experience.md      ← 经验总结文档（pending-writeup 阶段产出）
```

WorkTask `artifacts` 字段记录产出物引用：

```typescript
interface WorkTaskArtifact {
  type: 'req-doc' | 'design-doc' | 'experience-doc'
  /** 相对于 workspace.cwd 的路径 */
  path: string
  createdAt: number
  tbUploaded: boolean          // 是否已手动上传 TB（MVP 手动标记）
  tbAttachmentId?: string      // Phase 2：TB 附件 ID
}
```

---

## 6. UI 设计规格

### 6.1 整体布局

```
┌──────────────────────────────────────────────────────────────────┐
│ [ModeSwitcher]  [左侧工作区栏 ~200px]  [KanbanView 主区域]        │
└──────────────────────────────────────────────────────────────────┘
```

当详情面板打开时：

```
┌──────────────────────────────────────────────────────────────────┐
│ [ModeSwitcher]  [左侧栏]  [看板三列（缩窄）]  [DetailPanel 380px] │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 左侧工作区栏

```
┌─────────────────────┐
│ 全部任务        32  │  ← 默认选中，高亮
│ ──────────────────  │
│ ● Camera ISP    12  │  ← 有任务的 AgentWorkspace
│   Audio DSP      8  │
│   WiFi Driver    7  │
│ ──────────────────  │
│ + 新建任务          │
└─────────────────────┘
```

- 只显示有可见任务（非 completed / cancelled）的工作区
- 选中工作区后，看板按 `workspaceId` 过滤；"全部任务"显示全量
- 数字 = 当前工作区的可见任务总数
- 上次选中的工作区在下次进入 Work 模式时自动恢复（存 settings）

### 6.3 KanbanHeader

```
[Camera ISP]  进行中 3  AI运行中 1  |  [○ TB 未连接]  [归档] [+ 新建任务]
```

- 左：当前工作区名称 + 统计（进行中数量、AI 运行中数量），统计跟随当前选中工作区
- 右：TB 连接状态灰显（MVP 占位）、归档视图入口、新建任务按钮

### 6.4 看板三列

列头颜色：待办 灰 / 进行中 橙 / 待回写 紫。

每列卡片按 `updatedAt` 降序排列，不支持拖拽排序（Phase 2）。

### 6.5 任务卡片

```
┌─────────────────────────────┐
│ CB-024              [需求]  │  ← 编号（mono）+ 类型角标
│ 升级 Redis 缓存层至 v7      │  ← 标题（最多 2 行）
│                             │
│ [李]   需求文档审核中  P2  │  ← 头像 + 当前子阶段标签 + 优先级
└─────────────────────────────┘
```

待办列的卡片额外显示**当前子阶段标签**（因为"待办"列包含 5 个状态，需要区分）：

| 状态 | 卡片标签 |
|------|---------|
| pending | 待处理 |
| req-writing | 需求撰写中 |
| req-reviewing | 需求审核中 |
| design-writing | 方案撰写中 |
| design-reviewing | 方案审核中 |

**Hover 态**：右侧出现操作浮层（→ 下一阶段快捷推进 + ✕ 取消任务）。
**点击卡片**：打开右侧详情面板。

类型角标颜色：需求蓝 / Feature 紫 / Bug 红 / Task 灰。

### 6.6 任务详情面板（380px overlay）

**整体结构（从上到下）：**

---

**① Header**

```
CB-024  [需求]  P2                                              X
```

---

**② 阶段进度条**（需求 / Feature 类型）

```
待处理 → 需求撰写 → 需求审核 → 方案撰写 → 方案审核 → 编码 → CR → 回写
                       ↑ 当前（高亮 + 动态圆点）
```

Bug / Task 类型只显示相关阶段：

```
待处理 → 编码 → CR → 回写
```

---

**③ 大标题 + 外部链接**

```
升级 Redis 缓存层至 v7
#TB-1042 ↗   （有 externalLinks 时显示，点击 shell.openExternal）
```

---

**④ 状态流转操作区**

```
当前阶段：需求文档审核中
[← 驳回，退回修改]          [审核通过，开始方案设计 →]
```

---

**⑤ 产出物区域**（动态显示当前阶段相关产出物）

```
产出物
──────────────────────────────────────────
✓ requirements.md  已生成  [查看]  [标记已上传 TB ✓]
○ design.md        未生成  [前往 Agent 执行 →]
○ experience.md    未生成  （待后续阶段）
```

"前往 Agent 执行 →" 行为：
1. 切换到 Agent 模式
2. 预填 Agent 输入框，包含：
   - 任务标题 / 类型 / 阶段
   - 输出路径（`.luxagents-tasks/CB-001/requirements.md`）
   - 使用 `work-sdd` Skill 中对应的文档模板

---

**⑥ 描述**

```
描述
──────────────────────────────────────────
（Markdown 只读渲染，MVP 不支持 inline 编辑）
```

---

### 6.7 新建任务 Dialog

**必填**：标题、类型、所属工作区
**选填**：描述、优先级（默认 P3）

```
┌──────────────────────────────┐
│ 新建任务                      │
│                               │
│ 标题 *                        │
│ [___________________________] │
│                               │
│ 类型 *         所属工作区 *   │
│ [需求 ▼]       [Camera ISP ▼] │
│                               │
│ 优先级（默认 P3）              │
│ ○P1  ○P2  ●P3  ○P4           │
│                               │
│            [取消] [创建任务]  │
└──────────────────────────────┘
```

所属工作区下拉显示**全部** AgentWorkspace（不限于有任务的），让用户可以给空工作区建第一个任务。

### 6.8 归档视图

从 KanbanHeader 右侧"归档"按钮进入，替换主看板区域显示：

- 列表展示所有 `completed` 和 `cancelled` 的任务
- 按 `updatedAt` 降序
- 支持按状态筛选（已完成 / 已取消）
- 每行显示：taskId、标题、类型、最终状态、完成时间

---

## 7. 扩展性设计

### 7.1 外部系统接入（MCP 统一插槽）

外部系统集成和 RAG 知识库统一通过 MCP 接入，不需要修改 WorkTask 数据模型：

```
AgentWorkspace
└── mcp.json
    ├── teambition-mcp-server    ← Phase 2：TB 集成
    ├── jira-mcp-server          ← 未来：Jira 接入
    ├── obsidian-rag-server      ← 未来：个人知识库
    └── confluence-rag-server    ← 未来：企业文档库
```

接入新系统 = 往 `mcp.json` 加一条记录，WorkTask 通过 `externalLinks[]` 泛化存储外部 ID。

### 7.2 扩展路径

```
MVP              Phase 2                    Phase N
────────         ──────────────────────     ──────────────────────
手动建任务       TB MCP 自动同步             Jira / Linear 同步
手动推进状态     TB 审核状态自动轮询推进      多系统双向同步
手动上传文档     TB 自动上传产出物附件        RAG 知识库自动注入
SDD 可视化       SDD 一键触发                SPEC-KIT 进度自动更新
```

---

## 8. work-sdd 默认 Skill

MVP 需要创建 `work-sdd` Skill，作为 default skill 打包进 LuxAgents，用户创建工作区时自动获得。

### 8.1 目录结构

```
apps/electron/default-skills/
└── work-sdd/
    ├── SKILL.md               ← Skill 描述 + SDD 工作流规范
    ├── req-template.md        ← 需求文档模板
    └── design-template.md     ← 方案设计文档模板
```

### 8.2 SKILL.md 职责

告诉 Agent：
- 当任务阶段为**需求文档撰写**时：按 `req-template.md` 格式输出，保存到 `.luxagents-tasks/{taskId}/requirements.md`
- 当任务阶段为**方案设计撰写**时：按 `design-template.md` 格式输出，保存到 `.luxagents-tasks/{taskId}/design.md`
- 当任务阶段为**经验总结**时：总结本次任务的根因、解法、验证结果，保存到 `.luxagents-tasks/{taskId}/experience.md`

### 8.3 需求文档模板（req-template.md 主要章节）

```markdown
# 需求文档：{任务标题}

## 背景与问题描述
## 用户故事 / 使用场景
## 功能需求
## 非功能需求
## 边界与排除项
## 验收标准
```

### 8.4 方案设计文档模板（design-template.md 主要章节）

```markdown
# 方案设计：{任务标题}

## 根因分析（RCA）
## 方案对比
## 选定方案详述
## 实施计划（分步骤）
## 测试计划
## 风险与降级
```

---

## 9. 非功能需求

- **本地优先**：所有数据存本地 JSON，不依赖网络（TB 同步是 Phase 2 可选增强）
- **无数据库**：全量 JSON，< 200 条任务场景完全够用
- **组件化**：Work 相关组件全部在 `components/work/` 目录，不污染其他模块
- **状态隔离**：Work atoms 独立文件，不与 Chat / Agent atoms 耦合
- **语言**：MVP 全中文 UI，不引入 i18n 框架，国际化独立迭代处理
- **产出物路径规范**：`.luxagents-tasks/{taskId}/` 统一约定，Skill 和 IPC 服务均遵守此路径
