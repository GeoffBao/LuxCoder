# 专家与专家团重设计 —— 参考 Multica 智能体方案

> 日期：2026-08-08
> 参考：`/Users/admin/Workspace/ClaudeCode/Luxmultica`（Multica — managed agents platform）
> 目标：把当前「单 Agent 人设包」的专家/伪团队方案，升级为「可被分配的队友 + 真实专家团（leader + members + 委派）」方案

## 0. 落地状态（2026-08-08 晚）

**已实现（P0/P1/P2/P3 主链路，944 测试全过 + typecheck + build:main/renderer）**：

- P0 shared：`ExpertManifest` 新增 `description/avatar/defaultProviderChannelId/defaultModel`（全可选）；新增 `TeamSquad`/`TeamMember` 类型 + `parse-team.ts`（校验 leader/member 存在性、拦截团队嵌套团队、role 去重）+ `team-protocol.ts`（团长协议/名册/briefing 纯函数）；`parse-expert.ts` 同步解析新字段
- P0 expert-service：`getTeam/listTeams/createTeam/updateTeam` team.json 读写；`resolveExpertOrTeamKind` 团队/专家分流；内置 dev-team/quality-team 一次性迁移（缺 team.json 补写，不覆盖用户自定义）；`updateExpertManifest` patch 类型扩展新字段
- P1 TaskRunner：`TaskNode.expertId` 节点级字段（`node.expertId ?? defaults.expertId`）；`runWithSpec` 展开后静态执行；`task-handlers` 团队运行入口（`defaults.teamId` → 团长编排会话（toolPolicy none）→ `parseTaskYaml`（失败 repair 一次）→ `buildTeamExecutionSpec` 展开 → 静态 DAG 执行）；团长编排会话即 orchestrator（看板可见）
- P2 UI：ExpertCard 升级（avatar icon+accent、description 优先、团队卡团长+成员头像组/角色标注）；CreateTeamDialog（团长→成员+role→协调策略）；TaskEditor 指派支持专家团（`defaults.teamId`，与 expertId 互斥）；useExpertOptions 合并 team.json 数据
- P3：`default-experts/templates/` 专家模板目录（general/architect/reviewer/data-analyst 4 个模板，对齐 agenttmpl 字段）+ `seedDefaultExpertTemplates`（缺失即写）+ electron-builder extraResources

**与文档的偏差（实现时决策）**：
- 内置团队团长用 `delivery-manager`（与 3.3 数据模型示例一致；交付经理天然协调者），文档「老专家团兼容」里写的 leader=general 未采纳
- `defaultChannelId` 改名 `defaultProviderChannelId`（review 第 7 条：避免与飞书/Discord 消息渠道 `ExpertChannelBinding.channel` 混淆）
- 团长产物选**一次性展开**（review 建议）：团长编排 → 展开 spec → 静态执行，不引入运行时动态插节点
- 老团队迁移 = seedBuiltinExperts 内的一次性补写（`migrateLegacyBuiltinTeams`），未引入 Skills 式 semver 契约（review 第 5 条拆分确认）
- 模板 seed 用「缺失即写」（与 seedBuiltinExperts 同模式），semver 版本契约留待后续（模板是新建参考目录，不参与升级）
- 看板卡片徽标（设计文档 3.4 表格）未接线：ExpertChip 存在但当前卡片未使用，MVP 未新增（避免过度改动）

**待用户决策/后续**：
- AGENTS.md/README 文档同步（按仓库规则需用户允许）
- dev 实机复测团队任务运行（`bun run dev`）
- 模板 UI（新建专家时选模板）、专家状态点（working/idle 派生）、跨任务专家并发守卫（review 第 6 条）

---

## 1. 参考方（Multica）方案要点

### 1.1 Agent = 一等公民队友

数据模型（`agent` 表）：

| 字段 | 含义 |
|------|------|
| name / avatar_url | 展示名与头像 |
| runtime_mode (local/cloud) + runtime_config | 绑定执行运行时 |
| visibility (workspace/private) | 可见性 |
| status (idle/working/blocked/error/offline) | 实时状态 |
| max_concurrent_tasks | 并发上限 |
| owner_id | 创建者 |
| instructions | 完整 Markdown 系统提示（角色/工作流/输出/约束） |
| skills（agent_skill 多对多） | 结构化技能实体（name/description/content/files/config） |

