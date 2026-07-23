# Migration Plan: craft-agents-oss Projects & Kanban → LuxAgents（完全体迁移）

> **SUPERPOWERS SUB-SKILL**: This plan follows the subagent-driven-development methodology.
> **输入**: 4 份文档（oss-source-reference / luxagents-context-summary / oss-kanban-research / work-mode-design）
> **前提**: 现有 Work Mode（LangGraph + WorkEngine + WorkTask）全部废弃，以 OSS v0.11.0 为唯一权威参照

**Goal**: 将 craft-agents-oss v0.11.0 的 Projects + Tasks/Conductor + Kanban 看板完整迁移到 LuxAgents，替换现有的 Work Mode 实现。所有维度以 OSS 为准。

**Architecture**: Project 为 workspace 级一等实体（文件系统持久化），Task（task.yaml + Conductor DAG 引擎）为可执行的自动化任务，Kanban 为通用看板展示层（含 @dnd-kit 完整拖拽）。Session 通过 projectId/kanbanColumn/taskSlug 等字段参与看板编排。现有 Work Mode（LangGraph 九阶段状态机、WorkEngine、WorkTask 类型）整体退役。

**Tech Stack**: Bun, TypeScript, React, Jotai, Tailwind CSS, Radix UI, **@dnd-kit**（新增）, **zod**（新增）, **js-yaml**（新增）

---

## Global Constraints

从 AGENTS.md / CLAUDE.md 提取：

- 状态管理全部用 Jotai
- 无本地数据库，纯 JSON/JSONL 文件
- 四层 IPC 模式（类型常量→ipcMain.handle→preload contextBridge→window.electronAPI.*）
- UI 组件走 ShadcnUI, Radix UI, Tailwind CSS
- 中文注释+日志
- 导入用 `.ts` 扩展名，module: "Preserve"
- 新增 IPC 通道需同步修改四层位置
- Bundler: esbuild (main/preload) + Vite (renderer)
- 不允许 TBD/TODO 占位符
- Bun workspace monorepo（`@luxagents/*` 命名空间）

---

## 新增依赖

| 包 | 版本 | 用途 | 安装位置 |
|---|---|---|---|
| `@dnd-kit/core` | ^6.3.1 | 看板拖拽核心 | `apps/electron` |
| `@dnd-kit/sortable` | ^10.0.0 | 列内排序 | `apps/electron` |
| `@dnd-kit/utilities` | ^3.2.2 | 拖拽工具函数 | `apps/electron` |
| `zod` | ^3.23.0 | task.yaml schema 校验 | `packages/shared` |
| `js-yaml` | ^4.1.0 | task.yaml 读写 | `packages/shared` |
| `@types/js-yaml` | ^4.0.9 | YAML 类型定义 | `packages/shared` (dev) |

