# `create_task` Agent 工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `create_task` Agent 工具：对话中直接落一张 `todo` 状态的看板任务（task.yaml + orchestrator 会话），只创建不运行；跟现有"新建任务"表单共享同一条落盘逻辑，接入 LuxCoder 现成的内置 MCP 注册中心。

**Architecture:** `packages/shared/src/tasks/build-minimal-spec.ts` 从工具入参构建单节点 `TaskSpec`；`task-handlers.ts` 抽出 `materializeTaskFromSpec`（落盘 + 建会话），供现有 IPC handler 和新工具共用；`apps/electron/src/main/lib/create-task-agent-tool.ts` 仿照 `automation-agent-tools.ts` 的单一职责结构，通过 SDK MCP Server 暴露工具；接入 `builtin-mcp/registry.ts` + `default-mcp.json`（内置 MCP 展示/开关的单一事实源）。

**Tech Stack:** TypeScript + Zod（spec 校验）+ `@anthropic-ai/claude-agent-sdk`（`createSdkMcpServer`/`tool`）。只做 Claude runtime，不做 Pi（比照 `automation-agent-tools.ts` 的先例，见设计文档"非目标"）。

---

## 依赖说明

Task 1-2（共享纯函数层）互相独立。Task 3（`task-handlers.ts` 重构）是一次行为不变的抽取，必须先做完并验证通过，Task 6（新工具实现）才能安全依赖它。Task 4-5（分类元数据 + manifest 注册）互相独立，可以在 Task 1-2 之后、Task 6-7 之前任意顺序做。Task 6 依赖 Task 1、2、3。Task 7 依赖 Task 6。

---

### Task 1: `slugify` 迁移到 `packages/shared/src/utils/`

**Files:**
- Create: `packages/shared/src/utils/slug.ts`
- Create: `packages/shared/src/utils/__tests__/slug.test.ts`
- Modify: `packages/shared/src/utils/index.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/task-spec-form.ts`

- [ ] **Step 1: 写出 `slug.ts`**

```ts
/** 通用 slug 化：转小写、非字母数字折叠成单个连字符、去首尾连字符、限长 48 字符。 */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}
```

（跟 `task-spec-form.ts` 现有实现逐字符一致，只是搬了位置、箭头函数改普通函数声明以匹配 `utils/` 目录里其他文件的风格——若发现该目录已有约定用箭头函数导出常量，改用箭头函数以保持一致，不要引入新风格。）

- [ ] **Step 2: 写测试**

```ts
import { describe, expect, test } from 'bun:test'
import { slugify } from '../slug'

describe('slugify', () => {
  test('转小写并用连字符折叠非字母数字', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
  })

  test('去除首尾连字符', () => {
    expect(slugify('  --Foo Bar--  ')).toBe('foo-bar')
  })

  test('限长 48 字符', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long)).toHaveLength(48)
  })

  test('空字符串返回空字符串', () => {
    expect(slugify('   ')).toBe('')
  })
})
```

- [ ] **Step 3: 在 `utils/index.ts` 里加导出**

```diff
 export { calculateContextUsageRatio } from './context-usage'
+export { slugify } from './slug'
```

- [ ] **Step 4: `task-spec-form.ts` 改为从 shared 导入，删除本地实现**

```diff
+import { slugify } from '@luxcoder/shared/utils'
 import { MAX_REPAIR_ATTEMPTS_CAP, TaskSpecSchema } from '@luxcoder/shared/tasks/schema'
 import type { PermissionMode, TaskSpec } from '@luxcoder/shared/tasks/schema'
 
 let _uid = 0
 export const uid = (): string => `st-${++_uid}`
 
 ...
-
-export const slugify = (s: string): string =>
-  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
```

（`task-spec-form.ts` 里其余对 `slugify` 的调用不用改——名字没变，只是来源换了。删除本地定义前先确认它是本文件里唯一一处 `export const slugify`。）

- [ ] **Step 5: 类型检查 + 测试**

Run: `bun run typecheck && bun test slug.test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/utils/slug.ts packages/shared/src/utils/__tests__/slug.test.ts packages/shared/src/utils/index.ts apps/electron/src/renderer/components/app-shell/kanban/task-spec-form.ts
git commit -m "refactor(shared): move slugify to packages/shared/src/utils"
```

