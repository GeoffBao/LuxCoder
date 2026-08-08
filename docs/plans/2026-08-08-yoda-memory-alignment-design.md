# Yoda 记忆模块对齐设计（空间/项目文件组织升级）

日期：2026-08-08
状态：已确认（brainstorming 产出，待排期实现）

## 背景与问题

「工作区升级为空间」+「项目 = 真实文件夹」（方案 B）的文件组织升级正在设计中。这次升级改变了两个前提：

1. **空间（Space）不再等同于单一项目**，而是"逻辑聚合 + 隔离边界"（MCP/Skills/记忆的隔离单位），程序员场景下通常一个默认空间即可，一个空间下可挂多个项目。
2. **项目（Project）= 真实文件夹**，即项目的工作目录直接是用户在磁盘上的真实目录（如某个 git 仓库），而不是 MyYoda 托管目录里的一个 slug 子文件夹。

这两个前提升级后，**Yoda 记忆模块的现有存储结构会产生水土不服**——这正是本次设计要解决的问题。

### 现状

```
agent-workspaces/{slug}/
  ├── CLAUDE.md                    ← 空间级指令
  ├── .claude/memory/MEMORY.md     ← 空间级记忆索引
  ├── .claude/memory/{主题}.md     ← 空间级主题记忆
  └── workspace-files/projects/{slug}/
        └── MEMORY.md              ← 项目级记忆（当前，托管目录）
```

**核心问题**：项目记忆挂在 `workspace-files/projects/{slug}/MEMORY.md`（MyYoda 托管目录），而项目工作目录（`workingDirectory`）已经指向用户真实文件夹（如 `~/code/repo`）。二者物理分离——用户改代码时看不到项目记忆，记忆和项目内容脱节。升级到"项目 = 真实文件夹"后，这个分离会更加刺眼。

## 目标

- 项目自动记忆跟随项目真实文件夹存放，不再脱节于托管目录
- 明确"人写指令文件（CLAUDE.md）"与"Agent 自动积累记忆"两种性质不同的内容，避免混在同一份文件里
- 保持两级记忆（空间级 + 项目级），不新增个人级
- 磁盘管理、清理逻辑的边界要显式覆盖新场景，不误删/误扫用户真实目录
- 不做老项目迁移工程——原生设计，新建项目按新方案，存量项目维持现状

不在本轮范围：LLM Wiki 化检索（建索引 + 按需检索相关片段进上下文）、右侧栏快速查询 UI。这两项是 Yoda 知识库阶段的目标，本次只占位，不设计具体方案。

## 参考对齐对象：proma

proma 是本次设计的主要参考。核心差异要先挑明：**proma 的"工作区"和"项目"是 1:1**（`AgentWorkspace` 自带 `projectRootPath` 字段），没有 MyYoda 这种"一个空间下挂多个项目"的嵌套结构。**本设计不改 MyYoda 的嵌套结构**——只是把 proma 对"项目文件归属"的处理方式，套到 MyYoda 项目这一层。

proma 的关键代码事实（均已核实）：

1. `agent-workspace-manager.ts`：
   ```ts
   /** 本地目录项目直接使用用户选择的目录；空白项目继续使用 Proma 托管的
    *  workspace-files/，以保持历史项目完全兼容。 */
   export function getProjectFilesPath(workspaceSlug: string): string {
     return getAgentWorkspaceBySlug(workspaceSlug)?.projectRootPath ?? getWorkspaceFilesDir(workspaceSlug)
   }
   ```
   `projectRootPath` 只在创建时决定，**全仓库没有任何"事后迁移"代码**。
2. `agent-prompt-builder.ts` 第 236 行，系统提示词原文明确规定：
   > "不要自动读取、创建或修改项目根中的 `.claude/`、`CLAUDE.md`、MCP 或 Skills 配置"

   即 proma 把项目根的 CLAUDE.md 当成**人写、只读、Agent 不可自动修改**的文件；proma 自己的 `CLAUDE.md` 其实是工作区级（`join(workspaceRoot, 'CLAUDE.md')`），不是项目级。
3. `storage-service.ts`：磁盘用量统计（`calcWorkspacesCategory`）只扫 `~/.proma/agent-workspaces/`，**从不扫外部 `projectRootPath`**；孤儿会话清理时 `PRESERVED_ORPHAN_SESSION_DIRS = new Set(['.context'])`，`.context` 目录被显式排除在自动清理之外。
4. proma 没有独立的"个人级"记忆层——跨空间的用户画像也写在某个工作区的 `.claude/memory/` 下。
5. proma 不做任何 `.gitignore` 自动化，`.context/` 是否提交由用户自己的项目 git 配置决定。

## 设计

### 1. 记忆层级与文件形态

| 层级 | 路径 | 读写权限 | 对齐 proma 的哪部分 |
|---|---|---|---|
| 空间级指令 | `agent-workspaces/{slug}/CLAUDE.md` | 人写 + Agent 按需维护 | 不变，proma 也是工作区级 CLAUDE.md |
| 空间级记忆 | `agent-workspaces/{slug}/.claude/memory/` | Agent 读写；跨项目的用户画像/偏好放这里 | 不变，两级记忆的第一级；proma 没有独立个人层 |
| 项目级指令（本地目录项目） | `<projectRoot>/CLAUDE.md` | **人写，Agent 只读，不自动写入** | 对齐 proma 第 236 行硬规则 |
| 项目级记忆/调研（本地目录项目） | `<projectRoot>/.context/`（含 `note.md`、`todo.md`、**`MEMORY.md`**） | Agent 读写 | 对齐 proma `.context/` 的角色；`MEMORY.md` 是这个目录里新加的一个文件，不是新概念 |
| 项目级记忆（空白项目，无真实目录） | `workspace-files/projects/{slug}/MEMORY.md` | Agent 读写 | 对齐 proma "空白项目继续用托管目录" |