```bash
cd packages/shared && bun add zod js-yaml && bun add -d @types/js-yaml
cd apps/electron && bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## 架构决策：完全体 OSS 迁移

| OSS 维度 | 迁移决策 | 理由 |
|----------|----------|------|
| **Project 实体** | ✅ 完整照搬 | 文件系统持久化，零技术障碍 |
| **Kanban 组件（含 @dnd-kit 拖拽）** | ✅ 完整照搬 | @dnd-kit 是纯 React 库，`bun add` 即用 |
| **Task Spec（task.yaml + Zod schema）** | ✅ 完整照搬 | Zod 纯 JS 无原生编译依赖 |
| **TaskRunner / Conductor DAG** | ✅ 完整迁移 | 纯 TS 逻辑~600行，ConductorSessionHost 同进程包裹 agent-session-manager |
| **Session 扩展字段** | ✅ 完整照搬 | 8个 Conductor 字段全部迁移 |
| **TaskEditor（~1350行）** | ✅ 完整照搬 | IPC 调用用 window.electronAPI.* 重写 |
| **Teambition 通道** | ✅ 完整照搬 | 7个 TW 通道以 ipcMain.handle 注册 |

### 困难点攻克方案

| 困难点 | 解法 |
|--------|------|
| **ConductorSessionHost ↔ SessionManager** | 不走 IPC——TaskRunner 在 Electron 主进程中运行，直接包裹 agent-session-manager.ts 和 agent-orchestrator.ts，同进程调用 |
| **@dnd-kit 依赖安装** | `bun add` 即用——纯 React 组件，无原生依赖 |
| **zod 在 renderer 中使用** | zod v3 纯 JS，Tree-shakeable，~12KB gzipped |
| **js-yaml 跨包依赖** | 仅在 `packages/shared` 中依赖，通过 exports 暴露 |
| **Session 推送（pushTyped → webContents.send）** | 在 renderer 端用 `ipcRenderer.on` 订阅 |

---

## 废弃清单

| 现有模块 | 处置 |
|----------|------|
| `packages/shared/src/types/work.ts` | 删除 — OSS TaskSpec 替代 |
| `apps/electron/src/main/lib/work-graph.ts` | 删除 — TaskRunner 替代 |
| `apps/electron/src/main/lib/work-engine.ts` | 删除 — task-handlers + TaskRunner |
| `apps/electron/src/renderer/components/work/` | 删除 — OSS kanban/ 组件 |
| `apps/electron/src/renderer/atoms/work-atoms.ts` | 删除 — OSS kanban-atoms.ts |
| `~/.luxagents/work-tasks.json` | 删除 — tasks/<slug>/task.yaml |
| `~/.luxagents/work-checkpoints/` | 删除 — tasks/<slug>/runs/ |
| `~/.luxagents/work-telemetry.jsonl` | 删除 — run-log.jsonl |
| THO 契约 (tho-assembler.ts) | 删除 — Conductor 直接构建 prompt |
| LangGraph.js 依赖 | 移除 — Conductor 自写 DAG |

---

## 完整文件清单

### 删除文件（8个）

| # | 文件 |
|---|---|
| D1 | `packages/shared/src/types/work.ts` |
| D2 | `apps/electron/src/main/lib/work-graph.ts` |
| D3 | `apps/electron/src/main/lib/work-engine.ts` |
| D4 | `apps/electron/src/main/lib/work-task-service.ts`（若存在）|
| D5 | `apps/electron/src/renderer/components/work/`（整个目录）|
| D6 | `apps/electron/src/renderer/atoms/work-atoms.ts`（若存在）|
| D7 | `~/.luxagents/work-*`（运行时清理）|

### 新建文件 — SHARED 层（13个，照搬为主）

| # | 目标文件（LuxAgents） | 方式 | OSS 源文件 |
|---|---|---|---|
| S1 | `packages/shared/src/projects/types.ts` | 照搬 | projects/types.ts |
| S2 | `packages/shared/src/projects/storage.ts` | 照搬* | projects/storage.ts |
| S3 | `packages/shared/src/projects/index.ts` | 照搬 | projects/index.ts |
| S4 | `packages/shared/src/tasks/schema.ts` | 照搬 | tasks/schema.ts |
| S5 | `packages/shared/src/tasks/refs.ts` | 照搬 | tasks/refs.ts |
| S6 | `packages/shared/src/tasks/validate.ts` | 照搬 | tasks/validate.ts |
| S7 | `packages/shared/src/tasks/storage.ts` | 照搬* | tasks/storage.ts |
| S8 | `packages/shared/src/tasks/generator-prompt.ts` | 照搬 | tasks/generator-prompt.ts |
| S9 | `packages/shared/src/tasks/index.ts` | 照搬 | tasks/index.ts |
| S10 | `packages/shared/src/protocol/channels.ts` | 改写 | protocol/channels.ts |
| S11 | `packages/shared/src/sessions/ISessionManager.ts` | 照搬 | session-manager-interface.ts |

*S2 适配点: atomicWriteFileSync → Bun.write()；*S7 适配点: yaml 包 → js-yaml

### 新建文件 — MAIN 层（4个，全部改写）

| # | 目标文件 | 方式 |
|---|---|---|
| S12 | `apps/electron/src/main/lib/task-runner.ts` | 改写 — ConductorSessionHost 包裹 agent-session-manager |
| S13 | `apps/electron/src/main/lib/task-handlers.ts` | 改写 — RPC→IPC，合并 projects+tasks handlers |
| S14 | `apps/electron/src/main/lib/teambition-handlers.ts` | 改写 — 7个 TW 通道 |
| S15 | `apps/electron/src/main/lib/project-storage.ts` | 照搬 — 文件系统 CRUD |

### 新建文件 — RENDERER 层（21个）

| # | 目标文件 | 方式 |
|---|---|---|
| S16 | `renderer/atoms/kanban-atoms.ts` | 照搬 |
| S17 | `renderer/components/kanban/types.ts` | 照搬 |
| S18 | `renderer/components/kanban/kanban-colors.ts` | 照搬 |
| S19 | `renderer/components/kanban/status-column.ts` | 照搬 |
| S20 | `renderer/components/kanban/KanbanBoardContainer.tsx` | 改写 — IPC |
| S21 | `renderer/components/kanban/KanbanBoard.tsx` | 照搬 |
| S22 | `renderer/components/kanban/KanbanColumn.tsx` | 照搬 |
| S23 | `renderer/components/kanban/TaskTile.tsx` | 照搬 |
| S24 | `renderer/components/kanban/TaskEditor.tsx` | 改写 — IPC |
| S25 | `renderer/components/kanban/task-spec-form.ts` | 照搬 |
| S26 | `renderer/components/kanban/subtask-merge.ts` | 照搬 |
| S27 | `renderer/components/kanban/SubtaskRow.tsx` | 照搬 |
| S28 | `renderer/components/kanban/SubtaskProgress.tsx` | 照搬 |
| S29 | `renderer/components/kanban/ModelChip.tsx` | 改写* |
| S30 | `renderer/components/kanban/StatusBadge.tsx` | 照搬 |
| S31 | `renderer/components/kanban/NewTaskComposer.tsx` | 照搬 |
| S32 | `renderer/components/kanban/BoardListToggle.tsx` | 照搬 |
| S33 | `renderer/components/kanban/KanbanProjectFilter.tsx` | 照搬 |
| S34 | `renderer/components/kanban/TaskChatPreview.tsx` | 照搬 |
| S35 | `renderer/components/projects/ProjectsListPanel.tsx` | 改写 — IPC |
| S36 | `renderer/components/projects/ProjectInfoPage.tsx` | 改写 — IPC |

*S29 适配点: provider icon 路径替换

### 修改文件（8个）

| # | 文件 | 改动 |
|---|---|---|
| M1 | `packages/shared/src/sessions/types.ts` | 追加 8 个 Conductor 字段 |
| M2 | `packages/shared/src/types/index.ts` | 移除 work.ts，追加 projects+tasks+channels |
| M3 | `packages/shared/package.json` | 追加 zod/js-yaml 依赖 + exports |
| M4 | `apps/electron/src/main/lib/agent-session-manager.ts` | 新增 setKanbanColumn/setProjectId/setTaskNodeCount 等方法 |
| M5 | `apps/electron/src/main/ipc.ts` | 注册 9+11+7 = 27 个 IPC handlers |
| M6 | `apps/electron/src/preload/index.ts` | 暴露 projects/tasks/teambition/sessionCommand API |
| M7 | `apps/electron/src/renderer/components/tabs/MainArea.tsx` | cowork → KanbanBoardContainer |
| M8 | `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | cowork → ProjectsListPanel |