---

### Task 2: `buildMinimalTaskSpec` 纯函数

**Files:**
- Create: `packages/shared/src/tasks/build-minimal-spec.ts`
- Create: `packages/shared/src/tasks/__tests__/build-minimal-spec.test.ts`
- Modify: `packages/shared/src/tasks/index.ts`

- [ ] **Step 1: 写出 `build-minimal-spec.ts`**

```ts
import { slugify } from '../utils/slug.ts'
import { TaskSpecSchema, type TaskSpec } from './schema.ts'

export interface BuildMinimalTaskSpecInput {
  title: string
  description: string
  acceptanceCriteria?: string
  sources?: string[]
  skills?: string[]
  llmConnection?: string
  model?: string
  workingDirectory?: string
  projectId?: string
}

/**
 * 从简单字段构建单节点 TaskSpec：description 同时作为 goal 与唯一节点的 prompt。
 * 节点 kind 不显式设置，走 schema 默认值 'session'（与 task-spec-form.ts 的 buildSpec
 * 对手写节点的既有约定一致）。供 create_task Agent 工具使用；不支持多节点 DAG——
 * 需要编排多个节点时应走现有 TaskEditor 手动/生成流程，不是本函数的场景。
 */
export function buildMinimalTaskSpec(input: BuildMinimalTaskSpecInput): TaskSpec {
  const title = input.title.trim()
  const description = input.description.trim()
  const acceptanceCriteria = input.acceptanceCriteria?.trim()
  const defaults: Record<string, unknown> = {}
  if (input.model) defaults.model = input.model
  if (input.llmConnection) defaults.llmConnection = input.llmConnection

  return TaskSpecSchema.parse({
    id: slugify(title) || 'untitled-task',
    title: title || 'Untitled task',
    goal: description || title || 'Untitled task',
    ...(acceptanceCriteria ? { acceptance_criteria: acceptanceCriteria } : {}),
    ...(input.projectId ? { project: input.projectId } : {}),
    ...(input.workingDirectory ? { cwd: input.workingDirectory } : {}),
    ...(input.sources?.length ? { sources: input.sources } : {}),
    ...(input.skills?.length ? { skills: input.skills } : {}),
    ...(Object.keys(defaults).length ? { defaults } : {}),
    nodes: [{ id: 'main', prompt: description || title || 'Untitled task' }],
  })
}
```

- [ ] **Step 2: 写测试**

```ts
import { describe, expect, test } from 'bun:test'
import { buildMinimalTaskSpec } from '../build-minimal-spec.ts'

describe('buildMinimalTaskSpec', () => {
  test('最小输入：id 由 title 派生，goal/首节点 prompt 用 description', () => {
    const spec = buildMinimalTaskSpec({ title: 'Fix Login Bug', description: '修复登录页报错' })
    expect(spec.id).toBe('fix-login-bug')
    expect(spec.title).toBe('Fix Login Bug')
    expect(spec.goal).toBe('修复登录页报错')
    expect(spec.nodes).toHaveLength(1)
    expect(spec.nodes[0]).toMatchObject({ id: 'main', prompt: '修复登录页报错' })
    expect(spec.nodes[0]!.kind).toBeUndefined()
  })

  test('可选字段全部映射到对应 spec 字段', () => {
    const spec = buildMinimalTaskSpec({
      title: 'T',
      description: 'D',
      acceptanceCriteria: 'AC',
      sources: ['docs'],
      skills: ['skill-a'],
      llmConnection: 'conn-1',
      model: 'model-1',
      workingDirectory: '/tmp/proj',
      projectId: 'proj-1',
    })
    expect(spec.acceptance_criteria).toBe('AC')
    expect(spec.sources).toEqual(['docs'])
    expect(spec.skills).toEqual(['skill-a'])
    expect(spec.defaults).toEqual({ llmConnection: 'conn-1', model: 'model-1' })
    expect(spec.cwd).toBe('/tmp/proj')
    expect(spec.project).toBe('proj-1')
  })

  test('省略可选字段时 spec 不包含对应 key', () => {
    const spec = buildMinimalTaskSpec({ title: 'T', description: 'D' })
    expect(spec.sources).toBeUndefined()
    expect(spec.skills).toBeUndefined()
    expect(spec.defaults).toBeUndefined()
    expect(spec.cwd).toBeUndefined()
    expect(spec.project).toBeUndefined()
  })

  test('title 全是符号时 slug 回退为 untitled-task', () => {
    const spec = buildMinimalTaskSpec({ title: '###', description: 'D' })
    expect(spec.id).toBe('untitled-task')
  })
})
```

