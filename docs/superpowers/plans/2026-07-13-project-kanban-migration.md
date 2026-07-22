# Project & Kanban Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `craft-agents-max/260705-agent` 的 Projects、Task/Conductor、Kanban 与 Teambition-Kanban 能力迁移为 LuxCoder 中唯一的 Work 实现，并通过冷启动、类型检查、测试和构建验证。

**Architecture:** 以 Agent Workspace 为根，在 Shared 层定义浏览器安全的 DTO、Zod schema 和 IPC 常量；Main 层用 ProjectRepository、TaskRepository、ConductorSessionHost、TaskRunner 和 TeambitionService 负责文件持久化与运行时；Preload 暴露类型安全 API，Renderer 用 Jotai 将 Session、Project、TaskRun 和远端 binding 合并为 Kanban ViewModel。每个阶段保持可运行，所有运行日志追加写入并支持冷启动重建。

**Tech Stack:** Bun、TypeScript strict、Electron、React 18、Jotai、Radix UI、Tailwind CSS、`yaml`、Zod、`@dnd-kit/core`、Bun test。

## Global Constraints

- 权威源码为 `/Users/admin/Workspace/ClaudeCode/craft-agents-max` 的 `260705-agent` 分支，旧 WorkTask 数据不迁移。
- Project 是 Agent Workspace 的子实体；所有现有普通 Session 保留，未绑定的 Session 进入 Inbox/Backlog。
- Shared 的浏览器入口不得导出 `fs`、`path`、`crypto` 或文件存储实现；Main 才能导入 storage。
- 状态管理全部使用 Jotai；本地配置使用 JSON/YAML/JSONL，不引入本地数据库。
- 不使用 `any`；新增注释和日志优先使用中文；IPC 修改必须同步 Shared、Main、Preload、Renderer 四层。
- 只修改迁移所需文件；`README.md` 和 `AGENTS.md` 只有在用户另行明确允许后才同步。
- 修改包功能时递增受影响包 patch 版本；新增或修改 default skill 时同步递增 skill 版本，本计划不修改 default skill。
- v1 真实执行 `session` 节点和依赖图；其余控制流字段可解析和 round-trip，但 UI 不显示为已经执行的能力。
- 每个任务完成后运行该任务列出的测试，再创建一个小提交；提交前用 `git diff --check`，不纳入现有无关工作区改动。

---

## 文件边界总览

### Shared contracts and storage

- Modify: `packages/shared/src/projects/types.ts`, `packages/shared/src/projects/storage.ts`, `packages/shared/src/projects/index.ts` — Project DTO、路径、配置/资产/Memory 文件 CRUD。
- Modify: `packages/shared/src/tasks/schema.ts`, `packages/shared/src/tasks/refs.ts`, `packages/shared/src/tasks/storage.ts`, `packages/shared/src/tasks/validate.ts`, `packages/shared/src/tasks/index.ts` — TaskSpec、NodeRunState、RunLog、引用解析、原子 YAML/JSONL 存储。
- Modify: `packages/shared/src/protocol/channels.ts` — Project、Task、Session、Teambition IPC/事件 contract。
- Modify: `packages/shared/src/types/agent.ts`, `packages/shared/src/types/index.ts`, `packages/shared/package.json` — Session metadata 字段和 renderer-safe exports。
- Create: `packages/shared/src/projects/__tests__/storage.test.ts`, `packages/shared/src/tasks/__tests__/schema.test.ts`, `packages/shared/src/tasks/__tests__/storage.test.ts`。

### Main runtime

