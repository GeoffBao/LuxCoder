# TaskEditor Agent 专家 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先交付可预览的 TaskEditor「手动 / 生成」双模式、Agent 专家选择器和计划生成状态界面，不在本阶段连接专家 Skill 的主进程注入。

**Architecture:** 将纯 UI 枚举与专家文案放入 `task-editor-ui-model.ts`，将生成空闲态和加载态拆到 `TaskEditorGenerationPanel.tsx`，`TaskEditor.tsx` 只负责模式切换与既有生成动作。底层 orchestrator 模型仍保留在 Draft 中但不再显示，专家选择本阶段保持局部状态，避免写入尚未安装的 Skill slug。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Lucide、Bun test、Vite。

## Global Constraints

- 不新增依赖。
- 只修改 TaskEditor 相关 Renderer 文件、对应测试、实施计划和 `apps/electron/package.json` patch 版本。
- 状态管理遵循现有边界：页面局部视觉状态使用 React state，跨页面状态继续使用 Jotai。
- 中文文案与日志优先；禁止 `any`。
- 保留旧 TaskSpec 的 `orchModel` 与 `orchConnection` 往返，不在 UI 中暴露模型输入。
- 本阶段不写入专家 Skill slug，不修改 Preload、IPC、主进程和默认 Skills。
- 未经用户允许不修改 `README.md` 与 `AGENTS.md`。

---

### Task 1: TaskEditor UI 状态模型

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/kanban/task-editor-ui-model.ts`
- Create: `apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-ui-model.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `TaskEditorMode`、`TaskExpertId`、`TaskExpertOption`、`TASK_EXPERT_OPTIONS`、`getTaskExpertOption()`。

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test'
import { getTaskExpertOption, TASK_EXPERT_OPTIONS } from '../task-editor-ui-model'