- [ ] **Step 3: 加进 `tasks/index.ts` barrel**

```diff
 export * from './schema.ts';
 export * from './refs.ts';
 export * from './validate.ts';
 export * from './generator-prompt.ts';
+export * from './build-minimal-spec.ts';
```

- [ ] **Step 4: 类型检查 + 测试**

Run: `bun run typecheck && bun test build-minimal-spec.test`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/tasks/build-minimal-spec.ts packages/shared/src/tasks/__tests__/build-minimal-spec.test.ts packages/shared/src/tasks/index.ts
git commit -m "feat(shared): add buildMinimalTaskSpec for single-node task creation"
```

---

### Task 3: `task-handlers.ts` 抽出 `materializeTaskFromSpec`

**Files:**
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.test.ts`

这是一次**行为不变**的重构——现有 `TASK_IPC_CHANNELS.CREATE` handler 的对外行为（含"挂接到既有会话"分支）不能有任何变化，只是把"落盘 + 建新会话"这部分逻辑抽出来给下一个任务的新工具复用。

- [ ] **Step 1: 核对现状**

找到 `ipcMain.handle(TASK_IPC_CHANNELS.CREATE, ...)`（约第 446-488 行），当前代码：

```tsx
  ipcMain.handle(TASK_IPC_CHANNELS.CREATE, async (_event, workspaceRoot: string, workspaceId: string, request: {
    yaml: string
    orchestratorSessionId?: string
    attachToExistingSessionId?: string
  }) => {
    const parsed = parseTaskYaml(request.yaml)
    if (!parsed.valid || !parsed.spec) {
      throw new Error(`task.yaml 验证失败: ${parsed.errors?.map((error) => error.message).join(', ')}`)
    }
    saveTaskSpec(workspaceRoot, parsed.spec)

    const sessionId = request.attachToExistingSessionId ?? request.orchestratorSessionId
    const seed = buildTaskSessionSeed(parsed.spec, workspaceRoot)
    if (sessionId) {
      if (!getAgentSessionMeta(sessionId)) throw new Error(`Agent 会话不存在: ${sessionId}`)
      await updateAgentSessionMeta(
        sessionId,
        request.orchestratorSessionId
          ? buildAdoptedTaskSessionPatch(parsed.spec, workspaceRoot)
          : {
              taskSlug: parsed.spec.id,
              ...(parsed.spec.project ? { projectId: parsed.spec.project } : {}),
              ...seed,
            },
      )
    } else {
      const session = await (await getSessionHost()).createSession(workspaceId, {
        name: parsed.spec.title,
        projectId: parsed.spec.project,
        taskSlug: parsed.spec.id,
        sessionStatus: 'todo',
        ...(seed.workingDirectory ? { workingDirectory: seed.workingDirectory } : {}),
        ...(seed.modelId ? { model: seed.modelId } : {}),
        ...(seed.channelId ? { llmConnection: seed.channelId } : {}),
        ...(parsed.spec.defaults?.permissionMode
          ? { permissionMode: parsed.spec.defaults.permissionMode }
          : {}),
      })
      return { slug: parsed.spec.id, orchestratorSessionId: session.id, valid: true }
    }

    return { slug: parsed.spec.id, orchestratorSessionId: sessionId, valid: true }
  })
```

- [ ] **Step 2: 在 `getSessionHost` 定义之后新增导出函数 `materializeTaskFromSpec`**

紧跟在 `function getSessionHost(): Promise<LuxCoderConductorSessionHost> { ... }` 之后插入（需要 `TaskSpec` 类型导入，见 Step 5）：