- Create or replace: `apps/electron/src/main/lib/project-repository.ts` — 以 workspace slug 定位 Project 的 Main 适配层。
- Create or replace: `apps/electron/src/main/lib/task-repository.ts` — TaskSpec、run-log、snapshot、node output 的 Main 适配层。
- Create: `apps/electron/src/main/lib/conductor-session-host.ts` — TaskRunner 与现有 AgentSessionManager/AgentOrchestrator 的唯一桥接。
- Replace: `apps/electron/src/main/lib/task-runner.ts` — DAG 调度、并发、预算、pause/resume/stop、verdict、repair、rehydrate。
- Replace: `apps/electron/src/main/lib/task-handlers.ts` — 参数校验、Project/Task/Session/Teambition handler 注册。
- Modify: `apps/electron/src/main/ipc.ts`, `apps/electron/src/main/index.ts` — handler 和冷启动恢复注册。
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`, `apps/electron/src/main/lib/agent-orchestrator.ts` — Session 字段和子会话完成事件。
- Create: `apps/electron/src/main/lib/project-repository.test.ts`, `apps/electron/src/main/lib/task-runner.test.ts`, `apps/electron/src/main/lib/conductor-session-host.test.ts`。

### Preload and Renderer

- Modify: `apps/electron/src/preload/index.ts` — 暴露 `projects`、`tasks`、`sessions`、`teambition` API 和事件订阅。
- Create or replace: `apps/electron/src/renderer/atoms/kanban-atoms.ts`, `apps/electron/src/renderer/atoms/project-atoms.ts` — Jotai state 和 optimistic rollback。
- Create: `apps/electron/src/renderer/components/app-shell/kanban/` — 从 Craft 迁移并适配 LuxCoder 主题的 Board、Column、Tile、TaskEditor、Preview、Filter、子任务组件。
- Create: `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx`, `ProjectInfoPage.tsx`, `TeambitionPicker.tsx`。
- Replace: `apps/electron/src/renderer/components/work/WorkBoardView.tsx` — 接入 App Shell、Project 面板和 Board/List。
- Create: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts`, `drag-rollback.test.ts`, `task-spec-form.test.ts`。

### Teambition and cleanup

- Replace: `apps/electron/src/main/lib/teambition-adapter.ts` — capability、claim、binding、状态/进度同步和冲突结果。
- Create: `apps/electron/src/main/lib/teambition-service.ts`, `teambition-service.test.ts`。
- Replace: `apps/electron/src/renderer/atoms/work-atoms.ts` — 只保留新 Kanban atoms，移除旧 WorkTask 状态。
- Delete after reference scan: `apps/electron/src/main/lib/work-service.ts`, `apps/electron/src/main/lib/work-task-store.ts`, 旧 Work IPC/类型、旧 Work 组件、旧 checkpoint/telemetry 和九阶段 LangGraph 文件。

## Implementation Tasks

### Task 1: Lock the migration boundary and add focused test entry points

**Files:**
- Modify: `packages/shared/package.json`, `apps/electron/package.json` only if the existing exports/scripts do not expose the new test paths.
- Create: `docs/superpowers/plans/2026-07-13-project-kanban-migration.md` (this plan).
- Test: `packages/shared/src/projects/__tests__/storage.test.ts`, `packages/shared/src/tasks/__tests__/schema.test.ts`.

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-07-13-project-kanban-migration-design.md`.
- Produces: stable test commands `bun test packages/shared/src/projects/__tests__ packages/shared/src/tasks/__tests__` and a clean list of old Work references from `rg`.

- [ ] **Step 1: Reproduce the current boundary failures**

  Run:

  ```bash
  rg -n "WorkEngine|WorkTask|work:listTasks|THO|LangGraph|@ts-nocheck" apps packages
  bun run typecheck
  ```

  Expected: the search reports the temporary Work implementation and typecheck remains green before migration changes.

- [ ] **Step 2: Add the contract/storage test directories and failing assertions**

  Add tests that import only renderer-safe types from `@luxcoder/shared/projects` and `@luxcoder/shared/tasks`, assert a duplicate node is invalid, and assert a minimal one-node spec round-trips through YAML. The tests must not import `storage.ts` through the package root.

- [ ] **Step 3: Run the focused tests and confirm the new assertions expose missing behavior**

  Run:

  ```bash
  bun test packages/shared/src/projects/__tests__ packages/shared/src/tasks/__tests__
  ```

  Expected: the new tests fail only for the behavior that will be implemented in Tasks 2 and 3; no renderer import attempts to load Node built-ins.

- [ ] **Step 4: Commit the boundary test scaffold**

  ```bash
  git diff --check
  git add packages/shared/src/projects/__tests__ packages/shared/src/tasks/__tests__
  git commit -m "test: define project and task migration boundaries"
  ```

### Task 2: Finish Shared Project contracts and storage

**Files:**
- Modify: `packages/shared/src/projects/types.ts`, `packages/shared/src/projects/storage.ts`, `packages/shared/src/projects/index.ts`.
- Create: `packages/shared/src/projects/__tests__/storage.test.ts`.
- Test: `packages/shared/src/projects/__tests__/storage.test.ts`.

**Interfaces:**
- Consumes: `ProjectConfig`, `CreateProjectInput`, `UpdateProjectInput`, `UploadProjectAssetInput`.
- Produces: `loadWorkspaceProjects(root): LoadedProject[]`, `createProject(root,input): ProjectConfig`, `updateProject(root,slug,input): ProjectConfig`, `deleteProject(root,slug): void`, `listProjectAssets(root,slug): ProjectAsset[]`, `readProjectMemory(root,slug): string`, and atomic config writes.

- [ ] **Step 1: Write failing behavior tests**

  Cover project creation with a URL-safe unique slug, config persistence, archive/unarchive, asset path sanitization, Memory file read/write, and a second same-name project receiving a different slug. Use `mkdtempSync` and remove the temporary directory in `afterEach`.

- [ ] **Step 2: Run the Project tests**

  ```bash
  bun test packages/shared/src/projects/__tests__/storage.test.ts
  ```

  Expected: FAIL on the missing or incomplete behavior, with no writes outside the test temp directory.

- [ ] **Step 3: Implement the smallest storage contract**

  Keep the existing directory layout `projects/<slug>/config.json`, `assets/`, and `MEMORY.md`. Use a temporary file plus `renameSync` for JSON writes, reject `../` and absolute asset names, keep `absolutePath` runtime-only, and preserve `archivedAt` without deleting archived data.

- [ ] **Step 4: Run tests and typecheck**

  ```bash
  bun test packages/shared/src/projects/__tests__/storage.test.ts
  bun run --filter='@luxcoder/shared' typecheck
  ```

  Expected: all Project tests PASS and the shared package typecheck exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git diff --check
  git add packages/shared/src/projects
  git commit -m "feat: add workspace project storage"
  ```