### 统计

| 操作 | 数量 |
|------|------|
| 删除文件 | 8 |
| 新建照搬 | 25 |
| 新建改写 | 11 |
| 修改文件 | 8 |
| **总计** | **52** |

---

## Task 0: 依赖安装 + 旧 Work Mode 清理

### Step 1: 安装依赖

```bash
cd packages/shared && bun add zod js-yaml && bun add -d @types/js-yaml
cd apps/electron && bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Step 2: 删除旧文件

```bash
rm packages/shared/src/types/work.ts
rm apps/electron/src/main/lib/work-graph.ts
rm apps/electron/src/main/lib/work-engine.ts
rm -rf apps/electron/src/renderer/components/work/
rm apps/electron/src/renderer/atoms/work-atoms.ts
```

### Step 3: 清理 shared exports

在 `packages/shared/src/types/index.ts` 中删除 `export * from './work'` 行。

### Step 4: 类型检查

```bash
cd packages/shared && bun run typecheck 2>&1 | grep -i "work" | head -10
```

预期 0 残留引用。

---

## Task 1: Project 类型 + 存储（SHARED）

**Files**: S1 `packages/shared/src/projects/types.ts`（Create, 照搬）
S2 `packages/shared/src/projects/storage.ts`（Create, 照搬*）
S3 `packages/shared/src/projects/index.ts`（Create, 照搬）
M2 `packages/shared/src/types/index.ts`（Modify, 追加 export）
M3 `packages/shared/package.json`（Modify, 追加 exports）

### types.ts — 完整照搬

```typescript
// packages/shared/src/projects/types.ts
export interface KanbanColumnDef {
  id: string;
  name: string;
  dropStatusId?: string;
  color?: string;
}