创建路径：**Agent Templates**（25 个 curated JSON：`slug/name/description/category/icon/accent/instructions/skills[GitHub URL]`，repo-only、PR 评审维护）+ **Agent Builder**（对话式：name/description/instructions/model/skill_ids/permission_scope）。

### 1.2 Squad = 路由与协调层（不是 Agent）

数据模型（`squad` + `squad_member`）：

```
squad: id / workspace_id / name / description / leader_id(agent) / instructions / archived_at
squad_member: squad_id / member_type(agent|member) / member_id / role
issue.assignee_type 扩展 'squad'
```

核心语义（`builtin_skills/multica-squads/SKILL.md`）：
- **Squad 自己不跑活**；分配给 squad / @mention squad / squad autopilot → 全部路由到 leader agent
- squad members **不会自动 fan-out**；leader 决定谁接手
- squad `instructions` 是 **leader briefing 内容**，不是成员提示词

### 1.3 Leader 委派协议（Squad Operating Protocol）

每次 leader 被触发，briefing 包含三块：

1. **Operating Protocol**（硬编码系统级协议）：
   - 你是 LEADER，职责是协调，不是干活——即使任务像"直接做 X"，也必须委派
   - 读 issue → 按成员 skills/role 匹配最佳成员 → @mention 委派（`[@Name](mention://agent/<uuid>)`）
   - 委派评论要极简（成员已有全部上下文），只说不言自明之外的信息
   - **每次触发必须记录评估**（`squad activity <issue-id> action|no_action|failed --reason`）
   - **派发后停手**，等成员完成/提问/被再次 @mention 时重新评估
2. **Squad Roster**（数据）：leader self-row + 每个成员 `name / role / skills / 可直接粘贴的 mention`
3. **Squad Instructions**（用户定义协调策略）

触发循环：member 完成 → 再次唤醒 leader → 重新评估（下一步 / 升级人类 / 关闭循环）。

### 1.4 任务生命周期与 Dispatch

`enqueue → claim → start → complete/fail`，WebSocket 实时进度；dispatch 层有稳定原因码（queued/coalesced/deferred/runtime_offline/already_active/…）。

---

## 2. 当前项目（LuxCoder/MyYoda）现状

### 2.1 专家（Expert）

- 存储：`~/.myyoda/experts/{slug}/`（expert.json + IDENTITY.md/SOUL.md/RULES.md）
- manifest：`id / label / kind('expert'|'team') / roleLabels / skillSlugs / mcpIds / channelBindings`
- 内置 5 专家（general/architect/qa/reviewer/delivery-manager）+ 2 专家团（dev-team/quality-team）
- 注入：TaskRunner Kanban 任务运行时 `formatExpertPreamble` → `<agent_expert>` XML 用户消息 preamble；`mergeSkillSlugs`/`mergeMcpIds` 合并技能与 MCP；工作区级 binding 可覆盖
- 无 avatar / description / status / runtime / concurrency / owner

### 2.2 专家团（Team）—— 现状是伪团队

`kind: 'team'` 本质是**单 Agent 扮演多角色的协作人设**（注释原文："不涉及真实多 Agent 编排"）。`roleLabels` 仅用于卡片展示。dev-team/quality-team 通过 identityMd/soulMd/rulesMd 写死"按阶段切换视角"。

### 2.3 Kanban 集成

- `TaskDefaultsSchema.expertId`（任务级）+ project `defaultExpertId` → `resolveExpertId` → 注入
- **TaskRunner 原生支持 task.yaml DAG**（depends_on / inputs / outputs / for_each / max_parallel / loop / retry）——这是专家团委派落地的基础
- 无 assignee 概念（任务直接跑，不存在"认领"）

---

## 3. 重设计目标与决策

### 3.1 总体方向

