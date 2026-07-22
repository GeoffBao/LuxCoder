# Work Mode Kanban 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Work 模式（cowork）改造为三列 Kanban 看板（待办 | 进行中 | 待回写），右侧滑入式任务详情面板，内含 SPEC-KIT 进度、知识包注入 chips、TB 回写工作流。

**Architecture:** 独立 `WorkTask` 实体存 JSON，主进程 CRUD 服务 + IPC 通道，渲染进程 Jotai atoms。`WorkKanbanView` 为三列看板主体，任务状态内部有 6 阶段状态机，展示层映射到 3 个看板列。`WorkTaskDetailPanel` 为右侧滑入 overlay，不拆分主区域。

**设计稿参考：** `docs/plans/2026-06-29-work-mode-kanban.md`（本文件），截图见用户提供 CraftBuddy Cowork 模式设计图。

**Tech Stack:** Bun, TypeScript, React, Jotai, Tailwind CSS, Radix UI (Sheet/Popover), bun:test

---

## UI 设计规格（来自设计稿）

### 整体布局

```
[LeftSidebar: ModeSwitcher + 空白] | [WorkKanbanView: Header + 三列看板 + 右侧DetailPanel]
```

### 看板列映射（内部 6 阶段 → 展示 3 列）

| 看板列 | 包含的内部状态 | 列头颜色 |
|--------|---------------|---------|
| 待办 | pending, designing, tb-reviewing | 灰色圆点 |
| 进行中 | coding | 橙色圆点 |
| 待回写 | gerrit-reviewing, pending-writeup | 紫色圆点 |

### 任务卡片字段

- 左上：CB-xxx 任务编号（灰色小字）
- 右上：类型角标（Task / Bug P2 / Feature，不同颜色）
- 中：标题（最多 2 行）
- 下左：assignee 头像圆圈（用 initials 代替图片）
- 下右：优先级 P1/P2/P3
- 右下角（进行中列）：`● AI 执行中`（绿色）

### 任务详情 Panel（右侧 overlay，宽 380px）

1. **Header**: 任务编号 + 类型角标 + `implement` 操作按钮
2. **标题**（大字）
3. **SPEC-KIT 进度**：4 步（rca / implement / verify / test），每步有进度条 + 百分比
4. **注入知识包**：
   - SKILLS: chip 标签（spec-kit / code-review / test-gen）
   - RAG: chip 标签（需求文档库 / 历史经验库）
   - 领域知识库: chip 标签（驱动 / 应用 / 通信）
5. **回写 TEAMBITION**（带 #TB-1042 链接）：
   - 工作流状态条: `● Get 需求 → ● Coding → ● Storing`
   - 步骤列表（经验文档已生成✓完成 / 报告文档回写进行中 / 任务状态回写等待）

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `packages/shared/src/types/work-task.ts` | `WorkTask` 类型 + 状态枚举 + IPC 通道常量 |
| `packages/shared/src/utils/work-task-status.ts` | 状态流转纯函数 + 列映射 |
| `packages/shared/src/utils/work-task-status.test.ts` | 状态流转测试 |
| `apps/electron/src/main/lib/work-task-service.ts` | 任务 CRUD 服务（JSON 持久化） |
| `apps/electron/src/renderer/atoms/work-atoms.ts` | Jotai atoms（任务列表、选中任务、panel 开关） |
| `apps/electron/src/renderer/components/work/WorkKanbanView.tsx` | 看板主容器（三列 + detail panel overlay） |
| `apps/electron/src/renderer/components/work/WorkKanbanHeader.tsx` | 看板顶部（连接状态 + 统计 + 同步按钮） |
| `apps/electron/src/renderer/components/work/KanbanColumn.tsx` | 单列容器（列头 + 卡片列表 + 新建） |
| `apps/electron/src/renderer/components/work/WorkTaskCard.tsx` | 任务卡片（编号/类型角标/优先级/AI 指示器） |
| `apps/electron/src/renderer/components/work/WorkTaskDetailPanel.tsx` | 右侧滑入详情 Panel |
| `apps/electron/src/renderer/components/work/SpecKitProgress.tsx` | SPEC-KIT 四步进度组件 |
| `apps/electron/src/renderer/components/work/KnowledgeChips.tsx` | 知识包注入 chips 组件 |
| `apps/electron/src/renderer/components/work/TbWritebackFlow.tsx` | TB 回写工作流步骤组件 |
| `apps/electron/src/renderer/components/work/CreateTaskDialog.tsx` | 新建任务 Dialog |

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/shared/src/types/index.ts` | `export * from './work-task'` |
| `apps/electron/src/main/lib/config-paths.ts` | 新增 `getWorkTasksPath()` |
| `apps/electron/src/main/ipc.ts` | 注册 Work Task IPC handlers |
| `apps/electron/src/preload/index.ts` | expose `workTask.*` API |
| `apps/electron/src/renderer/components/tabs/MainArea.tsx` | cowork 模式渲染 `WorkKanbanView` |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | cowork 模式隐藏会话列表 |
| `docs/luxcoder/03-design-decisions.md` | 更新 Decision 7 MVP 状态 |

---

## Task 1: WorkTask 类型定义

**Files:**
- Create: `packages/shared/src/types/work-task.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: 写 WorkTask 类型文件**