```ts
/**
 * 落盘 task.yaml 并创建全新的 orchestrator 会话（sessionStatus: 'todo'，只创建不运行）。
 * tasks:create IPC（新建路径）与 create_task Agent 工具共用此函数，避免两条创建路径分叉。
 * 不支持"挂接到既有会话"——那是 IPC handler 自己的分支，调用方是表单 UI 的编辑场景，
 * Agent 工具没有这个场景，不需要覆盖。
 */
export async function materializeTaskFromSpec(
  workspaceRoot: string,
  workspaceId: string,
  spec: TaskSpec,
): Promise<{ slug: string; orchestratorSessionId: string }> {
  saveTaskSpec(workspaceRoot, spec)
  const seed = buildTaskSessionSeed(spec, workspaceRoot)
  const session = await (await getSessionHost()).createSession(workspaceId, {
    name: spec.title,
    projectId: spec.project,
    taskSlug: spec.id,
    sessionStatus: 'todo',
    ...(seed.workingDirectory ? { workingDirectory: seed.workingDirectory } : {}),
    ...(seed.modelId ? { model: seed.modelId } : {}),
    ...(seed.channelId ? { llmConnection: seed.channelId } : {}),
    ...(spec.defaults?.permissionMode ? { permissionMode: spec.defaults.permissionMode } : {}),
  })
  return { slug: spec.id, orchestratorSessionId: session.id }
}
```

- [ ] **Step 3: 改写 CREATE handler，调用新函数**

```diff
     const parsed = parseTaskYaml(request.yaml)
     if (!parsed.valid || !parsed.spec) {
       throw new Error(`task.yaml 验证失败: ${parsed.errors?.map((error) => error.message).join(', ')}`)
     }
-    saveTaskSpec(workspaceRoot, parsed.spec)
 
     const sessionId = request.attachToExistingSessionId ?? request.orchestratorSessionId
-    const seed = buildTaskSessionSeed(parsed.spec, workspaceRoot)
     if (sessionId) {
+      saveTaskSpec(workspaceRoot, parsed.spec)
+      const seed = buildTaskSessionSeed(parsed.spec, workspaceRoot)
       if (!getAgentSessionMeta(sessionId)) throw new Error(`Agent 会话不存在: ${sessionId}`)
       await updateAgentSessionMeta(
         sessionId,
         request.orchestratorSessionId
           ? buildAdoptedTaskSessionPatch(parsed.spec, workspaceRoot)
           : {
               taskSlug: parsed.spec.id,
               ...(parsed.spec.project ? { projectId: parsed.spec.project } : {}),
               ...seed,
             },
       )
+      return { slug: parsed.spec.id, orchestratorSessionId: sessionId, valid: true }
     } else {
-      const session = await (await getSessionHost()).createSession(workspaceId, {
-        name: parsed.spec.title,
-        projectId: parsed.spec.project,
-        taskSlug: parsed.spec.id,
-        sessionStatus: 'todo',
-        ...(seed.workingDirectory ? { workingDirectory: seed.workingDirectory } : {}),
-        ...(seed.modelId ? { model: seed.modelId } : {}),
-        ...(seed.channelId ? { llmConnection: seed.channelId } : {}),
-        ...(parsed.spec.defaults?.permissionMode
-          ? { permissionMode: parsed.spec.defaults.permissionMode }
-          : {}),
-      })
-      return { slug: parsed.spec.id, orchestratorSessionId: session.id, valid: true }
+      const result = await materializeTaskFromSpec(workspaceRoot, workspaceId, parsed.spec)
+      return { ...result, valid: true }
     }
-
-    return { slug: parsed.spec.id, orchestratorSessionId: sessionId, valid: true }
   })
```

> 关键点：原代码 `saveTaskSpec` 和 `return` 语句在 if/else 分支外面各只有一份，重构后两个分支必须**各自**保证"保存一次、返回一次"——`sessionId` 分支现在显式调用 `saveTaskSpec` + 显式 `return`（原来靠落到分支外的公共 `return` 语句），`else` 分支的 `saveTaskSpec` 挪进了 `materializeTaskFromSpec` 内部。改完之后通读一遍确认两个分支都不会因为漏掉 `return` 而继续执行到函数末尾。