export interface ProjectConfig {
  id: string;
  slug: string;
  name: string;
  description?: string;
  workingDirectory?: string;
  details?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  kanbanColumns?: KanbanColumnDef[];
}

export interface ProjectAsset {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: number;
  absolutePath: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  workingDirectory?: string;
  details?: string;
  color?: string;
}

export interface LoadedProject {
  config: ProjectConfig;
  folderPath: string;
  assetsPath: string;
  workspaceRootPath: string;
}

export interface ProjectPromptContext {
  name: string;
  description?: string;
  details?: string;
  assetsPath: string;
  assets: { filename: string; mimeType: string; sizeBytes: number }[];
  memoryPath: string;
  memoryContent?: string;
}

export interface UploadProjectAssetInput {
  filename: string;
  base64?: string;
  text?: string;
  sourcePath?: string;
}
```

### storage.ts — 照搬 OSS，适配点

- `atomicWriteFileSync(path, data)` → `Bun.write(path, data)`（Bun 原生原子写）
- `toPortablePath(p)` → 直接返回 p（Electron 环境路径一致）
- 所有 `readJsonFileSafe` → `JSON.parse(readFileSync(path, 'utf-8'))` 包裹 try/catch

完整导出 20+ 函数：`getWorkspaceProjectsPath` / `getProjectPath` / `getProjectAssetsPath` / `getProjectMemoryPath` / `ensureProjectsDir` / `ensureProjectAssetsDir` / `loadProjectConfig` / `saveProjectConfig` / `loadProjectMemory` / `loadProject` / `loadProjectById` / `loadWorkspaceProjects` / `generateProjectSlug` / `createProject` / `updateProject` / `deleteProject` / `projectExists` / `sanitizeAssetFilename` / `listProjectAssets` / `uploadProjectAsset` / `deleteProjectAsset`

（完整实现见 OSS 源文件 `packages/shared/src/projects/storage.ts`，约 180 行）

---

## Task 2: Task Spec + DAG Schema（SHARED）

**Files**: S4-S9（6 Create, 全部照搬 OSS）

| 文件 | 行数 | 说明 |
|------|------|------|
| `tasks/schema.ts` | ~220 | Zod schema: TaskSpec / TaskNode / 枚举类常量 / parseTaskSpec |
| `tasks/refs.ts` | ~80 | `${nodes.X.output}` 引用解析 + interpolateRefs |
| `tasks/validate.ts` | ~100 | 图验证: 环检测 / dangling depends_on / validateTaskInput |
| `tasks/storage.ts` | ~200 | task.yaml + run-log 持久化 |
| `tasks/generator-prompt.ts` | ~80 | Prompt 模板: buildGeneratorPrompt / buildRepairPrompt |
| `tasks/index.ts` | ~10 | Barrel 导出 |

**唯一适配**: `storage.ts` 中的 `import { parse, stringify } from 'yaml'` → `import yaml from 'js-yaml'`，相应调整 `yaml.parse()` / `yaml.dump()` 调用。

---

## Task 3: Protocol Channels 常量

**File**: S10 `packages/shared/src/protocol/channels.ts`（Create, 改写）

```typescript
// packages/shared/src/protocol/channels.ts
export const PROJECT_IPC_CHANNELS = {
  GET:        'projects:get',
  GET_ONE:    'projects:getOne',
  CREATE:     'projects:create',
  UPDATE:     'projects:update',
  DELETE:     'projects:delete',
  LIST_ASSETS:  'projects:listAssets',
  UPLOAD_ASSET: 'projects:uploadAsset',
  DELETE_ASSET: 'projects:deleteAsset',
  CHANGED:    'projects:changed',
} as const;

export const TASK_IPC_CHANNELS = {
  VALIDATE:     'tasks:validate',
  CREATE:       'tasks:create',
  GENERATE:     'tasks:generate',
  GENERATED:    'tasks:generated',
  RUN:          'tasks:run',
  PAUSE:        'tasks:pause',
  RESUME:       'tasks:resume',
  STOP:         'tasks:stop',
  GET:          'tasks:get',
  LIST:         'tasks:list',
  GET_RESULTS:  'tasks:getResults',
} as const;