```typescript
// packages/shared/src/types/work-task.ts

/**
 * Work 模式任务类型定义
 *
 * 六阶段内部状态机（见 docs/luxcoder/03-design-decisions.md Decision 7）：
 * pending → designing → tb-reviewing → coding → gerrit-reviewing → pending-writeup → completed
 *
 * 看板展示映射（3 列）：
 * - 待办:    pending | designing | tb-reviewing
 * - 进行中:  coding
 * - 待回写:  gerrit-reviewing | pending-writeup
 */

/** 任务内部阶段状态（6 阶段 + 2 终态） */
export type WorkTaskStatus =
  | 'pending'           // 待处理
  | 'designing'         // 方案设计中
  | 'tb-reviewing'      // TB 审核中
  | 'coding'            // AI Coding 中
  | 'gerrit-reviewing'  // Gerrit/CR 中
  | 'pending-writeup'   // 待回写到 TB（Code done，需写文档回 TB）
  | 'completed'         // 已完成
  | 'cancelled'         // 已取消

/** 看板列（展示层） */
export type KanbanColumn = 'todo' | 'in-progress' | 'pending-writeup'

/** 任务类型 */
export type WorkTaskType = 'requirement' | 'bug' | 'feature' | 'task'

/** 优先级 */
export type WorkTaskPriority = 'P1' | 'P2' | 'P3' | 'P4'

/** SPEC-KIT 单步进度 */
export interface SpecKitStep {
  key: 'rca' | 'implement' | 'verify' | 'test'
  /** 进度 0-100，undefined = 未开始 */
  progress?: number
  /** 是否完成 */
  done: boolean
}

/** TB 回写步骤 */
export interface TbWritebackStep {
  key: string
  label: string
  subLabel?: string
  /** 执行状态 */
  status: 'pending' | 'running' | 'done'
}

/** Work 任务实体 */
export interface WorkTask {
  /** 唯一 UUID */
  id: string
  /** CB-xxx 格式展示编号 */
  taskId: string
  /** 任务标题 */
  title: string
  /** 任务描述（Markdown） */
  description: string
  /** 任务类型 */
  type: WorkTaskType
  /** 优先级 */
  priority: WorkTaskPriority
  /** 当前阶段状态 */
  status: WorkTaskStatus
  /** SPEC-KIT 步骤进度 */
  specKitSteps?: SpecKitStep[]
  /** 注入的 Skills 列表 */
  injectedSkills?: string[]
  /** 注入的 RAG 库名称 */
  injectedRag?: string[]
  /** 注入的领域知识标签 */
  domainTags?: string[]
  /** TB 回写步骤 */
  tbWritebackSteps?: TbWritebackStep[]
  /** 外部 TB 任务 ID（如 #TB-1042） */
  externalTbId?: string
  /** 关联的 Agent 会话 ID */
  agentSessionId?: string
  /** 关联的工作区 ID */
  workspaceId?: string
  /** 负责人标识（用于头像 initials） */
  assigneeName?: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
}

/** 创建任务输入 */
export interface CreateWorkTaskInput {
  title: string
  description?: string
  type: WorkTaskType
  priority?: WorkTaskPriority
  workspaceId?: string
  assigneeName?: string
}

/** 更新任务输入 */
export interface UpdateWorkTaskInput {
  id: string
  title?: string
  description?: string
  status?: WorkTaskStatus
  priority?: WorkTaskPriority
  agentSessionId?: string
  specKitSteps?: SpecKitStep[]
  injectedSkills?: string[]
  injectedRag?: string[]
  domainTags?: string[]
  tbWritebackSteps?: TbWritebackStep[]
  externalTbId?: string
}

/** Work Task IPC 通道常量 */
export const WORK_TASK_IPC_CHANNELS = {
  LIST:   'work-task:list',
  GET:    'work-task:get',
  CREATE: 'work-task:create',
  UPDATE: 'work-task:update',
  DELETE: 'work-task:delete',
} as const
```

- [ ] **Step 2: 导出到 shared types index**

在 `packages/shared/src/types/index.ts` 末尾追加：

```typescript
// Work 看板任务类型
export * from './work-task'
```

- [ ] **Step 3: 类型检查**

```bash
cd packages/shared && bun run typecheck
```

预期：0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/work-task.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): 新增 WorkTask 类型（六阶段状态机 + Kanban 看板字段）"
```

---

## Task 2: 状态流转纯函数 + 列映射 + 测试

**Files:**
- Create: `packages/shared/src/utils/work-task-status.ts`
- Create: `packages/shared/src/utils/work-task-status.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/shared/src/utils/work-task-status.test.ts
import { test, expect, describe } from 'bun:test'
import {
  getKanbanColumn,
  getAllowedTransitions,
  canTransitionTo,
  getTaskIdPrefix,
} from './work-task-status'

describe('getKanbanColumn', () => {
  test('pending → todo', () => expect(getKanbanColumn('pending')).toBe('todo'))
  test('designing → todo', () => expect(getKanbanColumn('designing')).toBe('todo'))
  test('tb-reviewing → todo', () => expect(getKanbanColumn('tb-reviewing')).toBe('todo'))
  test('coding → in-progress', () => expect(getKanbanColumn('coding')).toBe('in-progress'))
  test('gerrit-reviewing → pending-writeup', () =>
    expect(getKanbanColumn('gerrit-reviewing')).toBe('pending-writeup'))
  test('pending-writeup → pending-writeup', () =>
    expect(getKanbanColumn('pending-writeup')).toBe('pending-writeup'))
  test('completed → null', () => expect(getKanbanColumn('completed')).toBeNull())
  test('cancelled → null', () => expect(getKanbanColumn('cancelled')).toBeNull())
})

describe('getAllowedTransitions', () => {
  test('需求类型：pending 只能进 designing 或取消', () => {
    expect(getAllowedTransitions('pending', 'requirement')).toEqual(['designing', 'cancelled'])
  })
  test('bug 类型：pending 跳过 designing，直接进 coding', () => {
    expect(getAllowedTransitions('pending', 'bug')).toEqual(['coding', 'cancelled'])
  })
  test('task 类型：pending 跳过 designing', () => {
    expect(getAllowedTransitions('pending', 'task')).toEqual(['coding', 'cancelled'])
  })
  test('feature 类型：pending 进 designing', () => {
    expect(getAllowedTransitions('pending', 'feature')).toEqual(['designing', 'cancelled'])
  })
  test('designing → tb-reviewing', () => {
    expect(getAllowedTransitions('designing', 'requirement')).toEqual(['tb-reviewing', 'cancelled'])
  })
  test('tb-reviewing 可驳回到 designing 或前进到 coding', () => {
    const result = getAllowedTransitions('tb-reviewing', 'requirement')
    expect(result).toContain('designing')
    expect(result).toContain('coding')
  })
  test('coding → gerrit-reviewing 或 pending-writeup', () => {
    const result = getAllowedTransitions('coding', 'bug')
    expect(result).toContain('gerrit-reviewing')
  })
  test('gerrit-reviewing 可驳回 coding 或进 pending-writeup', () => {
    const result = getAllowedTransitions('gerrit-reviewing', 'bug')
    expect(result).toContain('coding')
    expect(result).toContain('pending-writeup')
  })
  test('pending-writeup → completed', () => {
    expect(getAllowedTransitions('pending-writeup', 'bug')).toContain('completed')
  })
  test('completed 不能再流转', () => {
    expect(getAllowedTransitions('completed', 'requirement')).toEqual([])
  })
})

describe('canTransitionTo', () => {
  test('允许的流转', () => expect(canTransitionTo('pending', 'coding', 'bug')).toBe(true))
  test('不允许的流转', () => expect(canTransitionTo('completed', 'coding', 'bug')).toBe(false))
})