- [ ] **Step 4: 确认 `TaskSpec` 类型已导入**

Run: `grep -n "^import type" apps/electron/src/main/lib/task-handlers.ts | head -5`

如果 `TaskSpec` 不在现有 `import type { ... } from '@luxcoder/shared'` 或类似语句里，补一条：

```diff
+import type { TaskSpec } from '@luxcoder/shared/tasks/schema'
```

- [ ] **Step 5: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 6: 补充针对 `materializeTaskFromSpec` 的单测**

`getSessionHost()` 内部调用 `createLuxCoderConductorSessionHost()`（从 `./conductor-session-host` 导入），真实实现会做超出纯函数单测范围的初始化。核实过其 `createSession(workspaceId, options): Promise<{ id: string }>` 的返回形状很简单，在现有 `mock.module('electron', ...)` 之前再加一段模块 mock，桩掉这个依赖。

在 `apps/electron/src/main/lib/task-handlers.test.ts` 顶部、`mock.module('electron', ...)` 语句**之前**插入：

```ts
mock.module('./conductor-session-host', () => ({
  createLuxCoderConductorSessionHost: async () => ({
    createSession: async (_workspaceId: string, options: { name?: string }) => ({
      id: `fake-session-${options.name ?? 'untitled'}`,
    }),
  }),
}))
```

在顶部 `const { pauseTaskRun, stopTaskRun }: typeof import('./task-handlers') = await import('./task-handlers')` 这一行，把 `materializeTaskFromSpec` 也加进解构（它是导出函数，不需要走文件里其他用例的 `Reflect.get` 软失败模式）：

```diff
 const {
   pauseTaskRun,
   stopTaskRun,
+  materializeTaskFromSpec,
 }: typeof import('./task-handlers') = await import('./task-handlers')
```

在文件末尾（`describe('task handler Kanban payloads', ...)` 之后）新增一个 `describe` 块：

```ts
describe('materializeTaskFromSpec', () => {
  test('落盘 task.yaml 并创建 todo 状态的新会话', async () => {
    const { loadTaskSpec } = await import('@luxcoder/shared/tasks/storage')
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'luxcoder-materialize-task-'))
    try {
      const spec = {
        id: 'demo-task',
        title: 'Demo Task',
        goal: '完成一件事',
        runner: 'conduct' as const,
        nodes: [{ id: 'main', kind: 'session' as const, prompt: '完成一件事' }],
      }

      const result = await materializeTaskFromSpec(workspaceRoot, 'workspace-1', spec)

      expect(result.slug).toBe('demo-task')
      expect(result.orchestratorSessionId).toBe('fake-session-Demo Task')

      const loaded = loadTaskSpec(workspaceRoot, 'demo-task')
      expect(loaded?.valid).toBe(true)
      expect(loaded?.spec?.title).toBe('Demo Task')
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})
```

> `nodes[0].kind` 这里显式写了 `'session'`——`TaskSpecSchema` 的 `nodes` 字段要求至少一个元素且 `kind` 有 `.default('session')`，直接手写字面量对象（不经过 `TaskSpecSchema.parse`）时默认值不会自动补上，所以显式写更保险，避免类型报错或 `runner`/`kind` 缺失导致的意外行为。

- [ ] **Step 7: 运行测试**

Run: `cd apps/electron && bun test task-handlers`
Expected: 全部通过，覆盖既有 CREATE handler 用例（如果存在）+ 新增的 `materializeTaskFromSpec` 用例

- [ ] **Step 8: 手动回归（先做这一步再继续后面任务）**

Run: `bun run dev`，走一遍现有"新建任务"表单流程（TaskEditor 手动创建一个简单任务），确认：
- 任务正常出现在看板上，状态为 `todo`
- 打开该任务的 orchestrator 会话，标题/工作目录/模型等字段跟改动前一致

如果这一步发现行为跟改动前不一致，回到 Step 3 检查分支逻辑，不要跳过直接进入下一个任务。

- [ ] **Step 9: Commit**

```bash
git add apps/electron/src/main/lib/task-handlers.ts apps/electron/src/main/lib/task-handlers.test.ts
git commit -m "refactor(main): extract materializeTaskFromSpec from tasks:create handler"
```

---