export const TEAMBITION_IPC_CHANNELS = {
  LIST_TASKS:    'teambition:listMyTasks',
  CLAIM_TASK:    'teambition:claimTask',
  GET_BINDING:   'teambition:getBinding',
  CAPABILITIES:  'teambition:capabilities',
  SYNC_PROGRESS: 'teambition:syncProgress',
  UPDATE_STATUS: 'teambition:updateStatus',
  BIND_PROJECT:  'teambition:bindProject',
} as const;

export const SESSION_COMMAND_CHANNEL = 'session:command' as const;
```

---

## Task 4: TaskRunner DAG 引擎（MAIN）

**File**: S12 `apps/electron/src/main/lib/task-runner.ts`（Create, 改写）

### 核心接口

```typescript
// ConductorSessionHost — TaskRunner 所需的宿主能力
export interface ConductorSessionHost {
  createSession(workspaceId: string, options: CreateSessionOptions): Promise<{ id: string }>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  setSessionStatus(sessionId: string, status: string): Promise<void>;
  setKanbanColumn(sessionId: string, column: string | null): Promise<void>;
  setTaskNodeCount(sessionId: string, count: number): Promise<void>;
  cancelProcessing(sessionId: string, silent?: boolean): Promise<void>;
  onSessionComplete(listener: (evt: SessionCompletionEvent) => void): () => void;
  getSessionFinalText(sessionId: string): string | undefined;
  getSessionWorkingDirectory(sessionId: string): string | undefined;
}

export interface TaskRunnerDeps {
  host: ConductorSessionHost;
  workspaceId: string;
  workspaceRoot: string;
  summarize?: (text: string) => Promise<string>;
  defaultMaxParallel?: number;
  now?: () => string;
  genRunId?: () => string;
}

export interface RunOptions {
  orchestratorSessionId?: string;
  params?: Record<string, unknown>;
  runId?: string;
  verifyOnComplete?: boolean;
}

export class TaskRunner {
  constructor(deps: TaskRunnerDeps);
  run(slug: string, opts?: RunOptions): RunSnapshot;
  pause(slug: string, runId: string): void;
  resume(slug: string, runId: string): void;
  stop(slug: string, runId: string): Promise<void>;
  getRunState(slug: string, runId: string): RunSnapshot | null;
  waitUntilSettled(slug: string, runId: string): Promise<RunSnapshot>;
}
```

### LuxAgentsConductorHost（同进程包裹）

```typescript
import { agentSessionManager } from './agent-session-manager';
import { agentOrchestrator } from './agent-orchestrator';

class LuxAgentsConductorHost implements ConductorSessionHost {
  async createSession(workspaceId: string, options: CreateSessionOptions) {
    const session = await agentSessionManager.createSession(workspaceId, options);
    return { id: session.id };
  }
  async sendMessage(sessionId: string, message: string) {
    await agentOrchestrator.startSession(sessionId, message);
  }
  async setSessionStatus(sessionId: string, status: string) {
    await agentSessionManager.setSessionStatus(sessionId, status);
  }
  async setKanbanColumn(sessionId: string, column: string | null) {
    await agentSessionManager.setKanbanColumn(sessionId, column);
  }
  async setTaskNodeCount(sessionId: string, count: number) {
    await agentSessionManager.setTaskNodeCount(sessionId, count);
  }
  async cancelProcessing(sessionId: string, _silent?: boolean) {
    await agentOrchestrator.cancelProcessing(sessionId);
  }
  onSessionComplete(listener: (evt: SessionCompletionEvent) => void) {
    return agentOrchestrator.onSessionComplete(listener);
  }
  getSessionFinalText(sessionId: string) {
    return agentSessionManager.getSessionFinalText(sessionId);
  }
  getSessionWorkingDirectory(sessionId: string) {
    return agentSessionManager.getSessionWorkingDirectory(sessionId);
  }
}
```

ActiveRun 内部状态机（~600 行）完整照搬 OSS：调度循环 / max_parallel / dispatch / onSessionComplete / 故障重试 / token_budget / 验证门 / Verdict 解析 / repair frontier / hydrate 恢复。

---

## Task 5: Task + Project IPC Handlers（MAIN）

**Files**: S13 `apps/electron/src/main/lib/task-handlers.ts`（Create, ~600行）
S14 `apps/electron/src/main/lib/teambition-handlers.ts`（Create, ~100行）
S15 `apps/electron/src/main/lib/project-storage.ts`（Create, ~180行, 照搬）
M5 `apps/electron/src/main/ipc.ts`（Modify, 注册27个handlers）

### task-handlers.ts 核心结构

```typescript
// 9 个 Project handlers + 11 个 Task handlers + 1 个 Session Command handler