**关键决策（P0）**：CLAUDE.md 和自动记忆分属两个不同命名空间，不能合并。原因有二：

- proma 自己的规则明确禁止 Agent 自动改写项目根 CLAUDE.md；
- 项目真实目录的 CLAUDE.md 本来就可能被 Claude Code CLI 等外部工具当作人写指令读取（LuxAgents 自己的 `CLAUDE.md` 就是活例子——里面写着"依赖版本要搜索确认""状态管理用 Jotai"这类硬规则），Agent 自动写入会污染/覆盖用户手写内容。

自动记忆统一走 `.context/MEMORY.md`，风格延续现有的"按日期+状态记录踩坑/决策"格式（即当前 `workspace-files/projects/{slug}/MEMORY.md` 的写法），只是物理位置换了。

### 2. 两级记忆，不新增个人层

对齐 proma：保持"空间级 + 项目级"两层，用户画像归入空间级 `.claude/memory/`。不引入独立的"个人级"记忆目录——这是最小改动路径，也是 proma 验证过的模式。

### 3. 磁盘管理与数据边界（原生设计，不做老项目迁移）

**不考虑存量项目迁移**。新建的本地目录项目从创建起就用第 1 节的新方案（`.context/MEMORY.md`）；**已存在的项目（无论是否已有真实工作目录）和空白项目，一律维持现状**，继续用 `workspace-files/projects/{slug}/MEMORY.md`，不做任何自动搬迁。这完全复刻 proma `getProjectFilesPath` 的注释原文："以保持历史项目完全兼容"——proma 全仓库没有迁移代码，这次也不写。

磁盘管理页面（对齐 proma `storage-service.ts` / `StorageSettings.tsx`）：

- **扫描范围不变**：只统计 `~/.myyoda/` 托管目录，不扫描任何外部 `workingDirectory`。这一点 MyYoda 现状已经如此（项目代码文件本来就在外部、从未被磁盘管理统计过），本次只是把项目记忆也纳入这个既有边界，不是新增能力。
- **清理护栏显式化**：新增硬约束——任何自动清理逻辑绝不允许触碰 `workingDirectory` 指向的外部真实目录。这是现状代码的隐含行为，这次要写成显式契约（代码注释 + 测试用例），防止后续有人不小心把清理范围扩大过去。
- **孤儿清理保留 `.context/`**：抄 proma 的 `PRESERVED_ORPHAN_SESSION_DIRS` 模式，`.context` 目录在孤儿 session/workspace 清理时被跳过，不随会话失活被删除。

### 4. Git / 隐私边界

对齐 proma：**不做自动 `.gitignore`**。`.context/`（含 `MEMORY.md`）要不要提交进项目的 git 仓库，完全由用户自己的项目 `.gitignore` 决定，MyYoda 不介入、不提示、不强制。

## 方案选型

- **方案 A（选定）**：CLAUDE.md 只读 + `.context/MEMORY.md` 可写，两级记忆不变，存量项目不迁移。对齐 proma 已验证的模式，改动面最小，风险可控。
- 方案 B（否决）：项目记忆直接写入项目 CLAUDE.md（"类似 claude.md"的直觉理解）。会与 Claude Code CLI 等外部工具共享的人写指令文件冲突，proma 自己的规则也明确禁止。
- 方案 C（否决）：新增独立个人级记忆层。proma 没有这一层，且当前需求（用户画像/偏好）用空间级已经够用，属于过度设计。
- 方案 D（否决）：为存量项目提供自动/半自动迁移工具（扫描 + 一键搬迁到项目目录）。用户明确表示不考虑，且这属于 proma 从未面对过的问题（proma 的 `projectRootPath` 只在创建时决定），强行补这块会显著增加工程量却收益有限。

## 已知限制 / 后续阶段

- **LLM Wiki 化检索**（建索引 + 按需检索相关片段进上下文，取代当前"全量注入 MEMORY.md"）：本轮不设计，留给 Yoda 知识库阶段。当前项目一多、记忆一长，全量注入依然存在 token 膨胀风险，需要在知识库阶段专门做技术选型（embedding/向量库/索引更新策略）。
- **右侧栏快速查询 UI**：本轮不设计，同样留给 Yoda 知识库阶段。
- **存量项目记忆位置不统一**：升级后，新项目记忆在 `<projectRoot>/.context/MEMORY.md`，老项目记忆仍在 `workspace-files/projects/{slug}/MEMORY.md`，两种位置会长期并存。这是主动选择（不做迁移工程），Agent 侧读取逻辑需要同时支持两种路径来源。

## 涉及范围（待实现阶段细化文件清单）

- `agent-workspace-manager.ts` / `project-repository.ts`：项目创建时根据是否有真实 `workingDirectory` 决定记忆写入路径（`.context/MEMORY.md` vs 托管目录）
- `agent-prompt-builder.ts`：项目 CLAUDE.md 改为只读注入，不再有任何自动写入路径；系统提示词补充"CLAUDE.md 只读 / `.context/` 可写"的说明（对齐 proma 第 236 行的措辞）
- `storage-service.ts`：孤儿清理逻辑新增 `.context` 保留规则；补充"绝不触碰外部 `workingDirectory`"的护栏测试
- 系统提示词构建相关文档 / MEMORY.md 索引说明，同步更新记忆路径描述