describe('getTaskIdPrefix', () => {
  test('默认前缀 CB', () => expect(getTaskIdPrefix()).toBe('CB'))
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/shared && bun test src/utils/work-task-status.test.ts
```

预期：FAIL with "Cannot find module"

- [ ] **Step 3: 实现纯函数**

```typescript
// packages/shared/src/utils/work-task-status.ts
import type { WorkTaskStatus, WorkTaskType, KanbanColumn } from '../types/work-task'

/** 内部状态 → 看板列映射（null 表示不在看板中显示） */
export function getKanbanColumn(status: WorkTaskStatus): KanbanColumn | null {
  switch (status) {
    case 'pending':
    case 'designing':
    case 'tb-reviewing':
      return 'todo'
    case 'coding':
      return 'in-progress'
    case 'gerrit-reviewing':
    case 'pending-writeup':
      return 'pending-writeup'
    case 'completed':
    case 'cancelled':
      return null
  }
}

const TRANSITIONS: Record<WorkTaskStatus, Partial<Record<WorkTaskType, WorkTaskStatus[]>>> = {
  pending: {
    requirement: ['designing', 'cancelled'],
    feature:     ['designing', 'cancelled'],
    bug:         ['coding', 'cancelled'],
    task:        ['coding', 'cancelled'],
  },
  designing: {
    requirement: ['tb-reviewing', 'cancelled'],
    feature:     ['tb-reviewing', 'cancelled'],
    bug:         ['coding', 'cancelled'],
    task:        ['coding', 'cancelled'],
  },
  'tb-reviewing': {
    requirement: ['designing', 'coding', 'cancelled'],
    feature:     ['designing', 'coding', 'cancelled'],
    bug:         ['coding', 'cancelled'],
    task:        ['coding', 'cancelled'],
  },
  coding: {
    requirement: ['gerrit-reviewing', 'cancelled'],
    feature:     ['gerrit-reviewing', 'cancelled'],
    bug:         ['gerrit-reviewing', 'cancelled'],
    task:        ['gerrit-reviewing', 'cancelled'],
  },
  'gerrit-reviewing': {
    requirement: ['coding', 'pending-writeup', 'cancelled'],
    feature:     ['coding', 'pending-writeup', 'cancelled'],
    bug:         ['coding', 'pending-writeup', 'cancelled'],
    task:        ['coding', 'pending-writeup', 'cancelled'],
  },
  'pending-writeup': {
    requirement: ['completed', 'cancelled'],
    feature:     ['completed', 'cancelled'],
    bug:         ['completed', 'cancelled'],
    task:        ['completed', 'cancelled'],
  },
  completed: {},
  cancelled: {},
}

export function getAllowedTransitions(
  status: WorkTaskStatus,
  type: WorkTaskType,
): WorkTaskStatus[] {
  return TRANSITIONS[status][type] ?? TRANSITIONS[status].task ?? []
}

export function canTransitionTo(
  from: WorkTaskStatus,
  to: WorkTaskStatus,
  type: WorkTaskType,
): boolean {
  return getAllowedTransitions(from, type).includes(to)
}

/** CB-xxx 任务编号前缀（未来支持自定义） */
export function getTaskIdPrefix(): string {
  return 'CB'
}

/** 生成 CB-xxx 格式任务编号 */
export function generateTaskId(counter: number): string {
  return `${getTaskIdPrefix()}-${String(counter).padStart(3, '0')}`
}
```

- [ ] **Step 4: 测试通过**

```bash
cd packages/shared && bun test src/utils/work-task-status.test.ts
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/work-task-status.ts packages/shared/src/utils/work-task-status.test.ts
git commit -m "feat(shared): WorkTask 状态流转 + 看板列映射纯函数 + 测试"
```

---

## Task 3: 配置路径 + 持久化服务

**Files:**
- Modify: `apps/electron/src/main/lib/config-paths.ts`
- Create: `apps/electron/src/main/lib/work-task-service.ts`

- [ ] **Step 1: 添加路径函数**

在 `apps/electron/src/main/lib/config-paths.ts` 末尾追加：

```typescript
export function getWorkTasksPath(): string {
  return join(getConfigDir(), 'work-tasks.json')
}
```

- [ ] **Step 2: 创建服务文件**

```typescript
// apps/electron/src/main/lib/work-task-service.ts
/**
 * Work 任务持久化服务
 *
 * 存储：~/.luxcoder/work-tasks.json（全量 JSON，任务数 < 200 足够）
 * taskId 计数器持久化在同一文件，格式 { version, counter, tasks }
 */
import { randomUUID } from 'node:crypto'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import { getWorkTasksPath } from './config-paths'
import { generateTaskId } from '@luxcoder/shared/utils/work-task-status'
import type {
  WorkTask,
  CreateWorkTaskInput,
  UpdateWorkTaskInput,
  SpecKitStep,
} from '@luxcoder/shared'

interface WorkTasksStore {
  version: number
  /** CB-xxx 全局计数器 */
  counter: number
  tasks: WorkTask[]
}

const STORE_VERSION = 1

function readStore(): WorkTasksStore {
  const data = readJsonFileSafe<WorkTasksStore>(getWorkTasksPath())
  if (data) return data
  return { version: STORE_VERSION, counter: 0, tasks: [] }
}

function writeStore(store: WorkTasksStore): void {
  writeJsonFileAtomic(getWorkTasksPath(), store)
}

/** 获取所有任务（按 updatedAt 降序） */
export function listWorkTasks(): WorkTask[] {
  return readStore().tasks.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 获取单个任务 */
export function getWorkTask(id: string): WorkTask | undefined {
  return readStore().tasks.find((t) => t.id === id)
}

/** 默认 SPEC-KIT 步骤（全部未开始） */
function defaultSpecKitSteps(): SpecKitStep[] {
  return [
    { key: 'rca',       done: false },
    { key: 'implement', done: false },
    { key: 'verify',    done: false },
    { key: 'test',      done: false },
  ]
}

/** 创建任务 */
export function createWorkTask(input: CreateWorkTaskInput): WorkTask {
  const now = Date.now()
  const store = readStore()
  store.counter += 1
  const task: WorkTask = {
    id: randomUUID(),
    taskId: generateTaskId(store.counter),
    title: input.title,
    description: input.description ?? '',
    type: input.type,
    priority: input.priority ?? 'P3',
    status: 'pending',
    specKitSteps: defaultSpecKitSteps(),
    injectedSkills: [],
    injectedRag: [],
    domainTags: [],
    tbWritebackSteps: [],
    workspaceId: input.workspaceId,
    assigneeName: input.assigneeName,
    createdAt: now,
    updatedAt: now,
  }
  store.tasks.push(task)
  writeStore(store)
  return task
}

/** 更新任务 */
export function updateWorkTask(input: UpdateWorkTaskInput): WorkTask {
  const store = readStore()
  const idx = store.tasks.findIndex((t) => t.id === input.id)
  if (idx === -1) throw new Error(`WorkTask ${input.id} not found`)
  const prev = store.tasks[idx]!
  const updated: WorkTask = {
    ...prev,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.agentSessionId !== undefined && { agentSessionId: input.agentSessionId }),
    ...(input.specKitSteps !== undefined && { specKitSteps: input.specKitSteps }),
    ...(input.injectedSkills !== undefined && { injectedSkills: input.injectedSkills }),
    ...(input.injectedRag !== undefined && { injectedRag: input.injectedRag }),
    ...(input.domainTags !== undefined && { domainTags: input.domainTags }),
    ...(input.tbWritebackSteps !== undefined && { tbWritebackSteps: input.tbWritebackSteps }),
    ...(input.externalTbId !== undefined && { externalTbId: input.externalTbId }),
    updatedAt: Date.now(),
  }
  store.tasks[idx] = updated
  writeStore(store)
  return updated
}

/** 删除任务 */
export function deleteWorkTask(id: string): void {
  const store = readStore()
  const idx = store.tasks.findIndex((t) => t.id === id)
  if (idx === -1) return
  store.tasks.splice(idx, 1)
  writeStore(store)
}
```

- [ ] **Step 3: 检查 `@luxcoder/shared/utils/work-task-status` 导出路径是否已配置**

```bash
cat packages/shared/package.json | grep -A 20 '"exports"'
```

若 exports 只有 `"."` 入口，需要在 `packages/shared/package.json` 的 `exports` 中添加 utils 子路径，或改为从主入口 re-export：

在 `packages/shared/src/utils/index.ts`（若存在）追加：
```typescript
export * from './work-task-status'
```

若不存在 utils/index.ts，直接在 `packages/shared/src/index.ts` 追加即可。否则在 service 文件里改用：
```typescript
import { generateTaskId } from '@luxcoder/shared'
```

- [ ] **Step 4: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | grep "error" | head -20
```

预期：0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/config-paths.ts apps/electron/src/main/lib/work-task-service.ts
git commit -m "feat(main): WorkTask 持久化服务（JSON + CB-xxx 自增编号）"
```

---

## Task 4: IPC 通道注册 + Preload 桥接

**Files:**
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`

- [ ] **Step 1: ipc.ts 追加 import**

在 ipc.ts 顶部 import 区域追加：

```typescript
import {
  listWorkTasks,
  getWorkTask,
  createWorkTask,
  updateWorkTask,
  deleteWorkTask,
} from './lib/work-task-service'
import { WORK_TASK_IPC_CHANNELS } from '@luxcoder/shared'
```

- [ ] **Step 2: ipc.ts 注册 handlers**

在 `setupIpcHandlers` 函数结尾（`}` 之前）追加：

```typescript
  // ===== Work Task =====
  ipcMain.handle(WORK_TASK_IPC_CHANNELS.LIST, () => listWorkTasks())

  ipcMain.handle(WORK_TASK_IPC_CHANNELS.GET, (_e, id: string) =>
    getWorkTask(id) ?? null
  )

  ipcMain.handle(WORK_TASK_IPC_CHANNELS.CREATE,
    (_e, input: Parameters<typeof createWorkTask>[0]) => createWorkTask(input)
  )

  ipcMain.handle(WORK_TASK_IPC_CHANNELS.UPDATE,
    (_e, input: Parameters<typeof updateWorkTask>[0]) => updateWorkTask(input)
  )

  ipcMain.handle(WORK_TASK_IPC_CHANNELS.DELETE, (_e, id: string) => {
    deleteWorkTask(id)
  })
```

- [ ] **Step 3: preload/index.ts 追加 import + API**

顶部 import 区域追加：
```typescript
import { WORK_TASK_IPC_CHANNELS } from '@luxcoder/shared'
```

在 `contextBridge.exposeInMainWorld` 调用的 API 对象末尾追加（注意逗号）：

```typescript
    workTask: {
      list: (): Promise<import('@luxcoder/shared').WorkTask[]> =>
        ipcRenderer.invoke(WORK_TASK_IPC_CHANNELS.LIST),
      get: (id: string): Promise<import('@luxcoder/shared').WorkTask | null> =>
        ipcRenderer.invoke(WORK_TASK_IPC_CHANNELS.GET, id),
      create: (input: import('@luxcoder/shared').CreateWorkTaskInput): Promise<import('@luxcoder/shared').WorkTask> =>
        ipcRenderer.invoke(WORK_TASK_IPC_CHANNELS.CREATE, input),
      update: (input: import('@luxcoder/shared').UpdateWorkTaskInput): Promise<import('@luxcoder/shared').WorkTask> =>
        ipcRenderer.invoke(WORK_TASK_IPC_CHANNELS.UPDATE, input),
      delete: (id: string): Promise<void> =>
        ipcRenderer.invoke(WORK_TASK_IPC_CHANNELS.DELETE, id),
    },
```

- [ ] **Step 4: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | grep "error" | head -20
```

预期：0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/ipc.ts apps/electron/src/preload/index.ts
git commit -m "feat(ipc): WorkTask CRUD IPC 通道 + Preload 桥接"
```

---

## Task 5: Jotai Atoms

**Files:**
- Create: `apps/electron/src/renderer/atoms/work-atoms.ts`

- [ ] **Step 1: 创建 work-atoms.ts**

```typescript
// apps/electron/src/renderer/atoms/work-atoms.ts
/**
 * Work 模式 Jotai 状态管理
 */
import { atom } from 'jotai'
import type { WorkTask } from '@luxcoder/shared'

/** 全量任务列表 */
export const workTasksAtom = atom<WorkTask[]>([])

/** 任务加载状态 */
export const workTasksLoadingAtom = atom<boolean>(false)

/** 当前选中的任务 ID（null = 无选中，detail panel 关闭） */
export const selectedWorkTaskIdAtom = atom<string | null>(null)

/** 派生：当前选中的任务 */
export const selectedWorkTaskAtom = atom<WorkTask | null>((get) => {
  const tasks = get(workTasksAtom)
  const id = get(selectedWorkTaskIdAtom)
  return id ? (tasks.find((t) => t.id === id) ?? null) : null
})

/** 派生：是否展示 detail panel */
export const workDetailPanelOpenAtom = atom<boolean>((get) => get(selectedWorkTaskIdAtom) !== null)

/** 派生：进行中的 AI 任务数量（status === 'coding' 且有 agentSessionId） */
export const aiRunningCountAtom = atom<number>((get) =>
  get(workTasksAtom).filter((t) => t.status === 'coding' && !!t.agentSessionId).length
)
```

- [ ] **Step 2: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | grep "work-atoms\|error" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/atoms/work-atoms.ts
git commit -m "feat(atoms): Work 模式 Jotai atoms"
```

---

## Task 6: WorkTaskCard 任务卡片

**Files:**
- Create: `apps/electron/src/renderer/components/work/WorkTaskCard.tsx`

- [ ] **Step 1: 创建 WorkTaskCard.tsx**

```tsx
// apps/electron/src/renderer/components/work/WorkTaskCard.tsx
/**
 * 任务卡片 — 对应设计稿 CB-xxx 卡片
 *
 * 布局：
 *   [CB-024]              [Task]
 *   升级 Redis 缓存层至 v7
 *   [李头像]              P3  ● AI执行中
 */
import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { cn } from '@/lib/utils'
import { selectedWorkTaskIdAtom } from '@/atoms/work-atoms'
import { agentStreamingStatesAtom } from '@/atoms/agent-atoms'
import type { WorkTask } from '@luxcoder/shared'

const TYPE_COLOR: Record<WorkTask['type'], string> = {
  requirement: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  feature:     'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  bug:         'bg-red-500/15 text-red-400 border border-red-500/30',
  task:        'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

const TYPE_LABEL: Record<WorkTask['type'], string> = {
  requirement: 'Req',
  feature: 'Feature',
  bug: 'Bug',
  task: 'Task',
}

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'text-red-400',
  P2: 'text-amber-400',
  P3: 'text-slate-400',
  P4: 'text-slate-500',
}

/** 从 assigneeName 取首字母 initials */
function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

interface WorkTaskCardProps {
  task: WorkTask
}

export function WorkTaskCard({ task }: WorkTaskCardProps): React.ReactElement {
  const [selectedId, setSelectedId] = useAtom(selectedWorkTaskIdAtom)
  const streamingStates = useAtomValue(agentStreamingStatesAtom)
  const isSelected = selectedId === task.id

  // 是否有 agent 会话正在运行
  const isAiRunning = task.agentSessionId
    ? (streamingStates.get(task.agentSessionId)?.running ?? false)
    : false

  return (
    <button
      type="button"
      onClick={() => setSelectedId(isSelected ? null : task.id)}
      className={cn(
        'w-full text-left rounded-xl p-3.5 transition-all duration-150 border',
        isSelected
          ? 'bg-card border-primary/40 shadow-md ring-1 ring-primary/20'
          : 'bg-card hover:bg-card/80 border-border/50 hover:border-border hover:shadow-sm',
      )}
    >
      {/* 顶行：任务编号 + 类型角标 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted-foreground/70 font-mono">{task.taskId}</span>
        <span className={cn(
          'text-[10px] font-medium px-1.5 py-0.5 rounded',
          TYPE_COLOR[task.type],
        )}>
          {TYPE_LABEL[task.type]}{task.priority !== 'P3' ? ` ${task.priority}` : ''}
        </span>
      </div>

      {/* 标题 */}
      <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2 mb-3">
        {task.title}
      </p>

      {/* 底行：头像 + 优先级 + AI 状态 */}
      <div className="flex items-center justify-between">
        {/* 负责人头像 */}
        <div className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
          'bg-gradient-to-br from-violet-500 to-indigo-600',
        )}>
          {getInitials(task.assigneeName)}
        </div>

        <div className="flex items-center gap-2">
          {isAiRunning && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI 执行中
            </span>
          )}
          <span className={cn('text-[11px] font-medium', PRIORITY_COLOR[task.priority] ?? 'text-slate-400')}>
            {task.priority}
          </span>
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/WorkTaskCard.tsx
git commit -m "feat(ui): WorkTaskCard 任务卡片（编号/类型/优先级/AI指示器）"
```

---

## Task 7: KanbanColumn 列容器

**Files:**
- Create: `apps/electron/src/renderer/components/work/KanbanColumn.tsx`

- [ ] **Step 1: 创建 KanbanColumn.tsx**

```tsx
// apps/electron/src/renderer/components/work/KanbanColumn.tsx
import * as React from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkTaskCard } from './WorkTaskCard'
import type { WorkTask } from '@luxcoder/shared'