| 维度 | Multica | 我们（本地单机 Electron，无 server/daemon/多用户） |
|------|---------|--------------------------------------------------|
| Agent 运行时 | server + daemon + runtime 绑定 | **渠道 + 模型绑定**（复用现有 channel 体系），无独立 runtime |
| Agent 状态 | status + max_concurrent_tasks | **status（TaskRunner 驱动，只读）+ 专家级并发守卫** |
| Avatar | URL | **emoji / lucide icon + accent 色**（对齐 Shadcn 风格与现有设计令牌） |
| Squad 委派通道 | @mention 评论触发 | **TaskRunner DAG 子任务**（leader 生成委派计划，成员专家各跑子节点） |
| 人类成员 | workspace member | 暂不支持（单机版无多用户），预留 `member_type: 'member'` 枚举 |
| 模板 | 25 个 repo-only JSON | **内置专家模板目录**（同构 JSON，随内置专家分发） |
| 可见性 | workspace/private | 简化：保留字段，默认 workspace |

### 3.2 专家（Expert）升级点

`expert.json` 新增**可选**字段（老包不破坏）：

```jsonc
{
  "id": "architect",
  "label": "软件架构师",
  "kind": "expert",                      // 不变
  "description": "架构决策、模块边界与技术演进",  // 新增：一句话，picker 展示
  "avatar": { "icon": "Layers", "accent": "primary" },  // 新增：卡片视觉
  "defaultChannelId": "…",               // 新增：专家默认渠道（映射 Multica runtime）
  "defaultModel": "…",                   // 新增：专家默认模型
  "roleLabels": [],
  "skillSlugs": [],
  "mcpIds": [],
  "channelBindings": []
}
```

- `status` **不落盘**：由 TaskRunner 运行时推导（该专家当前是否有 running 任务 → working/idle/blocked），避免持久化状态与任务队列漂移
- `description` 用于卡片与 picker；IDENTITY.md 仍是权威人设正文
- `defaultChannelId/defaultModel`：专家运行时的默认渠道/模型；任务显式指定时任务优先（同 expertId 覆盖顺序一致）

**模板目录**（对齐 agenttmpl）：`apps/electron/default-experts/templates/<slug>.json`，字段 `slug/name/description/category/icon/accent/instructions/skills`。`seedDefaultExperts()` 版本契约沿用 Skills 的 semver 比较模式（version 不变 = 老用户拿不到新模板）。

### 3.3 专家团（Team）升级为真实 Squad

#### 数据模型（新 `team.json` 结构，替代"单 Agent 人设包"模式）

```jsonc
{
  "id": "dev-team",
  "label": "软件研发全流程团",
  "kind": "team",
  "description": "…",
  "avatar": { "icon": "Users", "accent": "primary" },
  "leaderExpertId": "delivery-manager",     // 团长 = 一个专家（必须存在）
  "instructions": "团长协调策略：…",          // leader briefing 用，不是成员提示词
  "members": [
    { "expertId": "architect", "role": "架构设计" },
    { "expertId": "general",   "role": "编码实现" },
    { "expertId": "qa",        "role": "测试验收" }
  ],
  "skillSlugs": [],      // 兼容保留：作为团员汇总展示（不直接注入）
  "mcpIds": [],
  "channelBindings": []
}
```

文件布局（保持与专家包同根）：

```
~/.myyoda/experts/dev-team/
├── team.json          # squad 结构（leader + members + instructions）
├── IDENTITY.md        # 团队定位（可选，卡片/详情展示用）
└── SOUL.md / RULES.md # 可选
```

#### 路由与委派（关键机制）

1. **路由**：Kanban 任务新增 `assigneeType: 'expert' | 'team'`（task.yaml 顶层或 TaskDefaults）。`team` 时 TaskRunner 执行「专家团三阶段」：
2. **阶段 1 — 团长编排节点**：先跑 leader 节点（`expertId = leaderExpertId`），preamble = 团长协议 + 团队名册 + 团队 instructions
   - **团长协议**（参考 Squad Operating Protocol 中文适配，硬编码注入）：
     - 你是团长，职责是**拆解委派**，不是亲自实现
     - 读任务目标 → 按成员 role/skills 匹配 → 输出**委派计划**（task.yaml DAG：每个子任务标注成员 expertId 与任务说明，说明只写成员无法从共享上下文推断的信息）
     - 委派计划必须是可执行的 DAG（`depends_on` 表达依赖；可并行子任务用 `max_parallel`）
     - 不擅自扩大范围；无法拆解时说明原因并请求人工介入
   - **团队名册**（数据，动态生成）：leader self-row + 每个成员 `label / role / skillSlugs（解析为 skill 名称）`