### Task 3: Finish Shared Task schema, references, and append-only run storage

**Files:**
- Modify: `packages/shared/src/tasks/schema.ts`, `packages/shared/src/tasks/refs.ts`, `packages/shared/src/tasks/storage.ts`, `packages/shared/src/tasks/validate.ts`, `packages/shared/src/tasks/index.ts`.
- Create: `packages/shared/src/tasks/__tests__/schema.test.ts`, `packages/shared/src/tasks/__tests__/storage.test.ts`.

**Interfaces:**
- Consumes: `TaskSpecSchema`, `TaskNodeSchema`, `RunLogEntry`, `NodeOutput`.
- Produces: `parseTaskYaml(text)`, `serializeTaskYaml(spec)`, `saveTaskSpec(root,spec)`, `loadTaskSpec(root,slug)`, `appendRunLog(root,slug,runId,entry)`, `readRunLog(root,slug,runId)`, `writeRunSpecSnapshot`, `readRunSpecSnapshot`, `writeNodeOutput`, `readNodeOutput`, `resolveInputRefs` and a rehydrated node-state reducer.

- [ ] **Step 1: Write failing schema and storage tests**

  Test: minimal `session` node validation, duplicate node IDs, empty session prompts, legacy `type` to `kind` normalization, YAML round-trip, atomic task file replacement, malformed JSONL line skipping, run snapshot isolation, node output persistence, and input reference resolution from completed node outputs.

- [ ] **Step 2: Run focused tests and capture expected failures**

  ```bash
  bun test packages/shared/src/tasks/__tests__/schema.test.ts packages/shared/src/tasks/__tests__/storage.test.ts
  ```

  Expected: FAIL only on uncovered contract behavior.

- [ ] **Step 3: Implement schema and storage behavior**

  Keep unsupported control-flow fields parseable, validate dependency IDs against the node set, write YAML through `task.yaml.tmp` followed by rename, append one JSON object per line, and reconstruct state by replaying entries in order. Never treat a truncated final JSONL line as a successful node.

- [ ] **Step 4: Verify Shared exports do not pull Node storage into Vite**

  ```bash
  bun run --filter='@luxcoder/shared' typecheck
  bun run --filter='@luxcoder/electron' build:renderer
  ```

  Expected: typecheck and renderer build PASS without `fs`, `path`, or `crypto` externalization errors.

- [ ] **Step 5: Commit**

  ```bash
  git diff --check
  git add packages/shared/src/tasks
  git commit -m "feat: add task schema and run persistence"
  ```

### Task 4: Publish IPC contracts and extend Session metadata safely

