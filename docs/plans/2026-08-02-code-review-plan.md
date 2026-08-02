# 最近两天代码变更 Review 方案

> 审查窗口：**2026-07-31 22:47 → 2026-08-02 12:14**（main 48 个提交 + 未提交工作树 46 个改动）
> 基准：`main` @ `b9a161f5`；最近 tag `v0.6.0`（`3eaef62c`）
> 文档定位：可直接分步执行的审查操作手册；审查人（Agent 或人类）按阶段推进，每阶段有明确产出。

---

## 0. 审查目标

对最近两天合入 main 的 48 个提交 + 当前未提交的 Agent Outbox 计划（46 个文件）做一次系统性 Review，回答三个问题：

1. **当前工作树是否可安全提交**（未提交改动占大头，风险最高）；
2. **已合入的提交质量与冲突处理是否可接受**（重点：codeclaw 结构替换、upstream sync 合并）；
3. **是否存在会阻塞下次发布 / 下次 upstream sync 的隐患**（打包配置、体积、.gitignore、遗留分支）。

产出：一份结论明确的审查报告（模板见 §6）。

---

## 1. 审查范围与边界

### 1.1 纳入审查（按风险分组）

| 分组 | 内容 | 风险级别 | 审查侧重 |
|------|------|----------|----------|
| **G0｜未提交工作树** | 46 个文件：`agent-file-roots.ts` / `agent-output-capture.ts` / `storage-boundaries.ts` / `project-files-root.ts` 等新模块 + `agent-orchestrator.ts` finally 捕获 + IPC/preload/shared 合约 + renderer 视图（WorkspaceContextView / RepoWikiView / SidePanel 重构） | 🔴 最高 | §5.1 Outbox 计划专项清单 |
| **G1｜结构级变更** | `feat/codeclaw`（`afe48c6a` + `45c4767f` + `3eaef62c`）：Agent 灵动岛 → CodeClaw 桌面宠物，141 文件 +26573/-3749，删除 agent-island 子系统 | 🔴 高 | §5.3 结构变动清单 |
| **G2｜未提交工作树关联提交** | `b9a161f5`（Home 模式恢复）、`8acb950e`（测试加固）——与 G0 直接衔接 | 🟠 中 | Home/Code 分离入口、测试隔离 |
| **G3｜功能合并批次** | `7e1be404`（Agent 插件 6 Tab）、`80082593`/`b7d1ec1e`（Project cwd）、`023e9b4e`（SidePanel 333 行重构）、`442c343c`（upstream oauth + ChannelForm）、`733b7216`/`67e3441a`/`0e7cd0a2`/`f7928e93`（v0.6.0 视觉/图标） | 🟠 中 | UI 组件化、渠道配置、视觉资源 |
| **G4｜upstream 移植批次** | `sync/upstream-v016` 合并 + 约 40 个移植提交（#13xx-#1390：语音听写、Agent 灵动岛仪表盘、Settings 整页、Planning 快捷键、Pi retry、Codex OAuth、xAI OAuth 等） | 🟠 中 | §5.2 sync 冲突清单；抽样 3-5 个移植提交核对完整性 |
| **G5｜测试与发布** | `8acb950e`（electron mock 跨文件污染修复）、v0.6.0 发布准备相关提交 | 🟢 低 | 测试隔离有效性、版本一致 |

### 1.2 明确排除（不在本次范围）

- **活跃独立分支**：`feat/workspace-task-context-labels`、`codex/task-editor-experts-ui`、`luxagents/branding`（含未同步提交）——除非用户指定，否则只做状态确认，不改动。
- **已合入但仅剩指针的分支**（`feat/agent-experts-teams`、`feat/agent-plugins-expert-tab`、`feat/codeclaw`、`feat/sync-1322-project-cwd`、`sync/upstream-v016`）：检查工作树占用，归档建议写入报告，**不实际删除**。
- **旧分支归档**：`feature/work-mode-kanban`（ahead 51/behind 522）、`feature/workspace-project-session-ia`（behind 281）——只记录建议。
- **3 个 `.claude/worktrees/` 临时会话 worktree**：不触碰。

### 1.3 边界规则

- 审查期间**不得修改业务代码**（只允许运行校验命令、读文件、写审查文档）。
- 若发现必须立即修复的问题，先记录为 P0/P1 问题，征求用户同意后再改。
- 所有命令在仓库根 `/Users/admin/Workspace/ClaudeCode/LuxAgents` 下执行（Bun 运行时）。

---

## 2. 审查顺序与依赖