### Task 4: `BuiltinMcpCategory` 新增 `'task'`

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `apps/electron/src/renderer/components/agent-skills/BuiltinMcpDetailSheet.tsx`

- [ ] **Step 1: 扩展 category 联合类型**

找到：

```ts
export type BuiltinMcpCategory = 'system' | 'automation' | 'collaboration' | 'memory' | 'media' | 'browser'
```

改为：

```ts
export type BuiltinMcpCategory = 'system' | 'automation' | 'collaboration' | 'memory' | 'media' | 'browser' | 'task'
```

- [ ] **Step 2: 补上中文标签**

找到 `BuiltinMcpDetailSheet.tsx` 里的：

```tsx
const CATEGORY_LABELS: Record<BuiltinMcpServerSummary['category'], string> = {
  system: '系统',
  automation: '自动化',
  collaboration: '协作',
  memory: '记忆',
  media: '媒体',
  browser: '浏览器',
}
```

改为：

```tsx
const CATEGORY_LABELS: Record<BuiltinMcpServerSummary['category'], string> = {
  system: '系统',
  automation: '自动化',
  collaboration: '协作',
  memory: '记忆',
  media: '媒体',
  browser: '浏览器',
  task: '任务',
}
```

（`Record<BuiltinMcpServerSummary['category'], string>` 是穷尽类型，Step 1 改完类型后，这里如果漏加会直接类型报错——但仍然按上面写全，不要依赖编译器报错才补。）

- [ ] **Step 3: 类型检查**

Run: `bun run typecheck`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/agent.ts apps/electron/src/renderer/components/agent-skills/BuiltinMcpDetailSheet.tsx
git commit -m "feat(ui): add 'task' builtin MCP category"
```

---

### Task 5: `default-mcp.json` 注册 `create-task` 条目

**Files:**
- Modify: `apps/electron/src/main/lib/builtin-mcp/default-mcp.json`

- [ ] **Step 1: 在 `servers` 数组里新增一项**

参照现有 `automation`/`collaboration` 条目的位置和格式，新增：

```json
{
  "id": "create-task",
  "name": "create_task",
  "displayName": "创建任务",
  "description": "在 Agent 对话中直接创建看板任务（写 task.yaml + 建 orchestrator 会话），只创建不运行。",
  "category": "task",
  "kind": "internal",
  "deletable": false,
  "defaultEnabled": true,
  "toggleable": true,
  "tools": [
    { "name": "create_task", "description": "创建一个 todo 状态的看板任务，不自动运行。" }
  ]
}
```

放在 `servers` 数组末尾（`nano-banana` 条目之后，或数组最后一项之后），保持 JSON 合法（注意逗号）。

- [ ] **Step 2: 确认 JSON 合法且能被加载**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('apps/electron/src/main/lib/builtin-mcp/default-mcp.json', 'utf8')).servers.length)"`
Expected: 输出的数字比改动前多 1（正好是新增的这一项）

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错（`baseline.ts` 是 `import ... with { type: 'json' }`，结构错了会在这里体现）

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/builtin-mcp/default-mcp.json
git commit -m "feat(main): register create-task in builtin MCP manifest"
```

---

### Task 6: 新建 `create-task-agent-tool.ts`

**Files:**
- Create: `apps/electron/src/main/lib/create-task-agent-tool.ts`

- [ ] **Step 1: 写出文件**

```ts
/**
 * Agent 内置"创建任务"工具
 *
 * 通过 SDK MCP Server 暴露 create_task：对话中直接把一张 todo 状态的看板任务
 * 落到当前工作区（task.yaml + orchestrator 会话），只创建不运行，是否启动交给
 * 用户或自动化决定。跟"新建任务"表单共用 materializeTaskFromSpec，不重复实现落盘逻辑。
 */

import { buildMinimalTaskSpec } from '@luxcoder/shared/tasks'
import { getAgentSessionMeta } from './agent-session-manager'
import { getAgentWorkspace, getWorkspaceMcpConfig, getWorkspaceSkills } from './agent-workspace-manager'
import { getAgentWorkspacePath } from './config-paths'
import { materializeTaskFromSpec } from './task-handlers'

