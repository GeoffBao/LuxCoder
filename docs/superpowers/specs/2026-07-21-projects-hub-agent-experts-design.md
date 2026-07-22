# 项目中心 Hub + Agent 专家模块设计

日期：2026-07-21  
状态：已评审（brainstorming）  
范围：P0 实现边界；蜂群 / Bot 仅留钩子  
修订关系：修订并部分取代 `2026-07-20-code-projects-board-ia-design.md` §4.4「项目可折叠展开列表」条款；P0/P1 已落地部分（去右栏、Code Board、顶栏 Work 下线）仍然有效。

## 1. 问题

1. Code 左栏「项目」以可折叠列表展开，与「自动任务 / Agent 技能」的入口行 → 全屏主区模式不一致，挤占会话列表。
2. 「项目」二字过短，且易与「工作区」混淆。
3. 需要一等公民「Agent 专家」（领域角色 + Skills/MCP 赋能），并与项目默认专家关联；蜂群编排与飞书/Discord Bot 为后续。

## 2. 决策摘要（已锁定）

| 决策点 | 定案 |
|--------|------|
| 打开方式 | **A · 项目管理 Hub**：左栏入口行 → 主区 Hub；日常看板仍走 Code「会话 \| 看板」 |
| 命名 | **项目中心**（入口与主区标题同名） |
| 本轮范围 | **项目中心 + Agent 专家左栏壳**；蜂群不做 |
| 专家↔项目 | **项目可挂 `defaultExpertId`**（持久化+展示；不注入运行时） |
| 导航实现 | **扩展 `activeViewAtom`**：`projects` / `agent-experts`；看板仍 `codeMainView='work'` |
| 左栏顺序 | 自动任务 → Agent 技能 → **Agent 专家** → **项目中心**（模块区最后一项）→ 工作区/会话列表 |

## 3. 目标信息架构

```
顶栏：Chat | Code

Code 左栏：
  [入口行] 自动任务
  [入口行] Agent 技能
  [入口行] Agent 专家
  [入口行] 项目中心          ← 模块区末；不再展开列表
  ── 工作区 / 会话列表 ──

主区互斥（优先 activeView 覆盖视图）：
  automations | agent-skills | agent-experts | projects
  conversations + codeMainView=session → 会话
  conversations + codeMainView=work    → 看板 / 项目详情
```

**交互：**

- 点「项目中心」→ `activeView='projects'` → `ProjectsHubView`
- Hub 点项目卡片 → `selectedProjectId` + `workView='board'` + `codeMainView='work'` + `activeView='conversations'`
- Hub/详情 ⓘ → `workView='project'`（详情内可选默认专家）
- 点「Agent 专家」→ `activeView='agent-experts'` → `AgentExpertsView`
- Chat 模式：不渲染「项目中心」「Agent 专家」入口

## 4. 行业与参考（节选）

| 参考 | 启示 |
|------|------|
| Codex / Claude / craft | Project 是容器；Board/任务是视图，不是并列左栏第三入口 |
| Agent 技能（本产品） | 入口行 + 全屏管理页 —— 项目中心 / 专家对齐此契约 |
| OpenClaw bootstrap | `IDENTITY` / `SOUL` / `AGENTS(RULES)` 分文件；Skills/MCP **引用按需加载**；避免每轮全量注入 |
| Kimi Agent Swarm / Code sub-agents | 主 Agent 调度子 Agent、上下文隔离 —— **本轮仅钩子** |
| OpenClaw / 飞书 Agent@Agent / agent-im-relay | Expert ↔ 渠道账号路由（@ / slash）—— **本轮仅 `channelBindings[]` 占位** |

## 5. 组件边界

### 5.1 导航与壳

| 项 | 动作 |
|----|------|
| `ActiveView` | 扩展 `'projects' \| 'agent-experts'` |
| `MainArea` | 分支渲染 `ProjectsHubView` / `AgentExpertsView` |
| `SidebarModule` | 四入口均 `collapsible: false` |
| `SidebarProjectsSection` | **改为纯入口行**（或内联 `SidebarModule`），删除展开列表 / 搜索 / 子列表 UI；列表能力迁入 Hub |
| `codeMainViewAtom` / `WorkBoardView` | 不变 |

左栏装配顺序（Code）：自动任务 → Agent 技能 → Agent 专家 → 项目中心 → 会话树。

### 5.2 项目中心 Hub

新建 `ProjectsHubView`（视觉对齐 `AgentSkillsView`）：

- 搜索、归档开关、新建（复用 `CreateProjectDialog`）
- 卡片：名称、色点、简要状态、默认专家徽标
- 点卡片 → 进看板；次级操作 → 详情
- `ProjectConfig.defaultExpertId?: string`（或等价字段）；详情 / Hub 设置面板可编辑
- 本阶段：**不**根据专家注入 Skill/prompt

### 5.3 Agent 专家

新建 `AgentExpertsView`：卡片网格 + 详情/编辑侧栏或页内面板。

**本阶段内置角色（slug 稳定）：**

| slug | 标签 |
|------|------|
| `general` | 通用专家 |
| `driver` | 驱动软件专家 |
| `application` | 应用软件专家 |
| `system` | 系统软件专家 |
| `communication` | 通信软件专家 |
| `delivery-manager` | 软件交付经理 |
| `se` | 软件 SE |
| `architect` | 软件架构师 |
| `qa` | 软件测试 |
| `reviewer` | 代码审查 |