```
阶段 0  基线快照与校验（§3）
   │   产出：前置校验结果表（通过/失败）
   ▼
阶段 1  未提交工作树审查（G0，§5.1）← 优先级最高
   │   产出：Outbox 专项问题清单
   ▼
阶段 2  结构级变更审查（G1/G2，§5.3）
   │   产出：codeclaw/Home 迁移核查表
   ▼
阶段 3  功能合并与 sync 移植审查（G3/G4，§5.2）
   │   产出：sync 冲突核查表 + 移植抽样结果
   ▼
阶段 4  打包/体积/仓库卫生（§5.4）
   │   产出：发布阻塞项清单
   ▼
阶段 5  人工功能验证（§3.4）
   │   产出：冒烟验证记录
   ▼
阶段 6  汇总报告（§6）+ 处置建议
       产出：审查报告（结论/问题列表/建议）
```

**依赖关系**：
- 阶段 0 未通过（typecheck/test 失败）→ 先记录基线失败项，再继续阶段 1（判断失败是否由 G0 引起）。
- 阶段 1 优先于阶段 2：未提交改动跨架构层，若它不健康，已提交部分的风险评估会失真。
- 阶段 4 依赖阶段 1/2/3 的结论（体积与打包问题可能来自 codeclaw 资源或 G0 新增模块）。
- 阶段 5 放在最后，因为需要干净可用的 build。

---

## 3. 前置校验步骤

> 目标：建立"基线是否健康"的事实。全程只读，不改代码。

### 3.1 基线快照

```bash
# 1) 记录当前 HEAD 与工作树指纹，供审查后比对
cd /Users/admin/Workspace/ClaudeCode/LuxAgents
git rev-parse HEAD
git status --short > /tmp/review_gitstatus_before.txt
git diff --stat HEAD > /tmp/review_diffstat_before.txt
git stash list   # 确认无遗漏 stash
```

### 3.2 静态校验

```bash
# 2) 全仓依赖确认（如缺包会在这里暴露）
bun install --frozen-lockfile 2>&1 | tail -20   # 或 bun install

# 3) 全仓类型检查（跨所有包）
bun run typecheck 2>&1 | tail -60
# 期望：0 error。若有 error → 记入基线失败项，并判断是否由未提交改动引起
```

### 3.3 单元测试

```bash
# 4) 全量测试
bun test 2>&1 | tail -80

# 5) 重点：Outbox 计划新增的 4 个测试文件必须单独跑，确认它们真实被执行
bun test apps/electron/src/main/lib/agent-file-roots.test.ts
bun test apps/electron/src/main/lib/agent-output-capture.test.ts
bun test apps/electron/src/main/lib/storage-service.test.ts
bun test apps/electron/src/renderer/components/agent/project-files-root.test.ts

# 6) 回归：electron mock 污染修复相关测试
bun test apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts
```

### 3.4 冒烟验证（手动，build 通过后）

```bash
# 7) renderer build（不启动完整 Electron，验证 UI 可编译）
bun run --filter='@luxcoder/electron' build:renderer 2>&1 | tail -30

# 8) 手动验证项（需要用户配合或临时 workspace）
#    a. 启动 bun run dev，确认应用可打开、Home/Code 切换正常
#    b. Code 会话绑定 Project 后，右侧 Files 展示 Project effective cwd
#    c. 新建会话写文件 → 触发 turn 结束 → 右侧 Files「本轮生成」出现 Outbox 捕获
#    d. 删除一个 Session → 确认 Outbox 文件不被删除
#    e. 设置面板确认 Context 已从插件 Tab 迁入
#    f. CodeClaw 桌面宠物可启动/隐藏/重启（v0.6.0 核心功能）
```

### 3.5 前置校验结论记录

| 检查项 | 命令 | 结果（通过/失败/跳过） | 备注 |
|--------|------|------------------------|------|
| 依赖安装 | `bun install` | | |
| 类型检查 | `bun run typecheck` | | |
| 全量测试 | `bun test` | | |
| 新增测试（4 个） | 见 §3.3-5 | | |
| renderer build | `build:renderer` | | |
| 手动冒烟 | §3.4 | | |

---

## 4. 提交审计（G1–G5 通用）

> 对每个纳入审查的提交/合并，执行以下轻量审计并记录。

```bash
# 单提交详情
git show --stat <sha>
git show --check <sha>                      # 空白/冲突标记残留检查

# merge 提交：查看冲突如何解决（重点 G3/G4 的 merge）
git show <merge-sha> --cc                     # 合并引入的净改动
git log <merge-sha>^1..<merge-sha>^2 --oneline # merge 两侧的提交列表
```