export interface CreateTaskToolContext {
  sessionId: string
  workspaceId: string
}

interface CreateTaskToolResult extends Record<string, unknown> {
  content: Array<{ type: 'text'; text: string }>
}

function jsonResult(payload: unknown): CreateTaskToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

/** 校验 sources/skills 里的未知 slug，返回 warning 文案数组（不阻断创建，对齐 craft 语义）。 */
function collectUnknownSlugWarnings(
  workspaceSlug: string,
  sources: string[] | undefined,
  skills: string[] | undefined,
): string[] {
  const warnings: string[] = []
  if (sources?.length) {
    const known = new Set(Object.keys(getWorkspaceMcpConfig(workspaceSlug).servers ?? {}))
    const unknown = sources.filter((s) => !known.has(s))
    if (unknown.length) warnings.push(`未知的 source slug（已忽略校验，仍会写入 spec）: ${unknown.join(', ')}`)
  }
  if (skills?.length) {
    const known = new Set(getWorkspaceSkills(workspaceSlug).map((s) => s.slug))
    const unknown = skills.filter((s) => !known.has(s))
    if (unknown.length) warnings.push(`未知的 skill slug（已忽略校验，仍会写入 spec）: ${unknown.join(', ')}`)
  }
  return warnings
}

export async function injectCreateTaskMcpServer(
  sdk: typeof import('@anthropic-ai/claude-agent-sdk'),
  mcpServers: Record<string, Record<string, unknown>>,
  ctx: CreateTaskToolContext,
): Promise<void> {
  const { z } = await import('zod')

  const server = sdk.createSdkMcpServer({
    name: 'create-task',
    version: '1.0.0',
    tools: [
      sdk.tool(
        'create_task',
        `在当前工作区创建一个 Craft 风格的看板任务——写 task.yaml 并创建其 orchestrator 会话。CREATION ONLY：任务落地后状态为 todo，不会自动运行；是否启动由用户或自动化决定。

提供 title + description（description 会成为任务目标和首个节点的 prompt）。可选：acceptanceCriteria（验收标准）、sources / skills（工作区已注册的 slug）、llmConnection + model、workingDirectory、projectId（省略时继承当前会话所属项目）。

返回 { slug, orchestratorSessionId, warnings }——未知的 source/skill slug 会作为 warning 返回，不会阻断创建。用户要求"记录/排队/建个任务"时用这个工具；要立即执行工作，用当前会话或委派子会话，不要用这个工具。`,
        {
          title: z.string().trim().min(1).describe('任务标题'),
          description: z.string().trim().min(1).describe('任务目标，同时作为唯一节点的 prompt'),
          acceptanceCriteria: z.string().optional().describe('验收标准，供 orchestrator 判断任务是否完成'),
          sources: z.array(z.string()).optional().describe('要启用的 source（MCP）slug 列表'),
          skills: z.array(z.string()).optional().describe('要启用的 skill slug 列表'),
          llmConnection: z.string().optional().describe('指定渠道 connection；不传则继承工作区默认'),
          model: z.string().optional().describe('指定模型；不传则继承工作区默认'),
          workingDirectory: z.string().optional().describe('任务工作目录；不传则回退到项目/工作区默认'),
          projectId: z.string().optional().describe('绑定的项目 ID；不传则继承当前会话所属项目'),
        },
        async (args) => {
          const workspace = getAgentWorkspace(ctx.workspaceId)
          if (!workspace) return jsonResult({ error: `工作区不存在: ${ctx.workspaceId}` })
          const workspaceRoot = getAgentWorkspacePath(workspace.slug)

          const projectId = args.projectId ?? getAgentSessionMeta(ctx.sessionId)?.projectId
          const warnings = collectUnknownSlugWarnings(workspace.slug, args.sources, args.skills)

          const spec = buildMinimalTaskSpec({
            title: args.title,
            description: args.description,
            acceptanceCriteria: args.acceptanceCriteria,
            sources: args.sources,
            skills: args.skills,
            llmConnection: args.llmConnection,
            model: args.model,
            workingDirectory: args.workingDirectory,
            projectId,
          })

          const result = await materializeTaskFromSpec(workspaceRoot, ctx.workspaceId, spec)
          return jsonResult({ ...result, warnings })
        },
      ),
    ],
  })

  mcpServers['create-task'] = server as unknown as Record<string, unknown>
  console.log('[Agent 编排] 已注入内置创建任务工具 (create-task)')
}
```

- [ ] **Step 2: 确认引用的函数确实从这些路径导出**

Run: `grep -n "^export function getAgentWorkspace\b\|^export function getWorkspaceSkills\b\|^export function getWorkspaceMcpConfig\b" apps/electron/src/main/lib/agent-workspace-manager.ts`
Run: `grep -n "^export function getAgentWorkspacePath\b" apps/electron/src/main/lib/config-paths.ts`
Run: `grep -n "^export function getAgentSessionMeta\b" apps/electron/src/main/lib/agent-session-manager.ts`

Expected: 每条都能找到对应导出。如果签名跟本文件假设的不一致（参数顺序、返回类型），照实际签名调整上面的代码，不要硬改成不存在的签名。

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/create-task-agent-tool.ts
git commit -m "feat(main): add create_task Agent tool"
```