import { ipcMain, BrowserWindow } from 'electron';
import { PROJECT_IPC_CHANNELS, TASK_IPC_CHANNELS } from '@luxagents/shared';
import { loadWorkspaceProjects, createProject, updateProject, deleteProject /* ... */ } from './project-storage';
import { parseTaskYaml, saveTaskSpec, loadTaskSpec, listTaskSlugs } from '@luxagents/shared';
import { TaskRunner, LuxAgentsConductorHost } from './task-runner';

const runners = new Map<string, TaskRunner>();

function getRunnerFor(workspaceRoot: string, workspaceId: string): TaskRunner {
  const key = workspaceId;
  if (!runners.has(key)) {
    const host = new LuxAgentsConductorHost();
    runners.set(key, new TaskRunner({ host, workspaceId, workspaceRoot }));
  }
  return runners.get(key)!;
}

export function registerTaskHandlers(mainWindow: BrowserWindow): void {
  const broadcastProjectsChanged = (workspaceRoot: string, workspaceId: string) => {
    const projects = loadWorkspaceProjects(workspaceRoot);
    mainWindow.webContents.send(PROJECT_IPC_CHANNELS.CHANGED, workspaceId, projects);
  };

  // ========== Projects: 9 handlers ==========
  // GET: loadWorkspaceProjects → []
  // GET_ONE: loadProject || loadProjectById
  // CREATE: createProject + broadcastChanged
  // UPDATE: updateProject + broadcastChanged
  // DELETE: deleteProject + broadcastChanged
  // LIST_ASSETS: listProjectAssets
  // UPLOAD_ASSET: uploadProjectAsset + broadcastChanged
  // DELETE_ASSET: deleteProjectAsset + broadcastChanged

  // ========== Tasks: 11 handlers ==========
  // VALIDATE: parseTaskYaml → { valid, errors }
  // CREATE: parse + save + create orchestrator session + applyTaskLabel → { slug, orchestratorSessionId, validation }
  // GENERATE: 异步: createSession(taskDraft) → sendMessage(buildGeneratorPrompt) → pushTyped on complete
  // RUN: runner.run(slug, opts) → RunSnapshot
  // PAUSE/RESUME/STOP: 代理到 runner
  // GET: loadTaskSpec + runner.getRunState
  // LIST: listTaskSlugs
  // GET_RESULTS: readRunLog + readNodeOutput + readRunSpecSnapshot

  // ========== Session Command: 1 handler ==========
  // 'session:command': setKanbanColumn / setSessionStatus / setProjectId
}
```

---

## Task 6: Session 字段扩展

**Files**: M1 `packages/shared/src/sessions/types.ts`（Modify）
S11 `packages/shared/src/sessions/ISessionManager.ts`（Create, 照搬）
M4 `apps/electron/src/main/lib/agent-session-manager.ts`（Modify）

### types.ts 追加字段

在 `SessionConfig` 接口中追加：

```typescript
// —— Projects & Kanban ——
projectId?: string;
kanbanColumn?: string;
parentSessionId?: string;