interface ColumnConfig {
  label: string
  dotColor: string
}

const COLUMN_CONFIG: Record<string, ColumnConfig> = {
  'todo':           { label: '待办',    dotColor: 'bg-slate-400' },
  'in-progress':    { label: '进行中',  dotColor: 'bg-amber-400' },
  'pending-writeup':{ label: '待回写',  dotColor: 'bg-violet-400' },
}

interface KanbanColumnProps {
  columnKey: string
  tasks: WorkTask[]
  onAddTask?: () => void
}

export function KanbanColumn({ columnKey, tasks, onAddTask }: KanbanColumnProps): React.ReactElement {
  const config = COLUMN_CONFIG[columnKey] ?? { label: columnKey, dotColor: 'bg-slate-400' }

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* 列头 */}
      <div className="flex items-center justify-between px-1 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', config.dotColor)} />
          <span className="text-[13px] font-semibold text-foreground">{config.label}</span>
          <span className="text-[12px] text-muted-foreground bg-muted rounded-full px-1.5 min-w-5 text-center">
            {tasks.length}
          </span>
        </div>
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pb-2">
        {tasks.map((task) => (
          <WorkTaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 rounded-xl border border-dashed border-border/40 text-xs text-muted-foreground/50">
            暂无任务
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/KanbanColumn.tsx
git commit -m "feat(ui): KanbanColumn 看板列容器"
```

---

## Task 8: SpecKitProgress 进度组件

**Files:**
- Create: `apps/electron/src/renderer/components/work/SpecKitProgress.tsx`

- [ ] **Step 1: 创建 SpecKitProgress.tsx**

```tsx
// apps/electron/src/renderer/components/work/SpecKitProgress.tsx
/**
 * SPEC-KIT 四步进度 — 对应设计稿右侧 "SPEC-KIT 进度" 区域
 *
 * rca(100%) ✓ | implement(72%) → | verify(0%) | test(0%)
 */
import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpecKitStep } from '@luxcoder/shared'

const STEP_LABELS: Record<SpecKitStep['key'], string> = {
  rca:       'rca',
  implement: 'implement',
  verify:    'verify',
  test:      'test',
}

interface SpecKitProgressProps {
  steps: SpecKitStep[]
}

export function SpecKitProgress({ steps }: SpecKitProgressProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((step, i) => {
        const pct = step.progress ?? 0
        const isActive = !step.done && pct > 0
        const isDone = step.done
        const isPending = !step.done && pct === 0

        return (
          <div key={step.key} className="flex items-center gap-3">
            {/* 序号/完成图标 */}
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
              isDone
                ? 'bg-emerald-500 text-white'
                : isActive
                  ? 'bg-primary/20 border border-primary text-primary'
                  : 'bg-muted border border-border text-muted-foreground',
            )}>
              {isDone ? <Check size={10} /> : i + 1}
            </div>

            {/* 步骤名 + 进度条 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  'text-[12px] font-medium',
                  isPending ? 'text-muted-foreground/50' : 'text-foreground',
                )}>
                  {STEP_LABELS[step.key]}
                </span>
                {!isPending && (
                  <span className={cn(
                    'text-[11px] font-medium',
                    isDone ? 'text-emerald-400' : 'text-primary',
                  )}>
                    {isDone ? '100%' : `${pct}%`}
                  </span>
                )}
              </div>
              {/* 进度条 */}
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isDone ? 'bg-emerald-500' : 'bg-primary',
                  )}
                  style={{ width: isDone ? '100%' : `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/SpecKitProgress.tsx
git commit -m "feat(ui): SpecKitProgress 四步进度条组件"
```

---

## Task 9: KnowledgeChips 知识包注入组件

**Files:**
- Create: `apps/electron/src/renderer/components/work/KnowledgeChips.tsx`

- [ ] **Step 1: 创建 KnowledgeChips.tsx**

```tsx
// apps/electron/src/renderer/components/work/KnowledgeChips.tsx
/**
 * 知识包注入 chips — 对应设计稿"注入知识包"区域
 *
 * ● SKILLS   [spec-kit] [code-review] [test-gen]
 * ● RAG      [需求文档库] [历史经验库]
 * ● 领域知识库 [驱动] [应用] [通信]
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface ChipGroupProps {
  dotColor: string
  label: string
  chips: string[]
  chipClass?: string
}

function ChipGroup({ dotColor, label, chips, chipClass }: ChipGroupProps): React.ReactElement {
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-md border',
              chipClass ?? 'bg-muted/60 border-border/60 text-foreground/80',
            )}
          >
            {chip}
          </span>
        ))}
        {chips.length === 0 && (
          <span className="text-[11px] text-muted-foreground/40">未配置</span>
        )}
      </div>
    </div>
  )
}

interface KnowledgeChipsProps {
  skills?: string[]
  rag?: string[]
  domainTags?: string[]
}

export function KnowledgeChips({ skills = [], rag = [], domainTags = [] }: KnowledgeChipsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <ChipGroup
        dotColor="bg-emerald-400"
        label="SKILLS"
        chips={skills}
        chipClass="bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
      />
      <ChipGroup
        dotColor="bg-blue-400"
        label="RAG"
        chips={rag}
        chipClass="bg-blue-500/10 border-blue-500/30 text-blue-400"
      />
      <ChipGroup
        dotColor="bg-slate-400"
        label="领域知识库"
        chips={domainTags}
        chipClass="bg-slate-500/10 border-slate-500/30 text-slate-400"
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/KnowledgeChips.tsx
git commit -m "feat(ui): KnowledgeChips 知识包注入 chips 组件"
```

---

## Task 10: TbWritebackFlow TB 回写步骤组件

**Files:**
- Create: `apps/electron/src/renderer/components/work/TbWritebackFlow.tsx`

- [ ] **Step 1: 创建 TbWritebackFlow.tsx**

```tsx
// apps/electron/src/renderer/components/work/TbWritebackFlow.tsx
/**
 * TB 回写工作流 — 对应设计稿"回写 TEAMBITION"区域
 *
 * ● Get 需求 → ● Coding → ● Storing
 * ─────────────────────────
 * ✓ 经验文档已生成         完成
 *   CHANGELOG + 经验总结
 * ◌ 报告文档回写           进行中
 *   teambition-mcp
 * ○ 任务状态回写           等待
 */
import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TbWritebackStep } from '@luxcoder/shared'

const STATUS_LABEL: Record<TbWritebackStep['status'], string> = {
  pending: '等待',
  running: '进行中',
  done:    '完成',
}

const STATUS_COLOR: Record<TbWritebackStep['status'], string> = {
  pending: 'text-muted-foreground/40',
  running: 'text-amber-400',
  done:    'text-emerald-400',
}

interface TbWritebackFlowProps {
  steps: TbWritebackStep[]
  externalTbId?: string
  /** 工作流阶段（Get 需求 / Coding / Storing） */
  activePhase?: 'get' | 'coding' | 'storing'
}

export function TbWritebackFlow({ steps, externalTbId, activePhase }: TbWritebackFlowProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      {/* 工作流阶段条 */}
      <div className="flex items-center gap-1 text-[11px]">
        {(['get', 'coding', 'storing'] as const).map((phase, i) => {
          const labels = { get: 'Get 需求', coding: 'Coding', storing: 'Storing' }
          const isActive = activePhase === phase
          return (
            <React.Fragment key={phase}>
              {i > 0 && <span className="text-muted-foreground/30 mx-1">→</span>}
              <span className={cn(
                'font-medium',
                isActive ? 'text-emerald-400' : 'text-muted-foreground/50',
              )}>
                {isActive && <span className="mr-1">●</span>}
                {labels[phase]}
              </span>
            </React.Fragment>
          )
        })}
      </div>

      {/* 步骤列表 */}
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <div key={step.key} className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
            <div className="flex items-start gap-2 min-w-0">
              {/* 状态图标 */}
              <div className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                step.status === 'done'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : step.status === 'running'
                    ? 'border border-amber-400'
                    : 'border border-border/50',
              )}>
                {step.status === 'done' && <Check size={9} />}
              </div>
              <div className="min-w-0">
                <p className={cn(
                  'text-[12px] font-medium leading-tight',
                  step.status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground',
                )}>
                  {step.label}
                </p>
                {step.subLabel && (
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{step.subLabel}</p>
                )}
              </div>
            </div>
            <span className={cn('text-[11px] font-medium flex-shrink-0', STATUS_COLOR[step.status])}>
              {STATUS_LABEL[step.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/TbWritebackFlow.tsx
git commit -m "feat(ui): TbWritebackFlow TB 回写工作流步骤组件"
```

---

## Task 11: WorkTaskDetailPanel 右侧滑入详情面板

**Files:**
- Create: `apps/electron/src/renderer/components/work/WorkTaskDetailPanel.tsx`

- [ ] **Step 1: 创建 WorkTaskDetailPanel.tsx**

```tsx
// apps/electron/src/renderer/components/work/WorkTaskDetailPanel.tsx
/**
 * WorkTaskDetailPanel — 右侧滑入详情 Panel
 *
 * 设计稿布局（从上到下）：
 * 1. Header: 任务编号 + 类型角标 + 操作按钮（implement）
 * 2. 标题（大字）
 * 3. SPEC-KIT 进度
 * 4. 注入知识包
 * 5. 回写 TEAMBITION
 */
import * as React from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { selectedWorkTaskIdAtom, workTasksAtom, selectedWorkTaskAtom } from '@/atoms/work-atoms'
import { SpecKitProgress } from './SpecKitProgress'
import { KnowledgeChips } from './KnowledgeChips'
import { TbWritebackFlow } from './TbWritebackFlow'
import { Button } from '@/components/ui/button'
import type { WorkTask } from '@luxcoder/shared'

const TYPE_BADGE: Record<WorkTask['type'], string> = {
  requirement: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  feature:     'bg-violet-500/20 text-violet-400 border-violet-500/30',
  bug:         'bg-red-500/20 text-red-400 border-red-500/30',
  task:        'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const TYPE_DISPLAY: Record<WorkTask['type'], string> = {
  requirement: 'Req',
  feature: 'Feature',
  bug: 'Bug',
  task: 'Task',
}

export function WorkTaskDetailPanel(): React.ReactElement | null {
  const task = useAtomValue(selectedWorkTaskAtom)
  const setSelectedId = useSetAtom(selectedWorkTaskIdAtom)
  const setTasks = useSetAtom(workTasksAtom)

  if (!task) return null

  const handleStartCoding = async () => {
    // Step: 找到实际的创建 agent session 的 IPC 方法（Task 14 中修复）
    // 占位，待 Task 14 核实方法名后填入
    console.log('[WorkTaskDetailPanel] 开始 Coding，任务 ID:', task.id)
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-card/50">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-mono text-muted-foreground flex-shrink-0">{task.taskId}</span>
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
            TYPE_BADGE[task.type],
          )}>
            {TYPE_DISPLAY[task.type]}{task.priority !== 'P3' ? ` ${task.priority}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {task.status === 'coding' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleStartCoding}>
              implement
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 2. 标题 */}
        <div className="px-5 py-4 border-b border-border/40">
          <h2 className="text-[15px] font-semibold text-foreground leading-snug">
            {task.title}
          </h2>
          {task.externalTbId && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[11px] text-muted-foreground">{task.externalTbId}</span>
              <ExternalLink size={10} className="text-muted-foreground/60" />
            </div>
          )}
        </div>

        {/* 3. SPEC-KIT 进度 */}
        {task.specKitSteps && task.specKitSteps.length > 0 && (
          <div className="px-5 py-4 border-b border-border/40">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              SPEC-KIT 进度
            </p>
            <SpecKitProgress steps={task.specKitSteps} />
          </div>
        )}

        {/* 4. 注入知识包 */}
        <div className="px-5 py-4 border-b border-border/40">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            注入知识包
          </p>
          <KnowledgeChips
            skills={task.injectedSkills}
            rag={task.injectedRag}
            domainTags={task.domainTags}
          />
        </div>

        {/* 5. TB 回写 */}
        {task.tbWritebackSteps && task.tbWritebackSteps.length > 0 && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                回写 TEAMBITION
              </p>
              {task.externalTbId && (
                <span className="text-[10px] text-primary/70 font-mono">{task.externalTbId}</span>
              )}
            </div>
            <TbWritebackFlow
              steps={task.tbWritebackSteps}
              externalTbId={task.externalTbId}
              activePhase={task.status === 'pending-writeup' ? 'storing' : task.status === 'coding' ? 'coding' : 'get'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/WorkTaskDetailPanel.tsx
git commit -m "feat(ui): WorkTaskDetailPanel 右侧滑入任务详情面板"
```

---

## Task 12: CreateTaskDialog 新建任务弹窗

**Files:**
- Create: `apps/electron/src/renderer/components/work/CreateTaskDialog.tsx`

- [ ] **Step 1: 创建 CreateTaskDialog.tsx**

```tsx
// apps/electron/src/renderer/components/work/CreateTaskDialog.tsx
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { workTasksAtom, selectedWorkTaskIdAtom } from '@/atoms/work-atoms'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkTaskType, WorkTaskPriority } from '@luxcoder/shared'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps): React.ReactElement {
  const setTasks = useSetAtom(workTasksAtom)
  const setSelectedId = useSetAtom(selectedWorkTaskIdAtom)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [type, setType] = React.useState<WorkTaskType>('task')
  const [priority, setPriority] = React.useState<WorkTaskPriority>('P3')
  const [submitting, setSubmitting] = React.useState(false)

  const reset = () => { setTitle(''); setDescription(''); setType('task'); setPriority('P3') }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const created = await window.electronAPI.workTask.create({
        title: title.trim(),
        description,
        type,
        priority,
      })
      const tasks = await window.electronAPI.workTask.list()
      setTasks(tasks)
      setSelectedId(created.id)
      reset()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-title">标题 *</Label>
            <Input
              id="ct-title"
              placeholder="简短描述任务..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as WorkTaskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="requirement">需求（走完整六阶段）</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="bug">Bug（跳过方案审核）</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 flex flex-col gap-1.5">
              <Label>优先级</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkTaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['P1','P2','P3','P4'] as const).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-desc">描述（可选）</Label>
            <Textarea
              id="ct-desc"
              placeholder="背景、关键信息..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={!title.trim() || submitting} className="flex-1">
              {submitting ? '创建中...' : '创建'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/CreateTaskDialog.tsx
git commit -m "feat(ui): CreateTaskDialog 新建任务弹窗"
```

---

## Task 13: WorkKanbanHeader 看板顶部

**Files:**
- Create: `apps/electron/src/renderer/components/work/WorkKanbanHeader.tsx`

- [ ] **Step 1: 创建 WorkKanbanHeader.tsx**

```tsx
// apps/electron/src/renderer/components/work/WorkKanbanHeader.tsx
/**
 * WorkKanbanHeader — 对应设计稿顶部栏
 *
 * [我的看板] [● Teambition 已连接] [9 tasks · 3 AI 进行中] [上次同步 X 分钟前] [同步] [过滤]
 */
import * as React from 'react'
import { useAtomValue } from 'jotai'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import { workTasksAtom, aiRunningCountAtom } from '@/atoms/work-atoms'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WorkKanbanHeaderProps {
  onRefresh?: () => void
  refreshing?: boolean
}

export function WorkKanbanHeader({ onRefresh, refreshing }: WorkKanbanHeaderProps): React.ReactElement {
  const tasks = useAtomValue(workTasksAtom)
  const aiRunning = useAtomValue(aiRunningCountAtom)

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-border/60 flex-shrink-0">
      {/* 标题 */}
      <h1 className="text-[15px] font-semibold text-foreground flex-shrink-0">我的看板</h1>

      {/* TB 连接状态（MVP 阶段固定显示未连接） */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        <span className="text-[11px] text-muted-foreground">Teambition 未连接</span>
      </div>

      {/* 统计 */}
      <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <span>{activeTasks.length} tasks</span>
        {aiRunning > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-emerald-400">{aiRunning} AI 进行中</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* 同步 + 过滤按钮 */}
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-[12px]"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
        同步
      </Button>
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[12px] text-muted-foreground">
        <SlidersHorizontal size={12} />
        过滤
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/WorkKanbanHeader.tsx
git commit -m "feat(ui): WorkKanbanHeader 看板顶部栏"
```

---

## Task 14: WorkKanbanView 主容器（三列看板 + 右侧 Panel）

**Files:**
- Create: `apps/electron/src/renderer/components/work/WorkKanbanView.tsx`

- [ ] **Step 1: 创建 WorkKanbanView.tsx**

```tsx
// apps/electron/src/renderer/components/work/WorkKanbanView.tsx
/**
 * WorkKanbanView — Work 模式主视图
 *
 * 布局：
 *   [WorkKanbanHeader]
 *   [三列看板] | [WorkTaskDetailPanel 右侧 overlay，width=380px]
 *
 * 三列 = 待办 | 进行中 | 待回写
 */
import * as React from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { workTasksAtom, workTasksLoadingAtom, workDetailPanelOpenAtom } from '@/atoms/work-atoms'
import { WorkKanbanHeader } from './WorkKanbanHeader'
import { KanbanColumn } from './KanbanColumn'
import { WorkTaskDetailPanel } from './WorkTaskDetailPanel'
import { CreateTaskDialog } from './CreateTaskDialog'
import { getKanbanColumn } from '@luxcoder/shared'
import { cn } from '@/lib/utils'
import type { WorkTask } from '@luxcoder/shared'

const COLUMNS = ['todo', 'in-progress', 'pending-writeup'] as const

const DETAIL_PANEL_WIDTH = 380

export function WorkKanbanView(): React.ReactElement {
  const setTasks = useSetAtom(workTasksAtom)
  const setLoading = useSetAtom(workTasksLoadingAtom)
  const detailOpen = useAtomValue(workDetailPanelOpenAtom)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const tasks = useAtomValue(workTasksAtom)

  const loadTasks = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.workTask.list()
      setTasks(list)
    } catch (err) {
      console.error('[WorkKanbanView] 加载任务失败:', err)
    } finally {
      setLoading(false)
    }
  }, [setTasks, setLoading])

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    await loadTasks()
    setRefreshing(false)
  }, [loadTasks])

  // 挂载时加载
  React.useEffect(() => { void loadTasks() }, [loadTasks])

  // 按列分组任务（只显示活跃任务，completed/cancelled 不在看板中）
  const grouped = React.useMemo(() => {
    const map = new Map<string, WorkTask[]>(COLUMNS.map((c) => [c, []]))
    for (const task of tasks) {
      const col = getKanbanColumn(task.status)
      if (col) map.get(col)!.push(task)
    }
    return map
  }, [tasks])

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <WorkKanbanHeader onRefresh={handleRefresh} refreshing={refreshing} />

      {/* 看板主体 + 右侧 detail panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 三列看板 */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="h-full grid grid-cols-3 gap-4 px-5 py-4 overflow-hidden">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col}
                columnKey={col}
                tasks={grouped.get(col) ?? []}
                onAddTask={col === 'todo' ? () => setCreateOpen(true) : undefined}
              />
            ))}
          </div>
        </div>

        {/* 右侧任务详情 Panel */}
        <div
          className={cn(
            'h-full border-l border-border/60 overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0',
            detailOpen ? 'w-[380px]' : 'w-0',
          )}
          style={{ width: detailOpen ? DETAIL_PANEL_WIDTH : 0 }}
        >
          <WorkTaskDetailPanel />
        </div>
      </div>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

