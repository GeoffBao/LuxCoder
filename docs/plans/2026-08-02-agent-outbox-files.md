# Agent Outbox 与 Project Files 统一实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Code 绑定 Project 时正确展示 Project effective cwd，并引入与 Synara 对齐的 `Outbox` 会话产出目录、Agent turn 捕获索引和后续 Yoda 知识库素材边界。

**Architecture:** `Session sandbox` 继续保存会话辅助文件；Project-bound Code 的相对写入继续落在 Project effective cwd；会话级 Outbox 放在 Workspace metadata 下的 `workspace-files/Outbox/{sessionId}`，避免删除 Session 时误删用户交付物。主进程统一解析 File Roots，并在每轮 Agent turn 前后捕获 Outbox、Session sandbox 和 Project cwd 的新增/修改文件，保存轻量索引供右侧 Files 与未来 Yoda 知识库使用；不复制 Project 文件、不自动搬迁历史文件。

**Tech Stack:** Electron IPC、TypeScript、React、Jotai、Bun test、JSON 文件本地存储。

---

### Task 1: 明确路径与清理契约

- 更新 `config-paths.ts`，增加只读/创建式 Outbox 路径函数。
- 更新 Agent system prompt：说明 Session sandbox、Project effective cwd、Outbox 的用途；绑定 Project 时最终项目文件仍写 Project root，Session 级交付物写绝对 Outbox。
- 更新设计文档，明确 Session 仍保存 JSONL、sandbox 辅助文件、Outbox 索引；磁盘清理不清理 Workspace metadata/Outbox，Session 删除不删除 Outbox。

### Task 2: 先写路径解析、捕获和索引的失败测试

- 增加 `agent-file-roots.test.ts`：覆盖 worktree、external project、managed project、历史 session sandbox。
- 增加 `agent-output-capture.test.ts`：覆盖新增/修改、排除 node_modules/.git、相同文件去重、无权限/不存在路径安全降级。
- 增加 storage cleanup regression test：验证 Outbox 不被 orphan workspace 清理。

### Task 3: 实现主进程 File Roots 与输出捕获

- 新增 `agent-file-roots.ts`，复用 `resolveSessionCwd` 和 `projectRepository`，返回 sessionDir、executionCwd、source、projectRoot、workspaceFilesPath、sessionOutboxPath。
- 新增 `agent-output-capture.ts`：turn 前后有限深度快照，捕获 Outbox、Session sandbox 和 Project effective cwd 的新增/修改路径；过滤大目录、临时文件和系统目录；写入 Workspace 级 `Outbox/index.json`。
- 在 `agent-orchestrator.ts` 每轮实际执行前建立快照，在 complete/error/stopped 的 finally 中捕获并持久化；捕获失败不得影响 Agent 主流程。
- 将 Outbox 索引作为未来 Yoda 知识库的素材清单，不在本次实现全文索引或 wiki-search。

### Task 4: 补齐 IPC / preload / shared contracts

- 增加 `GET_SESSION_FILE_ROOTS`、`LIST_SESSION_OUTPUTS`、`OUTPUTS_CHANGED` IPC 合约。
- 主进程做路径校验，renderer 不自行拼接 managed workdir。
- preload 暴露 typed API。

### Task 5: 接入右侧 Files

- `SidePanel` 使用主进程 File Roots；Project Files 指向 effective cwd。
- Files 内保持“会话文件 / 项目文件”两个来源；会话文件增加“本轮生成”逻辑区，展示 Outbox 文件与捕获到的 Project/Session 文件路径，不复制文件。
- 增加 Outbox 快捷入口、`.context/plan` 快捷入口，并修复相对文件链接、自动 reveal、Diff scope 的基准路径。
- `@` 仍只搜索 Workspace Files，避免改变既有语义。

### Task 6: 验证与回归

- 运行目标测试、`bun run typecheck`、`bun test`、renderer build。
- 使用临时 workspace 做手工逻辑验证：Project managed cwd 写 Markdown、写 `.context/plan`、写 Outbox、删除 Session、执行磁盘清理、刷新右侧 Files。
- 检查未修改的 Project 文件不会被 Outbox 捕获复制，捕获异常不会阻断 Agent 完成事件。