// —— Tasks Conductor ——
taskSlug?: string;
taskRunId?: string;
taskNodeId?: string;
taskNodeCount?: number;
taskDraft?: boolean;
```

### agent-session-manager.ts 新增方法

```typescript
async setKanbanColumn(sessionId: string, column: string | null): Promise<void>
async setSessionProjectId(sessionId: string, projectId: string): Promise<void>
async setTaskNodeCount(sessionId: string, count: number): Promise<void>
async adoptGeneratedTaskOrchestrator(sessionId: string, taskSlug: string, reconcile?: {...}): Promise<boolean>
async bindExistingSessionToTask(sessionId: string, taskSlug: string, reconcile?: {...}): Promise<boolean>
getSessionFinalText(sessionId: string): string | undefined
getSessionWorkingDirectory(sessionId: string): string | undefined
```

---

## Task 7: Preload 桥接

**File**: M6 `apps/electron/src/preload/index.ts`（Modify）

在现有 `contextBridge.exposeInMainWorld` 中追加三组 API：

```typescript
// projects: 9 methods (list/get/create/update/delete/listAssets/uploadAsset/deleteAsset/onChanged)
// tasks: 12 methods (validate/create/generate/onGenerated/run/pause/resume/stop/get/list/getResults)
// sessionCommand: 1 method
// teambition: 7 methods
```

完整接口签名见 preload/index.ts 最终实现。

---

## Task 8: Kanban Jotai Atoms

**File**: S16 `apps/electron/src/renderer/atoms/kanban-atoms.ts`（Create, 照搬）

```typescript
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { KanbanColumnId } from '@/components/kanban/types';

export const kanbanProjectFilterAtom = atom<string[]>([]);
export const kanbanEditorTargetAtom = atom<TaskEditorTarget | null>(null);
export const kanbanColumnColorsAtom = atomWithStorage<Partial<Record<KanbanColumnId, string>>>('lux-kanban-column-colors', {});
export const kanbanLivePulseAtom = atomWithStorage<boolean>('lux-kanban-live-pulse', true);
export const kanbanColumnStatusAtom = atomWithStorage<Partial<Record<KanbanColumnId, string>>>('lux-kanban-column-status', {});
```

---

## Task 9: Kanban 核心组件（6个，照搬）

**Files**: S17-S22

| 文件 | 说明 |
|------|------|
| `kanban/types.ts` | KanbanTask / KanbanSubtask / KanbanProject / KanbanColumnMeta / TaskEditorTarget / TeambitionViewFields |
| `kanban/kanban-colors.ts` | DEFAULT_KANBAN_COLUMN_COLORS: { todo, in-progress, done } |
| `kanban/status-column.ts` | KANBAN_COLUMNS 常量 + statusToColumn() 函数 |
| `KanbanBoard.tsx` | DndContext + DragOverlay + 列级布局 |
| `KanbanColumn.tsx` | useDroppable + 列头(=重命名/换色/删除) + DraggableTile |
| `TaskTile.tsx` | useDraggable + 展开/收起子任务 + ContextMenu + 状态变更 |

全部照搬 OSS，仅替换 import 路径（`@craft-agent/*` → `@luxagents/*`）。

---

## Task 10: Kanban 子组件（9个，照搬）

**Files**: S25-S33

SubtaskRow / SubtaskProgress / ModelChip（替换 provider icon 路径）/ StatusBadge / NewTaskComposer / BoardListToggle / KanbanProjectFilter / TaskChatPreview / subtask-merge

全部照搬 OSS。

---

## Task 11: TaskEditor + task-spec-form（大文件）

**Files**: S24 `TaskEditor.tsx`（Create, 改写 IPC, ~1350行）
S25 `task-spec-form.ts`（Create, 照搬）

### TaskEditor IPC 调用映射

| OSS 调用 | LuxAgents 等效 |
|---|---|
| `window.electronAPI.generateTask(wsId, req)` | `window.electronAPI.tasks.generate(wsId, req)` |
| `window.electronAPI.onTaskGenerated(cb)` | `window.electronAPI.tasks.onGenerated(cb)` |
| `window.electronAPI.createTask(wsId, {yaml,...})` | `window.electronAPI.tasks.create(wsId, {yaml,...})` |
| `window.electronAPI.runTask(wsId, slug, runId)` | `window.electronAPI.tasks.run(wsId, slug, {runId})` |
| `window.electronAPI.getTask(wsId, slug)` | `window.electronAPI.tasks.get(wsId, slug)` |
| `window.electronAPI.getTaskResults(wsId, slug)` | `window.electronAPI.tasks.getResults(wsId, slug)` |

两种模式完整保留：
- **Manual**: 手工编辑 DAG 节点（SubtaskCard × N）
- **Generate**: `buildGeneratorPrompt(goal, title)` → LLM 自动生成 task.yaml → `onTaskGenerated` 事件 → 填充表单

---

## Task 12: Project UI

**Files**: S35 `ProjectsListPanel.tsx`（Create, 改写 IPC）
S36 `ProjectInfoPage.tsx`（Create, 改写 IPC）

### ProjectsListPanel

三态：空态（引导新建）/ 列表态（ProjectRow × N）/ 右键菜单（删除/跳转）

IPC 调用：`window.electronAPI.projects.get/getOne/delete/onChanged`

### ProjectInfoPage

三 Tab：Sessions（绑定到此项目的会话）/ Assets（上传/删除/清单）/ Settings（名称/描述/颜色）

---

## Task 13: KanbanBoardContainer 核心编排（大文件）

**File**: S20 `KanbanBoardContainer.tsx`（Create, 改写 IPC, ~623行）

核心职责：
1. **Session → KanbanTask 映射**: 从 SessionMeta 数组构建 KanbanTask 展示模型
2. **deriveRunState**: 子 Session 状态 → SubtaskRunState（done/running/pending/failed）
3. **buildModelCatalog**: LlmConnections → KanbanModelProviderGroup[]
4. **mergeSubtaskRows**: specNodes + children → KanbanSubtask[]（合成行 + 最近运行行）
5. **handleCreateTask/handleMoveTask/handleRunSubtasks**: CRUD + Conductor 触发
6. **项目过滤**: kanbanProjectFilterAtom → activeColumns → 动态列

IPC 调用全部改为 `window.electronAPI.tasks.*` 和 `window.electronAPI.sessionCommand()`。

---

## Task 14: MainArea + LeftSidebar 接入

**Files**: M7 `MainArea.tsx`（Modify）
M8 `LeftSidebar.tsx`（Modify）

### MainArea — 替换 cowork 渲染

```tsx
// 替换
import { KanbanBoardContainer } from '@/components/kanban/KanbanBoardContainer';

// 渲染
{appMode === 'cowork' ? <KanbanBoardContainer /> : /* 原逻辑 */}
```

### LeftSidebar — 替换侧边栏

```tsx
import { ProjectsListPanel } from '@/components/projects/ProjectsListPanel';