**注意**：此处 `import { getKanbanColumn } from '@luxcoder/shared'` 要确认 `getKanbanColumn` 已从 `packages/shared/src/utils/work-task-status.ts` re-export 到 `@luxcoder/shared` 主入口。在 `packages/shared/src/utils/index.ts` 中确认有 `export * from './work-task-status'`，并且 `packages/shared/src/index.ts` 包含 `export * from './utils'`（或类似路径）。

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/WorkKanbanView.tsx
git commit -m "feat(ui): WorkKanbanView 三列看板主容器（含右侧滑入 Panel）"
```

---

## Task 15: 接入 MainArea + LeftSidebar

**Files:**
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: MainArea 追加 cowork 渲染**

在 `MainArea.tsx` 中追加 import：

```typescript
import { WorkKanbanView } from '@/components/work/WorkKanbanView'
import { appModeAtom } from '@/atoms/app-mode'
```

在 `MainArea` 函数体内追加：
```typescript
const appMode = useAtomValue(appModeAtom)
```

在 return 的 Panel 内（找到 `activeView === 'automations'` 的判断链，在最前面插入）：

```tsx
{appMode === 'cowork' ? (
  <WorkKanbanView />
) : activeView === 'automations' ? (
  automationFormOpen ? <AutomationFormView /> : <AutomationsListView />
) : activeView === 'agent-skills' ? (
  <AgentSkillsView />
) : (
  // 原有 TabBar + TabContent + WelcomeView 逻辑（保持不变）
  ...
)}
```

- [ ] **Step 2: LeftSidebar 隐藏会话列表**

在 `LeftSidebar.tsx` 中找到会话列表、新建按钮等渲染代码，包裹在 `mode !== 'cowork'` 条件下：

```tsx
{mode !== 'cowork' && (
  // 整个会话列表区域（含搜索、新建按钮、列表）
)}
{mode === 'cowork' && (
  <div className="flex-1 flex flex-col items-center justify-center px-3">
    <span className="text-[11px] text-muted-foreground/40 text-center select-none">
      Work 看板
    </span>
  </div>
)}
```

确保 ModeSwitcher（顶部）和 UserAvatar（底部）仍然显示。

- [ ] **Step 3: 运行开发模式目视验证**

```bash
cd apps/electron && bun run dev
```

验证以下交互（按设计稿核对）：
1. 切换到 Work 模式 → 主区域显示三列看板（待办 | 进行中 | 待回写），LeftSidebar 中间区域变为"Work 看板"占位文字
2. 点击「待办」列头 `+` → 弹出 CreateTaskDialog，填写并提交 → 卡片出现在「待办」列
3. 任务卡片上显示 CB-001 编号、类型角标、优先级、负责人 initials
4. 点击任务卡片 → 右侧 Panel 以 380px 宽度滑入，显示任务标题、SPEC-KIT 进度（4 步全未开始）、注入知识包（空 chips）
5. 再次点击同一卡片 → Panel 收起（width → 0）
6. 顶部「同步」按钮点击 → RefreshCw 图标旋转，重新加载任务列表

- [ ] **Step 4: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | grep "error" | head -20
```

