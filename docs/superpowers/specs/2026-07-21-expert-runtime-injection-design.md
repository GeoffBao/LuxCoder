# Agent 专家 Runtime 注入（Kanban 任务跑）设计

日期：2026-07-21  
状态：已评审（brainstorming）  
前置：`2026-07-21-projects-hub-agent-experts-design.md`（P0/P1 壳与持久化）  
范围：仅 Kanban `tasks.run` / TaskRunner 用户消息 preamble；不做 Code 会话 / 自动任务 / 飞书 / Bot / 蜂群

## 1. 问题

项目 `defaultExpertId` 与任务 `defaults.expertId` 已可配置并持久化，但 TaskRunner 跑节点时不读取专家包，角色与 `skillSlugs` 无运行时效果，用户感知为「设了没用」。

## 2. 决策摘要（已锁定）

| 决策点 | 定案 |
|--------|------|
| 覆盖面 | **仅 Kanban 任务跑**（TaskRunner.dispatch → sendMessage） |
| 注入内容 | **身份核**（IDENTITY / SOUL / RULES）+ **skill 引用提示**（与任务 `skills` 去重合并） |
| 注入落点 | **用户消息 preamble**（对齐现有 `skillsPreamble`），不改 systemPrompt / buildDynamicContext |
| 实现路径 | **shared 纯函数 + TaskRunnerDeps IO**（方案 1） |
| 本轮不做 | Skill 全文内联、Code 交互会话、自动化/飞书、蜂群、Bot |
| ~~mcpIds 注入~~ | **已接入**：专家 `mcpIds` → `sendMessage({ mentionedMcpServers })`（与 `#mcp:` 同路） |

## 3. 目标行为

```
tasks.run
  → TaskRunner.dispatch(node)
  → resolveExpertId(spec.defaults.expertId, project.defaultExpertId)
  → getExpert(expertsRoot, id)          // 缺失则 skip
  → formatExpertPreamble(expert)        // IDENTITY/SOUL/RULES XML 块
  → mergeSkillSlugs(task.skills, expert.skillSlugs)
  → skillsPreamble(merged) + expertPreamble + buildPrompt(node)
  → host.sendMessage(childSession, prompt)
```

无专家配置时：行为与现网完全一致（仅任务侧 `skillsPreamble`）。

## 4. 组件边界

| 单元 | 位置 | 职责 |
|------|------|------|
| `resolveExpertId` | `@luxcoder/shared/experts` | 任务 id 优先，否则项目 default，否则 `null` |
| `mergeSkillSlugs` | 同上 | `unique(task ∪ expert)`，任务在前、专家新增在后 |
| `formatExpertPreamble` | 同上 | 纯函数：转义 + 空段省略 + 截断；无 IO |
| `TaskRunnerDeps.getExpert?` | electron `task-runner.ts` | 读专家包；缺省视为无专家（测试友好） |
| `TaskRunnerDeps.resolveProjectDefaultExpertId?` | 同上 | `(projectId) => string \| null`；项目读失败返回 null |
| `dispatch` | TaskRunner | 拼 preamble；不改 orchestrator / systemPrompt |

专家包读写仍由既有 `expert-service.getExpert` 提供；TaskRunner 经 deps 注入，避免硬耦合盘路径。

## 5. 解析与合并规则

**`expertId`**

1. `spec.defaults.expertId` 非空 → 使用  
2. 否则若存在 `spec.project` → `resolveProjectDefaultExpertId(spec.project)`  
3. 否则 → 不注入专家块  

**skills**

- `merged = mergeSkillSlugs(spec.skills, expert?.skillSlugs)`  
- `skillsPreamble(merged)` 文案格式保持现网：`Apply these skills: [skill:a] [skill:b]\n\n`  
- 无专家时 `merged === spec.skills`（含 undefined）

## 6. 错误与截断

| 情况 | 行为 |
|------|------|
| 专家缺失或坏包 | warn 日志；跳过 `<agent_expert>`；skills 仍用任务侧（或已合并前的任务列表） |
| `getExpert` deps 未注入 | 等同无专家 |
| 项目 default 读取失败 | 跳过项目回退，不失败整次 run |
| IDENTITY / SOUL / RULES 某段为空 | 省略该节，其余照写 |

**截断：** 三文件正文合计软上限约 **12_000** 字符；超限按 **RULES → SOUL → IDENTITY** 顺序裁剪尾部，块末追加 `…(truncated)`。不做 Skill 全文内联。

## 7. Prompt 格式

```xml
<agent_expert id="architect" label="软件架构师">
  <identity>...</identity>
  <soul>...</soul>
  <rules>...</rules>
</agent_expert>
```

- 属性与正文做 XML 转义 / 控制字符剥离（对齐 `formatProjectContextForPrompt` 思路）  
- 禁止伪造闭合标签逃逸（剥离 `</agent_expert>` 等）  
- 整段置于 `skillsPreamble` 之后、节点 `buildPrompt` 之前  

## 8. 测试

**纯函数（shared）**

- `resolveExpertId`：任务优先 / 项目回退 / 皆空  
- `mergeSkillSlugs`：去重保序  
- `formatExpertPreamble`：结构、空段、截断标记、转义  

**TaskRunner（electron）**

- mock `getExpert`：消息含 `<agent_expert>` + 合并 skills  
- 专家缺失：dispatch 成功且无专家块  
- 无 deps：与现网一致  

## 9. 成功标准

1. 任务 `defaults.expertId` 有效 → 节点 `sendMessage` 含身份核与合并 skill 提示  
2. 仅项目 `defaultExpertId` 有效 → 同效  
3. 专家缺失 → 任务照跑 + warn  
4. 无专家配置 → 与现网 `skillsPreamble` 行为一致  
5. `@luxcoder/shared` / `@luxcoder/electron` patch +1；`TaskDefaultsSchema.expertId` 注释改为「Kanban TaskRunner 已注入」  

## 10. 风险

| 风险 | 缓解 |
|------|------|
| preamble 过长占 token | 12k 软上限 + 裁剪顺序 |
| 与任务 skills 重复 | merge 去重，任务优先顺序 |
| deps 未接线导致「仍无效」 | 计划里把 `tasks.run` / TaskRunner 构造处列为必做接线任务 + 回归测 |
| 误改交互会话 | 明确只改 TaskRunner.dispatch，不碰 `buildSystemPrompt` |

## 11. 预估触点文件

- `packages/shared/src/experts/prompt.ts`（新建）+ `__tests__/prompt.test.ts`  
- `packages/shared/src/experts/index.ts`（导出）  
- `packages/shared/src/tasks/schema.ts`（注释）  
- `apps/electron/src/main/lib/task-runner.ts`  
- `apps/electron/src/main/lib/task-runner.test.ts`  
- TaskRunner 构造 / `tasks.run` 接线处（注入 `getExpert` + 项目 default 查找）  
- `packages/shared/package.json` / `apps/electron/package.json` patch  

## 12. 开放项（已关闭）

- 覆盖面 → 仅 Kanban 任务跑  
- 内容深度 → 身份核 + skill 引用合并  
- 落点 → TaskRunner 用户消息 preamble  
- 实现 → shared 纯函数 + deps IO  