3. **阶段 2 — 成员执行**：TaskRunner 按 DAG 调度，每个成员节点带该成员的 `expertId` → 各自注入成员专家 preamble + skills/mcps（**完全复用现有注入管线**）
4. **阶段 3 — 团长汇总节点**：DAG 尾部挂汇总节点（`expertId = leaderExpertId`，`depends_on` 全部成员节点），团长验收各成员产出、合并结论、输出最终交付

```
graph TD
  A[团长编排节点] --> B[成员1: architect]
  A --> C[成员2: general]
  B --> D[团长汇总节点]
  C --> D
```

> **为什么不用 collaboration 子会话委派**：协作子会话不可持久化到 Kanban 任务流（无法暂停/恢复/看板可见）。DAG 子任务天然有状态、可中断恢复、看板可见，且与现有 TaskRunner 完全同构。collaboration 保留用于并行探索类场景。

#### 老专家团兼容

- 存量 `kind: 'team'` 包（dev-team/quality-team）：**迁移为 squad 结构**——生成 `team.json`（leader = general，members 按 roleLabels 拆解），identityMd/soulMd/rulesMd 保留为团队文档
- 迁移后老 `expert.json` 保留 `kind: 'team'` 标记做向后兼容读取；**新建专家团一律写 team.json**，老结构不再生成
- 若用户想保留"单 Agent 扮演多角色"场景 → 提供"单人模式"开关（`team.json` 里 `members: []` 且 `singleAgent: true` 时退化为旧行为：直接注入团队人设）

### 3.4 UI 重设计

| 面 | 改动 |
|----|------|
| 专家卡片 ExpertCard | 加 avatar（icon+accent）、description、**运行状态点**（working=呼吸动画/idle=灰点） |
| 专家详情 ExpertDetailSheet | 加 description / avatar / 默认渠道模型编辑；status 只读展示 |
| 专家团卡片 | 团长 + 成员头像组（`-space-x-2` 堆叠）、成员列表（role 标注） |
| 新建专家团 CreateTeamDialog | 三步：基本信息 → **选团长**（专家下拉）→ **勾选成员 + role**（复用 ReferenceMultiSelect 模式）→ 写协调策略 instructions |
| 专家团详情 | 编辑团长/成员/role/instructions；预览"团长协议+名册"注入效果 |
| Kanban TaskEditor | assignee 行：专家单选（现状）→ 支持**专家团**；选中团队时任务卡显示团队徽标 |
| 看板卡片 | 显示指派专家/专家团头像 + 状态点（对齐 craft-agents 卡片惯例） |

### 3.5 保护现有功能（硬约束）

1. `expertId` 注入管线（resolveExpertId / formatExpertPreamble / mergeSkillSlugs / mergeMcpIds / workspace binding）**零改动**，团队新增节点只是换 expertId
2. `TaskDefaultsSchema.expertId` 保留；新增 `assigneeType`/`teamId` 可选字段，不破坏现有 task.yaml
3. `expert.json` 只加可选字段；老包读取路径不变
4. 内置专家 seed 逻辑复用（`seedBuiltinExperts`），新增 `seedDefaultTeamTemplates` 用 semver 版本契约
5. 单专家任务运行路径完全不变（团队模式只在显式指派 team 时启用）

---

## 4. 落地计划（建议顺序）

| 步骤 | 内容 | 涉及 |
|------|------|------|
| P0 | `packages/shared/src/experts/types.ts` 扩展 ExpertManifest（description/avatar/defaultChannelId/defaultModel）+ 新增 `TeamSquad` 类型与 `parse-team.ts`（校验 leader/member 存在性） | shared |
| P0 | `expert-service.ts` 新增 team.json 读写（createTeam/updateTeam/getTeam）；内置专家团 seed 改为 squad 结构 + 老包迁移 | main/lib |
| P1 | TaskRunner 专家团三阶段：`assigneeType='team'` → 团长节点（协议+名册+instructions 注入）→ DAG 展开 → 汇总节点；`buildTeamRoster()` 纯函数 | main/lib + shared |
| P1 | 团长协议文本（中文，对齐 Multica Operating Protocol）与名册生成，落 `packages/shared/src/experts/team-protocol.ts`（可单测） | shared |
| P2 | UI：CreateTeamDialog / ExpertCard 升级 / ExpertDetailSheet 扩展 / TaskEditor assignee 支持团队 | renderer |
| P2 | Kanban 卡片团队徽标 + 状态点（working/idle 派生） | renderer |
| P3 | 专家模板目录 `default-experts/templates/` + seed 版本契约 | main/lib + default-experts |
| P3 | 文档：AGENTS.md / README 同步（经用户允许） | docs |