预期：0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/tabs/MainArea.tsx \
        apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat(shell): Work 模式接入 MainArea 三列看板 + LeftSidebar 适配"
```

---

## Task 16: 版本号 + 文档更新

**Files:**
- Modify: `apps/electron/package.json`
- Modify: `docs/luxcoder/03-design-decisions.md`

- [ ] **Step 1: 递增版本号**

`apps/electron/package.json` 中 `"version"` patch +1（如 `0.9.5` → `0.9.6`）。

- [ ] **Step 2: 更新 Decision 7 文档**

在 `docs/luxcoder/03-design-decisions.md` Decision 7 的 MVP 实现状态块更新为：

```markdown
**MVP 实现状态（2026-06-29，feature/work-mode-kanban 分支）：**
- ✅ `WorkTask` 独立实体（CB-xxx 编号 + 六阶段内部状态机 + 3 列看板展示）
- ✅ 本地 JSON 持久化（`~/.luxcoder/work-tasks.json`）
- ✅ 三列看板主视图（待办 | 进行中 | 待回写）
- ✅ 右侧滑入 Detail Panel（SPEC-KIT 进度 + 知识包 chips + TB 回写流程）
- ✅ 任务卡片（编号/类型角标/优先级/AI 执行中指示器）
- ⏳ TB API 集成（自动拉取任务 + 状态回写，Phase 2）
- ⏳ 内嵌 AgentView 对话流（Phase 2）
- ⏳ Gerrit 集成（Phase 2）
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron/package.json docs/luxcoder/03-design-decisions.md
git commit -m "chore: v0.9.6 + 更新 Work 模式 MVP 实现状态文档"
```

---

## 依赖前置条件

1. `packages/shared/src/utils/index.ts` 需要 `export * from './work-task-status'`，并且 shared 主入口 `export * from './utils'` — 确认后再执行 Task 3
2. Radix UI `Dialog`、`Select`、`Label`、`Textarea` 已在 `components/ui/` 下存在 — 参照现有 settings 表单
3. `agentStreamingStatesAtom` 在 `agent-atoms.ts` 中存在并为 `Map<string, AgentStreamState>` — 已核实

---

## 自检：Spec 覆盖

| 设计稿要点 | Task | 状态 |
|-----------|------|------|
| CB-xxx 任务编号 | Task 1+3 | ✅ |
| 三列看板（待办/进行中/待回写） | Task 7+14 | ✅ |
| 任务卡片（类型角标/优先级/头像/AI指示器） | Task 6 | ✅ |
| 右侧滑入 Panel（380px） | Task 11+14 | ✅ |
| SPEC-KIT 四步进度条 | Task 8 | ✅ |
| 注入知识包 chips（Skills/RAG/领域） | Task 9 | ✅ |
| TB 回写工作流步骤 | Task 10 | ✅ |
| 看板顶部（连接状态/统计/同步按钮） | Task 13 | ✅ |
| LeftSidebar cowork 适配 | Task 15 | ✅ |
| 状态流转纯函数 + 列映射 | Task 2 | ✅ |