describe('TaskEditor Agent 专家 UI', () => {
  test('提供通用、驱动、系统、应用和通信五类专家', () => {
    expect(TASK_EXPERT_OPTIONS.map((expert) => expert.id)).toEqual([
      'general', 'driver', 'system', 'application', 'communication',
    ])
  })

  test('未知专家回退到通用专家', () => {
    expect(getTaskExpertOption('missing').id).toBe('general')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-ui-model.test.ts`

Expected: FAIL，提示找不到 `task-editor-ui-model`。

- [ ] **Step 3: Implement the minimal UI model**

```ts
export type TaskEditorMode = 'manual' | 'generate'

export type TaskExpertId = 'general' | 'driver' | 'system' | 'application' | 'communication'

export interface TaskExpertOption {
  id: TaskExpertId
  label: string
  description: string
}

export const TASK_EXPERT_OPTIONS: readonly TaskExpertOption[] = [
  { id: 'general', label: '通用专家', description: '适合跨领域任务，使用工作区默认能力。' },
  { id: 'driver', label: '驱动专家', description: '聚焦设备驱动、HAL、内核接口与硬件调试。' },
  { id: 'system', label: '系统专家', description: '聚焦操作系统、运行时、系统服务与稳定性。' },
  { id: 'application', label: '应用专家', description: '聚焦产品应用、界面体验与业务逻辑。' },
  { id: 'communication', label: '通信专家', description: '聚焦网络协议、IPC、连接与可靠传输。' },
]

export function getTaskExpertOption(id: string): TaskExpertOption {
  return TASK_EXPERT_OPTIONS.find((expert) => expert.id === id) ?? TASK_EXPERT_OPTIONS[0]!
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-ui-model.test.ts`

Expected: 2 pass，0 fail。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/kanban/task-editor-ui-model.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-ui-model.test.ts
git commit -m "test: define task editor expert options"
```

### Task 2: 生成模式展示组件

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/kanban/TaskEditorGenerationPanel.tsx`

**Interfaces:**
- Consumes: `generating: boolean`、`onGenerate: () => void`。
- Produces: `TaskEditorGenerationPanel` React 组件。

- [ ] **Step 1: Add the production component**

```tsx
import type * as React from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface TaskEditorGenerationPanelProps {
  generating: boolean
  onGenerate: () => void
}

export function TaskEditorGenerationPanel({ generating, onGenerate }: TaskEditorGenerationPanelProps): React.ReactElement {
  if (generating) {
    return (
      <div className="flex min-h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><LoaderCircle className="h-5 w-5 animate-spin" /></span>
          <div><h2 className="text-sm font-semibold">正在生成你的计划…</h2><p className="text-xs text-muted-foreground">Agent 正在组织子任务图，通常需要一两分钟。</p></div>
        </div>
        {[0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-muted/45" />)}
      </div>
    )
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-6 py-10 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.08),transparent_55%)]" />
      <div className="relative flex max-w-md flex-col items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm"><Sparkles className="h-7 w-7" /></span>
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">调研 → 计划 → 实施</span>
        <h2 className="text-base font-semibold">生成初始计划</h2>
        <p className="text-sm leading-6 text-muted-foreground">根据目标生成可编辑的子任务 DAG，运行前可以调整每个节点与依赖关系。</p>
        <Button onClick={onGenerate}><Sparkles className="h-4 w-4" />生成初始计划</Button>
        <p className="text-xs text-muted-foreground/75">之后可以编辑所有内容。</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the component typechecks through the renderer build after Task 3 integration**

Run after Task 3: `bun run --cwd apps/electron build:renderer`

Expected: Vite build succeeds。

### Task 3: 集成双模式与专家选择器

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskEditor.tsx`
- Modify: `apps/electron/package.json`

**Interfaces:**
- Consumes: `TaskEditorGenerationPanel`、`TaskEditorMode`、`TaskExpertId`、`TASK_EXPERT_OPTIONS`、`getTaskExpertOption()`。
- Produces: 可交互的手动/生成切换、Agent 专家下拉框、生成 idle/loading/success UI。

- [ ] **Step 1: Add local UI state and generation success transition**

```tsx
const [mode, setMode] = React.useState<TaskEditorMode>('manual')
const [expertId, setExpertId] = React.useState<TaskExpertId>('general')
const expert = getTaskExpertOption(expertId)

// applySpec 成功回填后：
setMode('manual')
```

- [ ] **Step 2: Add the segmented mode control below 任务定义**

```tsx
<div className="inline-flex w-fit rounded-lg bg-muted/70 p-1">
  {(['manual', 'generate'] as TaskEditorMode[]).map((value) => (
    <button
      key={value}
      type="button"
      disabled={generating}
      onClick={() => setMode(value)}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition', mode === value && 'bg-card text-foreground shadow-sm')}
    >
      {value === 'generate' && <Sparkles className="h-3.5 w-3.5" />}
      {value === 'manual' ? '手动' : '生成'}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Replace the visible orchestrator model field with Agent 专家**

```tsx
<label className="space-y-1.5 text-xs font-medium">
  Agent 专家
  <select value={expertId} onChange={(event) => setExpertId(event.target.value as TaskExpertId)} className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm">
    {TASK_EXPERT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>
  <span className="block text-[11px] font-normal leading-4 text-muted-foreground">{expert.description}</span>
</label>
```

- [ ] **Step 4: Switch the right panel by mode and remove the old bottom generation button**

```tsx
{mode === 'generate' ? (
  <section className="min-h-0 overflow-y-auto rounded-2xl bg-card shadow-sm">
    <TaskEditorGenerationPanel generating={generating} onGenerate={() => void generate()} />
  </section>
) : (
  <section className="flex min-h-0 flex-col rounded-2xl bg-card shadow-sm">
    <header className="flex items-center gap-2 px-4 py-3">
      <div><h2 className="font-semibold">子任务 DAG</h2><p className="text-xs text-muted-foreground">依赖关系决定执行顺序。</p></div>
      <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{draft.subtasks.length}</span>
      <Button variant="outline" size="sm" className="ml-auto" onClick={addSubtask}><Plus className="h-4 w-4" />添加节点</Button>
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
      {draft.subtasks.map((subtask, index) => (
        <SubtaskCard
          key={subtask.uid}
          index={index}
          subtask={subtask}
          allSubtasks={draft.subtasks}
          onChange={(patch) => updateSubtask(subtask.uid, patch)}
          onRemove={() => removeSubtask(subtask.uid)}
        />
      ))}
      {draft.subtasks.length === 0 && <button type="button" onClick={addSubtask} className="w-full rounded-xl border border-dashed border-border/70 py-12 text-sm text-muted-foreground hover:bg-muted/40"><Plus className="mx-auto mb-2 h-5 w-5" />添加第一个子任务</button>}
    </div>
  </section>
)}
```

- [ ] **Step 5: Bump Electron patch version**

Change `apps/electron/package.json` version from `0.1.12` to `0.1.13`.

- [ ] **Step 6: Run focused and package verification**

Run:

```bash
bun test apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-ui-model.test.ts apps/electron/src/renderer/components/app-shell/kanban/__tests__/task-editor-model.test.ts
bun run --cwd apps/electron typecheck
bun run --cwd apps/electron build:renderer
```

Expected: all tests pass，typecheck 和 renderer build 成功。

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/kanban/TaskEditor.tsx apps/electron/src/renderer/components/app-shell/kanban/TaskEditorGenerationPanel.tsx apps/electron/package.json
git commit -m "feat: add task expert generation UI"
```

### Task 4: Electron UI smoke verification

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: completed TaskEditor UI.
- Produces: visual verification evidence for manual mode, generate idle mode, and generate loading mode.

- [ ] **Step 1: Start the app**

Run: `bun run dev`

Expected: Vite and Electron start without a white screen。

- [ ] **Step 2: Verify TaskEditor interactions**

Check:

- 新建完整任务默认显示手动模式。
- 专家下拉包含五类专家并更新说明文案。
- 切换到生成模式显示“生成初始计划”中心面板。
- 点击生成且目标为空时保持输入并显示提示。
- 填写目标后点击生成显示加载骨架。
- 手动模式 DAG 的添加、编辑与删除入口保持可见。

- [ ] **Step 3: Stop dev processes and inspect final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors；只出现本计划声明的文件和用户原有未提交文件。