审计要点（每项勾选）：
- [ ] 提交信息是否清晰、符合 `type(scope): subject` 惯例
- [ ] `git show --check` 无冲突标记（`<<<<<<<` / `=======`）残留
- [ ] 改动是否与提交主题一致（无混入无关改动）
- [ ] 中文注释/日志约定是否遵守（AGENTS.md）
- [ ] 是否触碰 `version` 字段（日常功能提交不应 bump；v0.6.0 发布提交除外）

---

## 5. 重点风险区域检查清单

### 5.1 Outbox 计划（G0，未提交工作树）— 最高优先级

文件清单：`agent-file-roots.ts(+test)`、`agent-output-capture.ts(+test)`、`storage-boundaries.ts`、`storage-service.test.ts`、`project-files-root.ts(+test)`、`agent-orchestrator.ts`、`config-paths.ts`、`ipc.ts`、`preload/index.ts`、`packages/shared/src/types/agent.ts`、`useGlobalAgentListeners.ts`、SidePanel/LeftSidebar/AgentView/AgentMessages、`WorkspaceContextView.tsx`、`WorkspaceSettings.tsx`、`RepoWikiView/`、`active-view.ts`、`settings-tab.ts`、`tutorial.md`。

- [ ] **捕获隔离**：`agent-orchestrator.ts` 中 turn 捕获逻辑是否完全包裹在 try/catch，`finally` 中索引写入失败是否绝不影响 Agent complete/error/stopped 终态事件送达。
- [ ] **路径解析**：`agent-file-roots.ts` 覆盖 worktree、external project、managed project、历史 session sandbox 四种来源；`resolveSessionCwd` 复用是否正确。
- [ ] **IPC 合约**：`GET_SESSION_FILE_ROOTS` / `LIST_SESSION_OUTPUTS` / `OUTPUTS_CHANGED` 在主进程（ipc.ts）、preload、shared 类型、renderer 四层齐全且命名一致；主进程是否做路径校验，renderer 不自行拼接 managed workdir。
- [ ] **捕获过滤**：排除 node_modules/.git/临时目录是否到位；相同文件去重；无权限/不存在路径安全降级（不抛异常）。
- [ ] **存储边界**：`storage-boundaries.ts` + `storage-service.test.ts` 是否保证 Outbox（`workspace-files/Outbox/{sessionId}`）不被 orphan workspace 清理、Session 删除不删 Outbox。
- [ ] **索引写入**：`Outbox/index.json` 写入是原子写还是覆盖写；并发 turn 是否会互相覆盖丢失。
- [ ] **视图接入**：SidePanel「本轮生成」逻辑区、Outbox 快捷入口、`.context/plan` 快捷入口、相对文件链接/自动 reveal/Diff scope 基准路径是否全部基于主进程 File Roots。
- [ ] **原子/接口**：`active-view.ts` 新增 `workspace-context`/`repo-wiki` 枚举是否只增不改（避免破坏已有视图状态）。
- [ ] **回归**：`@` 搜索仍只指向 Workspace Files（语义不变）。

### 5.2 sync 冲突处理（G4 与上游合并）

- [ ] `825f7133` + `086f7243` 合并（sync/upstream-v016 合入 main）中，upstream Planning 模块与本地代码的冲突解决方式是否合理；`--cc` 净改动是否符合预期（无本地功能被静默覆盖）。
- [ ] 检查 upstream 移植提交是否**成对**（如"移植 + 本地适配"），是否有移植不完整（漏文件、漏 import）的迹象。
- [ ] 抽样 3-5 个移植提交（建议：#语音听写、#Settings 整页 Panel、#Pi native retry、#xAI OAuth、#Planning 快捷键）核对：目标文件存在、功能开关/入口已接入、测试未被跳过。
- [ ] **未来 sync 冲突面预判**：`afe48c6a` 删除了 agent-island（upstream 仍可能有相关修复 #1375/#1376/#1390），评估下次 `sync/proma-*` 的冲突面；确认已有冲突预案（本地结构胜出策略已在 AGENTS.md 记录）。
- [ ] `bun run sync:check`（`scripts/upstream-sync/check.ts`）当前是否通过。

### 5.3 结构变动（codeclaw / Home 分离 / SidePanel 重构）