测试策略（BDD）：
- `parse-team.test.ts`：team.json 解析、leader/member 校验、role 去重
- `team-protocol.test.ts`：协议文本注入、名册渲染（成员 skills 名称化）、老包迁移产物断言
- `task-runner.test.ts`：团队任务展开为 团长→成员→汇总 DAG；成员节点 expertId/skills 合并正确；单专家路径无回归（现有 988 测试基线）

---

## 5. 技术可行性复核（2026-08-08 review）

对照仓库当前代码逐条核实后发现：**产品设计层（专家升级字段、Squad 数据模型、UI 交互）扎实可行，但"团长委派→动态 DAG"这条技术路径被写得像是接现成的轨，实际上依赖的三项关键基础设施在当前代码里都不存在**。这类问题不提前拆出来，P1 会直接卡死。

### 🔴 阻断级（P1 开工前必须先解决）

1. **`TaskNode` 无节点级 `expertId` 字段，`dispatch()` 只认任务级 `defaults.expertId`**
   `packages/shared/src/tasks/schema.ts:98-126`（`TaskNodeObject`）里 `model`/`llmConnection`/`permissionMode` 都有节点级覆盖字段，唯独没有 `expertId`。`task-runner.ts:443` 的 `resolveExpertId(this.spec.defaults?.expertId, projectDefault)` 对**每个节点**都取同一个任务级值——也就是说，同一任务里所有节点今天注入的是**同一个专家**。3.3 节描述的"团长节点用 `leaderExpertId`、成员节点各自用 `expertId`、汇总节点切回团长"在现有 dispatch 逻辑下不会生效。
   **修复方向**：`TaskNodeObject` 加 `expertId` 可选字段 + `dispatch()` 改成 `node.expertId ?? this.spec.defaults?.expertId`（跟 `model`/`llmConnection` 同一模式），必须显式列入 P0，不能被"注入管线零改动"这句话盖过——这里恰恰要改注入管线的取值优先级。

2. **"团长生成 DAG 并展开执行"在 TaskRunner 里没有任何运行时支撑**
   `NODE_KINDS` 声明了 `orchestrator`/`route`/`parallel`/`map`/`loop`/`synthesize`/`aggregate` 等（`schema.ts:16-21`），schema 注释也写了 `// 控制流（P4 执行，当前仅解析）`。`task-runner.ts` 里 `node.kind` 从未被读取用于分支执行，`for_each`/节点级 `max_parallel`/`loop`/`retry`/`when`/`trigger`/`replicas`/`aggregate`/`approval` 全部只解析不执行——TaskRunner 目前是**纯静态 DAG 执行器**，`spec.nodes` 在任务开始前就固定，运行时无法"某节点跑完后根据其输出动态插入新节点"。
   **修复方向**：无论"团长产物"选一次性展开还是分批委派，都要求 TaskRunner 新增"运行中变更节点集合"的能力（新增节点、重建 `this.edges`、扩展 `this.state` Map，且要跟 `scheduleReady()` 的并发调度安全交互），这是独立于 UI/协议文案的运行时改造，工作量需单独评估，不能塞进 P1 一行带过。

3. **"复用已有「LLM 生成 task.yaml」管线"——这条管线不存在**
   `packages/shared/src/tasks/generator-prompt.ts` 除自身单测外**零消费者**，renderer/main 没有任何地方调用它把 LLM 输出解析注入 TaskRunner。当前 task.yaml 的产生方式是 `task-spec-form.ts`/`quick-task-model.ts` 的**表单驱动手工创建**。团长解析委派计划成合法 DAG（含 schema 校验失败时的容错/降级）需要从零写。

### 🟠 严重（会导致运行时行为不符预期）

