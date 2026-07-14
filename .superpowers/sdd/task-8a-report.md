# Task 8A 实施报告

日期：2026-07-14

状态：完成

提交信息：`feat: add kanban task helpers`

## 范围

本次只完成 Task 8A：三个纯 helper、对应的共享渲染类型和三组测试。不包含 Board/List、DND、TaskEditor、Project UI 或其他 Task 8B 及后续工作。

## 实现内容

### task-spec-form

- 在生成、编辑、保存往返过程中保留已有 node id，避免 `${nodes.<id>.output}` 引用失效。
- 保留多依赖 DAG 边，过滤已删除节点产生的悬空依赖，并阻止循环依赖。
- 为手工子任务生成稳定、去重的 slug。
- 保留显式 model、llmConnection、permissionMode、project floor、sources 和 skills。
- 支持 quick-add session 与 `qa-<sessionId>` node id 双向映射。
- 正确处理 acceptance criteria 和 repair 次数上限。

### subtask-merge

- 无 spec 时按创建时间展示 child session。
- 有 spec 时合并 authored node、最新 run child 和 adopted quick-add session。
- 未运行节点生成 pending 展示行；同一节点旧 run 被最新 run 折叠替代。
- 未被 spec 接纳的 child 与已移除节点的 child 保持稳定追加顺序。

### node-state-pill

- 为全部 NodeRunState 提供中文标签。
- 使用 LuxAgents 主题 token，不依赖 Craft i18n 或固定 emerald/red 色值。
- 完成、失败、运行和中性状态具有可区分样式；未知状态安全回退。

## 文件列表

新增：

- `apps/electron/src/renderer/components/app-shell/kanban/task-spec-form.ts`
- `apps/electron/src/renderer/components/app-shell/kanban/subtask-merge.ts`
- `apps/electron/src/renderer/components/app-shell/kanban/node-state-pill.ts`
- `apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-spec-form.test.ts`
- `apps/electron/src/renderer/components/app-shell/kanban/__tests__/subtask-merge.test.ts`
- `apps/electron/src/renderer/components/app-shell/kanban/__tests__/node-state-pill.test.ts`
- `.superpowers/sdd/task-8a-report.md`

修改：

- `apps/electron/src/renderer/components/app-shell/kanban/types.ts`：增加 `SubtaskRunState` 与 `KanbanSubtask`。
- `apps/electron/package.json`：仅将 `@luxagents/electron` patch version 从 `0.1.2` 更新为 `0.1.3`。

## TDD 证据

### RED

先创建三组测试，再执行：

```bash
bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-spec-form.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/subtask-merge.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/node-state-pill.test.ts
```

首次结果：退出码 `1`，`0 pass / 3 fail / 3 errors`。三个错误分别为：

- `Cannot find module '../task-spec-form'`
- `Cannot find module '../subtask-merge'`
- `Cannot find module '../node-state-pill'`

失败原因是目标 helper 尚不存在，符合预期 RED。

### GREEN

实现最小 helper 后重复同一命令，结果：

```text
35 pass
0 fail
73 expect() calls
Ran 35 tests across 3 files.
```

完成最终自审后再次 fresh 运行，仍为 `35 pass / 0 fail`。

## 完整验证

```text
bun test <三个 helper test 文件>
PASS: 35 pass / 0 fail

bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__
PASS: 42 pass / 0 fail / 87 expect() calls

bun run --filter='@luxagents/electron' typecheck
PASS: exit 0

bun run --filter='@luxagents/electron' build:renderer
PASS: Vite built 5341 modules, exit 0

git diff --check
PASS: exit 0
```

renderer build 仍输出现有的 Browserslist 数据过期与大 chunk 警告，但不影响构建成功，且不属于 Task 8A 范围。

## 自审

- 正确性：逐项核对 35 个 helper 行为；额外的 7 个既有 kanban view-model/rollback tests 也通过。
- 类型：无 `any`、`@ts-ignore` 或禁用检查；仅新增 helper 必需的渲染类型。
- 边界：覆盖 preserved id 冲突、fan-in、多次 run、删除上游节点、未知状态和 cycle guard。
- 范围：未创建任何 Task 8B 组件，未修改 MainArea、LeftSidebar、README 或 AGENTS。
- Dirty 保护：其他工作者的 package dependencies、bun.lock 与现有未提交文件均保留；提交只包含 version hunk 和本报告列出的 Task 8A 文件。
- 简化检查：当前环境没有可调用的 `code-simplifier`/subagent 工具，已按同一 checklist 完成人工可读性、重复、类型和边界审查。

## Concern

- Task 8A 只提供纯 helper，不包含 `status-column.ts`、Board/List 或视觉组件；这些明确留给 Task 8B。
- build 的 Browserslist 与 chunk-size 警告为仓库现状，不在本次修复范围。