---

### Task 7: 接入 `builtin-mcp/registry.ts`

**Files:**
- Modify: `apps/electron/src/main/lib/builtin-mcp/registry.ts`

- [ ] **Step 1: 导入新注入函数**

```diff
 import { injectAgentCollaborationMcpServer } from '../agent-collaboration-tools'
 import { injectAutomationMcpServer } from '../automation-agent-tools'
+import { injectCreateTaskMcpServer } from '../create-task-agent-tool'
 import { injectNanoBananaMcpServer } from '../chat-tools/nano-banana-mcp'
 import { isBuiltinMcpUserEnabled } from './settings'
```

- [ ] **Step 2: 在 `injectBuiltinMcpServers` 里新增注入调用**

找到 `automation` 那一段（`if (isBuiltinMcpUserEnabled('automation')) { ... }`），在它之后、`collaborationAvailable` 判断之前插入：

```ts
  if (isBuiltinMcpUserEnabled('create-task') && !!ctx.workspaceId) {
    await injectBuiltinSafely('create-task', () => injectCreateTaskMcpServer(ctx.sdk, ctx.mcpServers, {
      sessionId: ctx.sessionId,
      workspaceId: ctx.workspaceId!,
    }))
  }
```

（`ctx.workspaceId` 类型是 `string | undefined`（见 `BuiltinMcpInjectContext`），加 `!!ctx.workspaceId` 门槛并在调用处用 `!` 断言，跟 `collaborationAvailable` 判断里 `!!ctx.workspaceId` 的写法保持一致；没有 workspaceId 就没有 workspaceRoot 可用，工具注入了也无法工作。）

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/builtin-mcp/registry.ts
git commit -m "feat(main): wire create_task into builtin MCP registry"
```

---

### Task 8: 最终验证

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型检查**

Run: `bun run typecheck`
Expected: 通过，无报错

- [ ] **Step 2: 全量单测**

Run: `bun test`
Expected: pass 数不少于改动前基线；不允许出现新增失败（历史已知的 3 个 electron 模块导入相关失败允许存在）

- [ ] **Step 3: 手动验收**

Run: `bun run dev`

- [ ] Code 模式下跟 Agent 对话，明确要求"帮我创建一个任务，标题 XXX，做 YYY"，确认 Agent 调用了 `create_task` 工具
- [ ] 看板上出现对应的 `todo` 卡片，**没有自动运行**
- [ ] 不传 `projectId` 时，新任务继承了当前会话绑定的项目（先让会话绑定一个项目再测）
- [ ] 传一个不存在的 skill slug，确认任务仍然创建成功，工具返回里能看到 warning
- [ ] 设置面板的能力列表能看到"创建任务"分类为"任务"、默认开启；手动关闭后新开的 Agent 对话里工具不再出现
- [ ] 通过现有"新建任务"表单手动建一个任务，确认行为与改动前一致（Task 3 的回归检查在这里再确认一次，走完整应用而不是单测）

- [ ] **Step 4: 若发现问题，回到对应任务修复并重新提交**

不要在这一步引入新功能或顺手改动范围外的代码，只修复本次改动引入的问题。