**Files:**
- Modify: `packages/shared/src/protocol/channels.ts`, `packages/shared/src/types/agent.ts`, `packages/shared/src/types/index.ts`, `packages/shared/package.json`.
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`, `apps/electron/src/main/lib/agent-orchestrator.ts`.
- Create: `packages/shared/src/protocol/__tests__/channels.test.ts`.

**Interfaces:**
- Consumes: Project and Task contracts from Tasks 2–3.
- Produces: `PROJECT_IPC_CHANNELS`, `TASK_IPC_CHANNELS`, `SESSION_KANBAN_IPC_CHANNELS`, `TEAMBITION_IPC_CHANNELS`, typed event payloads, and optional SessionMeta fields `projectId`, `parentSessionId`, `kanbanColumn`, `taskSlug`, `taskRunId`, `taskNodeId`, `taskNodeCount`, `taskDraft`.

- [ ] **Step 1: Write failing contract tests**

  Assert every new command has a string channel, event payloads are discriminated by `kind`, and an existing SessionMeta JSON record without new fields still parses unchanged.

- [ ] **Step 2: Run the contract tests**

  ```bash
  bun test packages/shared/src/protocol/__tests__/channels.test.ts
  ```

  Expected: FAIL until the four-layer channel contract exists.

- [ ] **Step 3: Add the channel maps and optional session fields**

  Use command names for list/get/create/update/delete Project, list/get/save/validate Task, move Session, start/pause/resume/stop TaskRun, rehydrate, and Teambition capability/claim/sync. Keep all additions optional so existing JSONL sessions remain readable.

- [ ] **Step 4: Verify import boundaries and old channel isolation**

  ```bash
  bun test packages/shared/src/protocol/__tests__/channels.test.ts
  rg -n "work:listTasks|work:getTask|work:createTask" apps/electron/src packages/shared/src
  ```

  Expected: the contract test PASS; old channels are reported only in the cleanup list, not used by new handlers or renderer code.

- [ ] **Step 5: Commit**

  ```bash
  git diff --check
  git add packages/shared/src/protocol packages/shared/src/types/agent.ts packages/shared/src/types/index.ts packages/shared/package.json apps/electron/src/main/lib/agent-session-manager.ts apps/electron/src/main/lib/agent-orchestrator.ts
  git commit -m "feat: define project task and kanban IPC contracts"
  ```

### Task 5: Implement Main Project and Task repositories plus IPC handlers

**Files:**
- Create: `apps/electron/src/main/lib/project-repository.ts`, `apps/electron/src/main/lib/task-repository.ts`.
- Replace: `apps/electron/src/main/lib/task-handlers.ts`.
- Modify: `apps/electron/src/main/ipc.ts`, `apps/electron/src/main/index.ts`.
- Create: `apps/electron/src/main/lib/project-repository.test.ts`, `apps/electron/src/main/lib/task-repository.test.ts`.

**Interfaces:**
- Consumes: Shared channels and storage from Tasks 2–4; existing workspace lookup service.
- Produces: Main-only methods `listProjects(workspaceId)`, `createProject(workspaceId,input)`, `updateProject(workspaceId,slug,input)`, `deleteProject(workspaceId,slug)`, `listTasks(workspaceId)`, `getTask(workspaceId,slug)`, `validateTask(input)`, `saveTask(workspaceId,spec)`, `listRuns(workspaceId,slug)`, and `getRunState(workspaceId,slug,runId)`.

- [ ] **Step 1: Write failing repository and handler tests**

  Test workspace isolation, invalid project slug input, missing task, invalid task rejection, successful task save, and handler responses that return serializable DTOs rather than absolute filesystem paths unless the contract explicitly marks a runtime path.

- [ ] **Step 2: Run the tests**

  ```bash
  bun test apps/electron/src/main/lib/project-repository.test.ts apps/electron/src/main/lib/task-repository.test.ts
  ```

  Expected: FAIL on missing repository methods or handler registration.

- [ ] **Step 3: Implement repositories and handlers**

  Resolve the workspace root through the existing Agent workspace manager, delegate file operations to Shared storage, validate every IPC input with Zod, and return structured `{ ok: true, data }` or `{ ok: false, code, message }` results. Do not use `@ts-nocheck`.

- [ ] **Step 4: Wire handlers through `ipc.ts` and smoke the commands**

  ```bash
  bun run --filter='@luxcoder/electron' typecheck
  bun run --filter='@luxcoder/electron' build:main
  ```

  Expected: Main bundle and typecheck PASS; no duplicate handler registration is logged during startup.

- [ ] **Step 5: Commit**

  ```bash
  git diff --check
  git add apps/electron/src/main/lib/project-repository.ts apps/electron/src/main/lib/task-repository.ts apps/electron/src/main/lib/task-handlers.ts apps/electron/src/main/ipc.ts apps/electron/src/main/index.ts apps/electron/src/main/lib/*repository.test.ts
  git commit -m "feat: add project and task main handlers"
  ```

### Task 6: Add ConductorSessionHost, TaskRunner execution, and cold-start recovery

**Files:**
- Create: `apps/electron/src/main/lib/conductor-session-host.ts`.
- Replace: `apps/electron/src/main/lib/task-runner.ts`.
- Modify: `apps/electron/src/main/lib/agent-session-manager.ts`, `apps/electron/src/main/lib/agent-orchestrator.ts`, `apps/electron/src/main/index.ts`, `apps/electron/src/main/ipc.ts`.
- Create: `apps/electron/src/main/lib/conductor-session-host.test.ts`, `apps/electron/src/main/lib/task-runner.test.ts`.

**Interfaces:**
- Consumes: `TaskSpec`, `RunLogEntry`, Session metadata contract, and existing Agent session send/stop/event APIs.
- Produces: `startTaskRun(input): Promise<TaskRunSummary>`, `pauseTaskRun(runId)`, `resumeTaskRun(runId)`, `stopTaskRun(runId)`, `rehydrateTaskRuns()`, `onTaskRunEvent(listener)`, and `ConductorSessionHost.createOrAdoptParentSession()` / `runNode()` / `stopNode()`.

- [ ] **Step 1: Write failing deterministic runner tests**

  Build a fake SessionHost and test: dependency order, `max_parallel`, input refs, retry count, pause preventing new dispatch, stop cancelling active children, token budget pause, malformed verdict re-prompt limit, repair frontier limit, and rehydrate without duplicate dispatch.

- [ ] **Step 2: Run the runner tests**

  ```bash
  bun test apps/electron/src/main/lib/task-runner.test.ts apps/electron/src/main/lib/conductor-session-host.test.ts
  ```

  Expected: FAIL until the scheduler and host contract are implemented.

- [ ] **Step 3: Implement the session host adapter**

  `ConductorSessionHost` must create or adopt one parent Session, create one child Session per runnable `session` node, pass Project context and node prompt to the existing orchestrator, listen for completion/error events, persist child metadata, and expose cancellation. Non-`session` nodes remain recorded as unsupported instead of being dispatched.

- [ ] **Step 4: Implement append-only TaskRunner state transitions**

  Replay `run-log.jsonl` into node states, schedule only ready nodes, cap parallel children, append `node-scheduled` before dispatch, append `node-spawned` after session creation, persist output before `node-finished`, and write terminal events in order. Use states `running`, `paused`, `verifying`, `repairing`, `completed`, `failed`, `stopped`.

- [ ] **Step 5: Add startup rehydration and event IPC**

  On main startup scan non-terminal runs, rebuild state from logs, compare SessionMeta, subscribe to still-running children, mark missing child sessions failed, and resume only nodes with no recorded spawn. Broadcast typed run events to renderer.

- [ ] **Step 6: Run tests, typecheck, and build Main**

  ```bash
  bun test apps/electron/src/main/lib/task-runner.test.ts apps/electron/src/main/lib/conductor-session-host.test.ts
  bun run typecheck
  bun run --filter='@luxcoder/electron' build:main
  ```

  Expected: all runner tests PASS, typecheck PASS, and main bundle builds.

- [ ] **Step 7: Commit**

  ```bash
  git diff --check
  git add apps/electron/src/main/lib/conductor-session-host.ts apps/electron/src/main/lib/task-runner.ts apps/electron/src/main/lib/agent-session-manager.ts apps/electron/src/main/lib/agent-orchestrator.ts apps/electron/src/main/index.ts apps/electron/src/main/ipc.ts apps/electron/src/main/lib/conductor-session-host.test.ts apps/electron/src/main/lib/task-runner.test.ts
  git commit -m "feat: run task DAGs through agent sessions"
  ```

### Task 7: Expose the Preload bridge and build renderer Kanban state

**Files:**
- Modify: `apps/electron/src/preload/index.ts`.
- Create or replace: `apps/electron/src/renderer/atoms/project-atoms.ts`, `apps/electron/src/renderer/atoms/kanban-atoms.ts`, `apps/electron/src/renderer/components/app-shell/kanban/types.ts`, `kanban-view-model.ts`.
- Create: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts`, `drag-rollback.test.ts`.

**Interfaces:**
- Consumes: typed Preload channels and Main run events.
- Produces: `window.electronAPI.projects`, `window.electronAPI.tasks`, `window.electronAPI.sessions`, `window.electronAPI.teambition`, `kanbanItemsAtom`, `selectedProjectIdAtom`, `boardModeAtom`, and pure `buildKanbanViewModel({projects,sessions,runs,bindings,filter})`.

- [ ] **Step 1: Write failing ViewModel and rollback tests**

  Assert ordinary unbound Sessions appear in Inbox, task-backed sessions show node progress, Project filtering excludes other projects, List and Board receive the same item order, and a failed move restores the original column and emits one error notification.

- [ ] **Step 2: Run the renderer tests**

  ```bash
  bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/kanban-view-model.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/drag-rollback.test.ts
  ```

  Expected: FAIL until atoms and pure view-model functions exist.

- [ ] **Step 3: Implement renderer-safe bridge methods**

  Every method calls one Shared channel and returns the typed result; event subscriptions return an unsubscribe function and never expose `ipcRenderer` directly. Keep file paths out of browser DTOs unless needed by an explicitly typed asset action.

- [ ] **Step 4: Implement Jotai atoms and pure merge logic**

  Keep server snapshots separate from optimistic state. `moveCardAtom` stores the previous column, applies the new column immediately, invokes `sessions.move`, and restores the snapshot on rejection. Derive Project, TaskRun, and Teambition display fields without persisting them into SessionMeta.

- [ ] **Step 5: Verify the renderer boundary**

  ```bash
  bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__
  bun run --filter='@luxcoder/electron' build:renderer
  ```

  Expected: tests PASS and Vite completes without Node built-in externalization errors.

- [ ] **Step 6: Commit**

  ```bash
  git diff --check
  git add apps/electron/src/preload/index.ts apps/electron/src/renderer/atoms/project-atoms.ts apps/electron/src/renderer/atoms/kanban-atoms.ts apps/electron/src/renderer/components/app-shell/kanban
  git commit -m "feat: expose kanban renderer state"
  ```

### Task 8: Migrate the complete Kanban and Project UI into LuxCoder App Shell

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx`, `KanbanBoardContainer.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `StatusBadge.tsx`, `SubtaskProgress.tsx`, `SubtaskRow.tsx`, `TaskChatPreview.tsx`, `TaskEditor.tsx`, `NewTaskComposer.tsx`, `KanbanProjectFilter.tsx`, `BoardListToggle.tsx`, `ModelChip.tsx`, `node-state-pill.ts`, `status-column.ts`, `subtask-merge.ts`, `task-spec-form.ts`, `kanban-colors.ts`.
- Create: `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx`, `ProjectInfoPage.tsx`.
- Replace: `apps/electron/src/renderer/components/work/WorkBoardView.tsx`.
- Modify: existing App Shell mode/content routing files only where required to mount Work mode.
- Test: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-spec-form.test.ts`, `subtask-merge.test.ts`, `node-state-pill.test.ts`.

**Interfaces:**
- Consumes: `KanbanViewModel`, atoms, Preload commands, existing LuxCoder theme and Radix primitives.
- Produces: Board/List toggle, Project search/filter, default Inbox/Todo/In Progress/Done columns, custom project columns, drag-and-drop, quick task composer, TaskEditor, child session links, ProjectInfo Sessions/Assets/Memory/Settings tabs, and ordinary Session preview.

- [ ] **Step 1: Port pure UI helpers and their failing tests**

  Port the Craft helper behavior for column grouping, status labels, subtask merge, node state pill, and task form validation. Keep labels and logs Chinese where the codebase already uses Chinese copy; use LuxCoder CSS variables rather than Craft-specific colors.

- [ ] **Step 2: Run helper tests**

  ```bash
  bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-spec-form.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/subtask-merge.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/node-state-pill.test.ts
  ```

  Expected: PASS before wiring visual components.

- [ ] **Step 3: Implement Board/List and card interactions**

  Use `@dnd-kit/core` for pointer/keyboard drag, render optimistic column changes through `moveCardAtom`, show rollback toast on failure, and keep narrow windows horizontally scrollable with one column row. A normal Session opens the existing session view; a spec-backed card opens TaskEditor.

- [ ] **Step 4: Implement Project panel and details**

  ProjectsListPanel supports search, archive visibility, create, and selection. ProjectInfoPage exposes Sessions, Assets, Memory, Settings and delegates file operations to typed IPC methods. It must not read the filesystem from React.

- [ ] **Step 5: Mount Work mode and remove the blank placeholder**

  Replace `WorkBoardView` with the composed panel, preserve Chat and Code modes, and ensure the Work route does not mount deprecated `WorkInitializer` or call old `work:*` channels.

- [ ] **Step 6: Verify renderer behavior and builds**

  ```bash
  bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__
  bun run --filter='@luxcoder/electron' typecheck
  bun run --filter='@luxcoder/electron' build:renderer
  ```

  Expected: helper and interaction tests PASS, typecheck PASS, renderer build PASS.

- [ ] **Step 7: Commit**

  ```bash
  git diff --check
  git add apps/electron/src/renderer/components/app-shell/kanban apps/electron/src/renderer/components/work apps/electron/src/renderer/components/app-shell
  git commit -m "feat: add project kanban work interface"
  ```

### Task 9: Migrate Teambition gateway, claim flow, binding, and sync states

**Files:**
- Replace: `apps/electron/src/main/lib/teambition-adapter.ts`.
- Create: `apps/electron/src/main/lib/teambition-service.ts`, `apps/electron/src/main/lib/teambition-service.test.ts`.
- Modify: `apps/electron/src/main/ipc.ts`, `apps/electron/src/preload/index.ts`.
- Create: `apps/electron/src/renderer/components/work/TeambitionPicker.tsx`, `apps/electron/src/renderer/components/work/__tests__/teambition-view.test.tsx`.
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx`, `kanban-view-model.ts`.

**Interfaces:**
- Consumes: Project/Session/Task DTOs and existing Teambition credentials/configuration.
- Produces: `probeCapabilities()`, `listClaimableTasks()`, `claimTask(idempotencyKey)`, `bindTask(sessionId,remoteId)`, `syncStatus(binding)`, `syncProgress(binding)`, `retryPendingSync(bindingId)`, and `needsReauth`/`pending`/`conflict`/`stale` display state.

- [ ] **Step 1: Write failing mock-gateway tests**

  Cover capability absence, claim idempotency, missing credentials, binding persistence, status/progress mapping, remote conflict, stale data, and reauthentication without blocking the local board.

- [ ] **Step 2: Run Teambition tests**

  ```bash
  bun test apps/electron/src/main/lib/teambition-service.test.ts
  ```

  Expected: FAIL on unimplemented service methods.

- [ ] **Step 3: Implement the service and adapter**

  Keep remote fields as a join-time binding view; never write remote card title/status into SessionMeta. Use capability checks before writes, deterministic idempotency keys for claim/comment/status operations, and append local pending/conflict records when remote writes fail.

- [ ] **Step 4: Add picker and card badges**

  TeambitionPicker claims and immediately shows the binding state; cards render remote task ID, sync state, and reauth hint without disabling local task controls.

- [ ] **Step 5: Verify Main, Renderer, and integration tests**

  ```bash
  bun test apps/electron/src/main/lib/teambition-service.test.ts apps/electron/src/renderer/components/work/__tests__/teambition-view.test.tsx
  bun run typecheck
  bun run --filter='@luxcoder/electron' build:main
  bun run --filter='@luxcoder/electron' build:renderer
  ```

  Expected: all tests and builds PASS.

- [ ] **Step 6: Commit**

  ```bash
  git diff --check
  git add apps/electron/src/main/lib/teambition-adapter.ts apps/electron/src/main/lib/teambition-service.ts apps/electron/src/main/lib/teambition-service.test.ts apps/electron/src/main/ipc.ts apps/electron/src/preload/index.ts apps/electron/src/renderer/components/work apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx apps/electron/src/renderer/components/app-shell/kanban/kanban-view-model.ts
  git commit -m "feat: integrate teambition with kanban"
  ```

### Task 10: Remove the legacy Work implementation and stale compatibility paths

**Files:**
- Delete after the reference scan: `apps/electron/src/main/lib/work-service.ts`, `apps/electron/src/main/lib/work-task-store.ts`, `packages/shared/src/types/work.ts`, old Work IPC constants/handlers, old Work atoms/components, old checkpoint/telemetry files, and unused LangGraph Work modules.
- Modify: `apps/electron/src/renderer/atoms/work-atoms.ts`, `packages/shared/src/types/index.ts`, `packages/shared/src/package.json`, `apps/electron/package.json` only where imports/exports require cleanup.
- Do not modify: `README.md` or `AGENTS.md` without separate explicit permission.

**Interfaces:**
- Consumes: all new Project/Task/Kanban interfaces from Tasks 2–9.
- Produces: one Work implementation, no old Work IPC calls, no `@ts-nocheck`, and no unused migration compatibility path.

- [ ] **Step 1: Build the reference inventory**

  ```bash
  rg -n "WorkEngine|WorkTask|work:listTasks|work:getTask|work:createTask|THO|LangGraph|checkpoint|telemetry|@ts-nocheck|临时迁移标记" apps packages
  ```

  Expected: every match is either a required new TaskRunner concept or a file listed for deletion; no unrelated Chat/Agent feature is removed.

- [ ] **Step 2: Delete legacy files and remove imports**

  Remove old handler registration, old renderer initializers, old atoms, old storage paths, and old package exports. Keep the new `tasks/` and `projects/` storage paths as the only local Work data paths. Do not add a reader for old WorkTask data.

- [ ] **Step 3: Run static cleanup checks**

  ```bash
  rg -n "WorkEngine|WorkTask|work:listTasks|work:getTask|work:createTask|THO|LangGraph|@ts-nocheck|临时迁移标记" apps packages
  git diff --check
  ```

  Expected: `rg` exits 1 with no matches, and the diff has no whitespace errors.

- [ ] **Step 4: Run full package checks**

  ```bash
  bun run typecheck
  bun test
  bun run build
  ```

  Expected: all commands exit 0. Existing unrelated baseline failures must be isolated and documented before changing any out-of-scope file.

- [ ] **Step 5: Commit cleanup**

  ```bash
  git add -- apps/electron/src/main/lib/work-service.ts apps/electron/src/main/lib/work-task-store.ts packages/shared/src/types/work.ts apps/electron/src/renderer/atoms/work-atoms.ts apps/electron/src/main/lib/task-handlers.ts apps/electron/src/main/lib/task-runner.ts packages/shared/src/types/index.ts packages/shared/package.json
  git diff --cached --check
  git commit -m "refactor: remove legacy work mode"
  ```

### Task 11: Verify Electron cold start, renderer boundary, and user-facing behavior

**Files:**
- Modify only if verification exposes a migration regression: `apps/electron/vite.config.ts`, `apps/electron/src/main/index.ts`, `apps/electron/src/preload/index.ts`, or the directly failing migration file.
- Test: application cold start and focused smoke scripts; no new test fixture may use user data.

**Interfaces:**
- Consumes: completed Project/Kanban runtime and UI.
- Produces: evidence that `bun run dev` opens a non-blank Work view and that production bundles contain no renderer Node built-in leakage.

- [ ] **Step 1: Start the split development stack**

  ```bash
  bun run --filter='@luxcoder/electron' dev:vite -- --host 127.0.0.1 --port 5173
  bun run --filter='@luxcoder/electron' build:main
  bun run --filter='@luxcoder/electron' build:preload
  ```

  Expected: Vite binds `127.0.0.1`, main/preload build, and renderer serves the application shell.

- [ ] **Step 2: Exercise the Work path**

  Open Work mode and verify: Project list loads, create/archive works, ordinary Session appears in Inbox, new task opens editor, save creates `tasks/<slug>/task.yaml`, drag persists `kanbanColumn`, run creates parent/child Sessions and JSONL logs, pause/resume/stop update badges, and reload rehydrates the run without duplicate children.

- [ ] **Step 3: Exercise Teambition degraded states**

  Verify no capability, expired credentials, pending remote write, conflict, and stale binding each leave the local board usable and show an actionable badge/message.

- [ ] **Step 4: Run final checks**

  ```bash
  bun run typecheck
  bun test
  bun run build
  bun run dev
  ```

  Expected: no blank screen, no `fs` externalization error, no old Work channel call, and no renderer console error from the migrated path.

- [ ] **Step 5: Prepare handoff**

  ```bash
  git status --short
  git log -1 --oneline
  ```

  Report changed files, test/build commands, known unrelated baseline failures, and whether README/AGENTS synchronization remains pending user permission.

## Self-Review Checklist

- [ ] Every approved spec section maps to Tasks 2–11: Project storage, Task schema/run logs, Session metadata, IPC bridge, TaskRunner, cold recovery, Kanban UI, Project details, Teambition, cleanup, and smoke verification.
- [ ] No step relies on an undefined function or channel; later tasks consume only interfaces produced by earlier tasks.
- [ ] The plan contains no unresolved placeholder instruction or vague “add appropriate handling” instruction.
- [ ] The plan preserves unrelated dirty changes and does not authorize README/AGENTS edits without explicit permission.
- [ ] The final completion gate includes typecheck, tests, build, `bun run dev`, and a renderer Node-boundary check.