- [ ] **agent-island 残留**：全仓 grep 确认无 `agent-island`、`AgentIsland`、`island-service` 残留引用（含 import、IPC channel、进程启动参数、文档）。
- [ ] **codeclaw 完整性**：新服务启动/停止/重启生命周期与旧灵动岛事件（planning、quota）是否对等；`3eaef62c` 桌面宠物渲染器加载逻辑正确。
- [ ] **资源体积**：calico/clawd/cloudling 三套主题资源是否均为必需；是否有可走 `.gitignore`/CDN 的大资源（26MB 宠物资源 + 1.7MB mascot）。
- [ ] **Home 模式**：`b9a161f5` 删除 MemorySettings（169 行）与 `nowledge-mem-prompt.md`（228 行）后，Home/Code 分离入口是否完整；是否有其他代码仍引用被删除文件。
- [ ] **SidePanel 重构**：333 行重构后，会话文件/项目文件两个来源的展示、Diff scope 基准路径是否正确。
- [ ] **.gitignore 方向复核**：`b9a161f5` +3 行 vs `afe48c6a` -2 行——确认删除 ignore 的 2 行不是暴露敏感/临时文件的隐患。

### 5.4 打包配置与发布

- [ ] **SDK external**：`@anthropic-ai/claude-agent-sdk` 在 esbuild 中保持 `--external`；主包 + 平台子包（darwin-arm64/darwin-x64/win32-x64）都在 `apps/electron/package.json` optionalDependencies 和 `electron-builder.yml` files 中（按 AGENTS.md 清单逐项核对）。
- [ ] **体积回归**：`bun run dist:fast` 或至少 `build` 确认打包体积增幅可接受（宠物资源 26MB 为新增）。
- [ ] **版本一致**：`apps/electron/package.json` version 与 `v0.6.0` tag 一致；无未预期的 version bump。

### 5.5 测试与卫生

- [ ] `8acb950e` 的 electron mock 跨文件污染修复有效（`bun test` 全绿佐证）。
- [ ] 新增 4 个测试文件是**真断言**（非空测试、非仅快照）；覆盖失败路径。
- [ ] 审查期间不产生新的未跟踪文件污染仓库根。

---

## 6. 审查报告模板

输出位置：`docs/reviews/2026-08-02-code-review-report.md`（若目录不存在则创建）；同时在会话内给出摘要。

```markdown
# 代码变更审查报告（2026-07-31 → 08-02）

> 审查人：<Agent/人名> ｜ 日期：2026-08-02 ｜ 基准：main @ b9a161f5

## 一、总体结论

**结论：<通过 / 有条件通过 / 不通过>**
- 未提交工作树（Outbox 计划）可否安全提交：<可 / 否，需先处理 P0-P1>
- 已合入提交可否接受：<是 / 否>
- 是否存在阻塞下次发布/下次 sync 的隐患：<是：xxx / 否>

## 二、前置校验结果

| 检查项 | 结果 | 备注 |
|--------|------|------|
| bun run typecheck | ✅/❌ | <错误数/文件> |
| bun test（全量） | ✅/❌ | <通过数/失败数> |
| 新增测试（4 个） | ✅/❌ | <逐个列出> |
| renderer build | ✅/❌ | <错误摘要> |
| 手动冒烟 | ✅/⚠️/⏭ | <覆盖项> |

## 三、问题列表

### P0（阻塞，必须修复）
- [ ] `文件:行` ｜ 问题描述 ｜ 证据（命令/输出） ｜ 建议修复

### P1（应修复，可短期处理）
- [ ] ...

### P2（建议改进，不阻塞）
- [ ] ...

## 四、分组核查结果

| 分组 | 核查项数 | 通过 | 问题数 | 关键问题 |
|------|---------|------|--------|---------|
| G0 Outbox 工作树 | 9 | x | x | |
| G1 codeclaw | 4 | x | x | |
| G2 Home/测试加固 | 2 | x | x | |
| G3 功能合并 | 3 | x | x | |
| G4 upstream 移植 | 5 | x | x | |
| G5 打包/体积 | 3 | x | x | |

## 五、处置建议

1. **提交策略**：<如：修复 P0 后分 2 个提交（Outbox 核心 + UI 视图）提交到 main>
2. **分支/工作树清理**：<建议删除的 5 个已合入分支 worktree、2 个落后分支归档——需用户确认后执行>
3. **同步预判**：<下次 sync 冲突面评估与预案>
4. **体积治理**：<26MB 宠物资源是否保留/外置>
5. **后续行动**：<建议创建的自动化任务 / 跟进项>

## 六、附：证据链

- 审查期间运行的命令与输出（追加 /tmp/review_*.log 或关键输出摘录）
- 手动冒烟操作记录
```

---

## 7. 执行注意事项

- 全程使用 `bun`，不引入 npm/pnpm。
- 对未提交工作树做任何"修改/提交"操作前，先征求用户同意。
- `git show --check`、`git status --short` 是零风险只读命令，可随时执行。
- 若 `bun test` 中途失败，先用 `--rerun-each` 或单文件复跑确认是否 flaky，再定性。
- 审查报告按模板输出，问题必须带**文件:行**与**证据**，方便后续定位。