P1 可选补位（不进 P0 内置强制）：探索/调研、规划、DevOps/SRE、安全、技术写作。

与现有 `task-editor-ui-model.ts`：`general/driver/system/application/communication` 使用同一 slug 约定。P0 **不改** TaskEditor 枚举；P1 再与专家模块同源扩表。

### 5.4 专家包文件布局（本地文件优先）

```
~/.luxcodex/experts/{slug}/          # 开发态：~/.luxcodex-dev/experts/
  IDENTITY.md      # 名、角色一句话
  SOUL.md          # 语气 / 立场
  RULES.md         # 操作边界（≈ AGENTS.md 角色篇）
  expert.json      # 见下
```

`expert.json`：

```json
{
  "id": "architect",
  "label": "软件架构师",
  "skillSlugs": [],
  "mcpIds": [],
  "channelBindings": []
}
```

**分层原则：**

| 层 | 内容 | P0 |
|----|------|-----|
| 身份核 | IDENTITY + SOUL + RULES | 可编辑壳 + 种子文件 |
| 能力引用 | skillSlugs / mcpIds | UI 多选绑定（写 json）；不注入 runtime |
| 渠道占位 | channelBindings | 空数组；无 Bot UI |
| 禁止 | 每专家 USER.md | 用户档案保持全局 |

Skill 赋能专家：专家只存 slug 引用；完整 Skill 内容仍由 Agent 技能体系管理（按需加载，避免 token 膨胀）。

## 6. 数据流

```
点「项目中心」
  → activeView='projects'
  → ProjectsHubView 读 serverKanbanProjectsAtom

Hub 点项目
  → selectedProjectIdAtom
  → workViewAtom='board'
  → codeMainViewAtom='work'
  → activeView='conversations'
  → Board 过滤（既有）

详情设默认专家
  → projects.update(..., { defaultExpertId })
  → upsert serverKanbanProjectsAtom

点「Agent 专家」
  → activeView='agent-experts'
  → 读 ~/.luxcodex[-dev]/experts/*
```

### 6.1 错误与边界

| 情况 | 行为 |
|------|------|
| 无 workspaceRoot | 项目中心空态；不创建 |
| defaultExpertId 指向缺失专家 | UI 回退显示「通用」或「未设置」，不崩溃 |
| 专家目录损坏 | 跳过坏包 + toast；内置种子可修复 |
| Chat 模式 | 两入口不渲染 |

## 7. 分期

### P0（本轮实现计划范围）

1. `activeView` 扩展 + MainArea 分支。
2. 左栏顺序与入口行；移除项目侧栏展开列表。
3. `ProjectsHubView` + 进看板 / 详情默认专家字段。
4. `AgentExpertsView` + 专家包种子与读写壳。
5. 单测 / BDD：路由、Hub 导航、defaultExpertId、expert.json 解析。
6. electron patch 版本递增。

### P1

- TaskEditor 专家枚举与专家模块同源。
- 探索/规划等补位角色。
- 专家详情里 Skills/MCP 绑定体验打磨。

### P2 / 后续钩子（不实现）

- **蜂群**：主 Agent 调度专家子 Agent；上下文隔离；进度可视化（对齐 Kimi Swarm）。
- **Bot**：`channelBindings` → 飞书 `accountId` / Discord application；@ 路由；群内 Agent@Agent 显式交接。
- 专家 runtime 注入（orchestrator / prompt builder）。

## 8. 成功标准

1. 点「项目中心」打开全屏 Hub；侧栏无项目展开列表。
2. Hub 选项目进入看板过滤；详情可设默认专家并持久化。
3. 点「Agent 专家」打开专家网格；内置 10 个 slug 可见。
4. 左栏顺序符合 §3；Chat 无两入口。
5. 无 runtime 注入、无 Bot UI、无蜂群 UI。

## 9. 风险

| 风险 | 缓解 |
|------|------|
| 与 07-20 §4.4 冲突 | 本 spec 明确废止「项目 collapsible 展开」；实现以本文件为准 |
| 专家包与 Skills 职责不清 | Skills=能力单元；专家=角色核+引用；禁止复制 USER |
| defaultExpertId 无运行时效果引发「无效」感 | UI 文案标明「将用于任务默认专家（运行时后续接入）」 |
| LeftSidebar 合并冲突 | 只改模块装配顺序与入口，少动会话树 |

## 10. 预估触点文件

- `apps/electron/src/renderer/atoms/active-view.ts`
- `apps/electron/src/renderer/components/tabs/MainArea.tsx`
- `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx`（改入口行）
- 新建：`ProjectsHubView.tsx`（及同目录 view-model/tests）
- 新建：`agent-experts/`（`AgentExpertsView`、expert 读写、种子、tests）
- `@luxcodex/shared` ProjectConfig / CreateProjectInput（`defaultExpertId`）
- 主进程：experts 目录 seed / list / read / write IPC（若渲染进程不宜直读写）
- `apps/electron/package.json` patch

## 11. 开放项（已关闭）

- Hub vs 直达看板 vs 双 Tab → **Hub**
- 命名 → **项目中心**
- 专家绑定深度 → **项目默认专家，不注入**
- 导航机制 → **activeView 扩展**
- 项目中心位置 → **模块区最后一项（非页脚钉死）**