{mode === 'cowork' && (
  <ProjectsListPanel
    workspaceId={activeWorkspaceId ?? ''}
    className="flex-1"
  />
)}
```

---

## Task 15: Mock 数据 + 测试

**Files**: 
`apps/electron/src/renderer/dev/mock-kanban-data.ts`（Create, 改写模型ID）
`apps/electron/src/main/lib/__tests__/task-runner.test.ts`（Create）
`apps/electron/src/main/lib/__tests__/task-handlers.test.ts`（Create）

### mock-kanban-data.ts

照搬 OSS playground mock 数据，模型 ID 替换：
```
claude-opus-4-7 → claude-sonnet-4-5
claude-sonnet-4-6 → claude-haiku-4-5
```

### task-runner.test.ts

```typescript
// Mock ConductorSessionHost（内存实现）
// 测试：
//   1. 线性 DAG (a → b → c) 调度
//   2. 并行 DAG (a → b, a → c) max_parallel=2
//   3. 故障重试 (retry.when=['error'], retry.max=2)
//   4. 验证门 PASS/FAIL
//   5. repair frontier 正确性
//   6. hydrate 恢复
```

---

## 总结

| 统计项 | 数量 |
|--------|------|
| 删除文件 | 8 |
| 新建文件（照搬） | 25 |
| 新建文件（改写） | 11 |
| 修改文件 | 8 |
| **总文件数** | **52** |
| **总 Task 数** | **16**（Task 0-15）|
| **新增 npm 依赖** | 6（@dnd-kit×3, zod, js-yaml, @types/js-yaml）|

### 难度分布

| 难度 | Task | 说明 |
|------|------|------|
| 🟢 小 | 0, 3, 8, 14 | 纯配置/清理/接入 |
| 🟡 中 | 1, 2, 6, 7, 10, 12, 15 | 照搬为主 |
| 🔴 大 | 4, 5, 9, 11, 13 | 核心逻辑迁移 + IPC 重写 |

### 风险与应对

| 风险 | 应对 |
|------|------|
| TaskRunner 与 agentOrchestrator 交互不匹配 | Task 4 先单测验证 createSession/sendMessage/onSessionComplete 三方法 |
| @dnd-kit 在 Electron/Vite 中渲染异常 | Task 9 先跑 mock 静态看板确认拖拽正常后再接真实数据 |
| 52 文件变更超出 Review 能力 | 16 个 Task 每次 Commit 1-2 个，渐进交付，独立 typecheck |