4. **`getExpert()` 对纯 `team.json`（无 `expert.json`）的 id 静默返回 null，团队注入会无声消失**
   `task-runner.ts:445-454` 找不到专家包只 `console.warn` 不中断。任何还按老逻辑调用 `getExpert(teamId)` 的路径会悄悄跳过注入而非报错。需要在 dispatch 前显式判断 id 是 team 还是 expert，两条路径分流。

5. **内置专家团的"存量迁移"不能走 Skills 那套 semver 升级机制——专家侧根本没有版本号**
   `expert-service.ts:59-87`（`seedBuiltinExperts`）是纯"目录不存在才种"（`if (existsSync(expertDir)) continue`），唯一"升级"是第 82-86 行硬编码的一次性文案替换 hack，跟 `default-skills` 的 semver 比较完全是两回事，`ExpertManifest`/`ExpertDefinition` 也没有 `version` 字段。3.3 节"老专家团兼容"与 P3"seed 版本契约"实际是**两件独立的事**：前者是一次性迁移脚本（检测 `kind:'team'` 且缺 `team.json` → 按 `roleLabels` 拆出 members），后者是引入新的版本比较基础设施，落地计划表要拆成两项。

6. **"专家级并发守卫"和"status 由运行时推导"缺少跨任务数据源**
   现有 `inFlight`/`maxParallel`（`task-runner.ts:218-241,414`）作用域是**单个 TaskRunner 实例**（一次任务运行），不是"某专家在全工作区范围内有几个任务在用"。要做到 3.1/3.2 节的承诺，需要新增一个跨多个并发 TaskRunner 实例的 `expertId → 活跃运行` 聚合索引（`task-repository.ts`/`task-handlers.ts` 目前没有按 expertId 索引运行状态的代码），未出现在 P0-P3 模块清单里。

### 🟡 中等（不阻塞开工，落地时会踩坑）

7. **`defaultChannelId` 与既有 `ExpertChannelBinding.channel` 概念冲突**：`types.ts:1-4` 的 `channelBindings.channel` 指飞书/Discord 消息渠道，新字段指 AI Provider 渠道，同一结构里两种"channel"语义不同，建议改名避免混读。
8. **`updateExpertManifest` 的 patch 类型未跟上新字段**：`expert-service.ts:155-158` 当前只允许改 `skillSlugs`/`mcpIds`/`label`，需扩展支持 `description`/`avatar`/`defaultChannelId`/`defaultModel`。
9. **`parse-team.ts` 校验应显式拦截"团队嵌套团队"**：leader/member 都在同一 `~/.myyoda/experts/{slug}/` 命名空间下，没有类型隔离，建议校验中加一条"leader/member 必须解析为 `kind==='expert'`"，避免递归配置。

### 🟢 已核实无误的部分

- 现状描述（3.1/3.2/3.3 开头）与代码完全吻合。
- `TaskNode.inputs`（`{ from, summarize }`，`schema.ts:50-53`）足够支撑"团长汇总节点读取各成员输出"，无需额外基础设施。
- `TaskDefaultsSchema`/`TaskNodeObject` 的可选字段扩展方式对旧 task.yaml 安全，新增 `assigneeType`/`teamId` 不会破坏现有解析。
- `agent-experts/ReferenceMultiSelect.tsx` 确实存在且可直接复用于 CreateTeamDialog 选成员步骤。
- `ExpertCard.tsx:55` 已从 `identityMd` 首段派生描述展示，新增显式 `description` 字段是增量改进，UI 改动量比文档暗示的更小。

### 建议

- P1 拆细，显式列出上述 1/2/3（节点级 expertId、动态节点注入、委派计划解析）为独立任务项，工作量单独评估。
- "团长产物"确认题建议先选**一次性展开**：分批委派要求的"多轮唤醒团长重新评估"在当前架构下等于要做一个持久化、可中断恢复的委派状态机，比动态节点注入本身还要再多一层复杂度，MVP 阶段性价比不高。
- P1 内先做一个技术验证 spike："团长节点输出 → 校验 → TaskRunner 运行时插入 2 个成员节点 + 1 个汇总节点 → 正常调度完成"最小闭环跑通后，再铺开 UI（P2）与模板目录（P3）。
