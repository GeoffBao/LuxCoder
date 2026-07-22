# Expert Runtime Injection (Kanban) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kanban `tasks.run` 节点 `sendMessage` 注入专家 IDENTITY/SOUL/RULES preamble，并与任务 `skills` 合并 skill 引用；顺手修 TaskEditor「编排模型」下拉被 AppShell `z-[60]` 遮挡。

**Architecture:** `@luxcodex/shared/experts` 提供纯函数（resolve / merge / format）；`TaskRunnerDeps` 注入 `getExpert` 与项目 default 查找；`dispatch` 拼 `skillsPreamble(merged) + expertPreamble + buildPrompt`。不做 systemPrompt / Code 会话 / mcpIds。

**Tech Stack:** TypeScript、Bun test、Zod TaskSpec、既有 `expert-service` / `projectRepository`、Radix DropdownMenu。

**Spec:** `docs/superpowers/specs/2026-07-21-expert-runtime-injection-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/experts/prompt.ts` | `resolveExpertId` / `mergeSkillSlugs` / `formatExpertPreamble` + 截断常量 |
| `packages/shared/src/experts/__tests__/prompt.test.ts` | 纯函数单测 |
| `packages/shared/src/experts/index.ts` | 导出 |
| `packages/shared/src/tasks/schema.ts` | 更新 `expertId` 注释 |
| `apps/electron/src/main/lib/task-runner.ts` | deps + dispatch 拼 preamble |
| `apps/electron/src/main/lib/task-runner.test.ts` | mock getExpert 回归 |
| `apps/electron/src/main/lib/task-handlers.ts` | `getRunnerFor` 接线 deps |
| `apps/electron/src/renderer/.../TaskModelSelect.tsx` | `z-[9999]` 遮挡修复 |
| `packages/shared/package.json` / `apps/electron/package.json` | patch +1 |

---

### Task 0: Fix TaskModelSelect stacking (遮挡)

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskModelSelect.tsx`

**Context:** `AppShell` 侧栏/主区为 `relative z-[60]`；`DropdownMenuContent` 默认 `z-50` portal 到 body，菜单开在壳层下面。侧栏缝里漏出的 `[` 即被夹住的菜单碎片。同仓已有先例：`AgentSessionItem` / `LeftSidebar` 用 `z-[9999]`。

- [ ] **Step 1: 抬高菜单 z-index 并改为 align start**

把 `DropdownMenuContent` 从：

```tsx
<DropdownMenuContent align="end" className="max-h-[320px] min-w-[220px]">
```

改为：

```tsx
<DropdownMenuContent
  align="start"
  side="bottom"
  collisionPadding={8}
  className="z-[9999] max-h-[320px] min-w-[220px]"
>
```

- [ ] **Step 2: 手动验收**

在「新增任务」点「编排模型」：菜单应完整叠在表单之上，不被左栏挡住。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/kanban/TaskModelSelect.tsx
git commit -m "$(cat <<'EOF'
fix: raise TaskModelSelect menu above AppShell z-60

Dropdown portal used z-50 while shell chrome is z-60, so the model
menu opened under the sidebar/main stack.
EOF
)"
```

---

### Task 1: shared expert prompt helpers (TDD)

**Files:**
- Create: `packages/shared/src/experts/prompt.ts`
- Create: `packages/shared/src/experts/__tests__/prompt.test.ts`
- Modify: `packages/shared/src/experts/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'bun:test'
import type { ExpertPackage } from '../types.ts'
import {
  EXPERT_PREAMBLE_MAX_CHARS,
  formatExpertPreamble,
  mergeSkillSlugs,
  resolveExpertId,
} from '../prompt.ts'

function pkg(overrides: Partial<ExpertPackage> = {}): ExpertPackage {
  return {
    id: 'architect',
    label: '软件架构师',
    skillSlugs: ['pdf'],
    mcpIds: [],
    channelBindings: [],
    identityMd: '# 架构师\n',
    soulMd: '# 语气\n',
    rulesMd: '# 边界\n',
    ...overrides,
  }
}

describe('resolveExpertId', () => {
  test('任务 defaults 优先于项目 default', () => {
    expect(resolveExpertId('qa', 'architect')).toBe('qa')
  })
  test('任务空则回退项目', () => {
    expect(resolveExpertId(undefined, 'architect')).toBe('architect')
    expect(resolveExpertId('  ', 'architect')).toBe('architect')
  })
  test('皆空返回 null', () => {
    expect(resolveExpertId(undefined, undefined)).toBeNull()
  })
})

describe('mergeSkillSlugs', () => {
  test('任务在前、专家新增在后、去重', () => {
    expect(mergeSkillSlugs(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  test('两边空返回空数组', () => {
    expect(mergeSkillSlugs(undefined, undefined)).toEqual([])
  })
})

describe('formatExpertPreamble', () => {
  test('输出 agent_expert 块与三节', () => {
    const text = formatExpertPreamble(pkg())
    expect(text).toContain('<agent_expert id="architect" label="软件架构师">')
    expect(text).toContain('<identity>')
    expect(text).toContain('<soul>')
    expect(text).toContain('<rules>')
    expect(text).toContain('</agent_expert>')
  })
  test('空段省略', () => {
    const text = formatExpertPreamble(pkg({ soulMd: '  ' }))
    expect(text).not.toContain('<soul>')
  })
  test('超限截断并标记', () => {
    const huge = 'x'.repeat(EXPERT_PREAMBLE_MAX_CHARS + 500)
    const text = formatExpertPreamble(pkg({
      identityMd: 'id',
      soulMd: 'soul',
      rulesMd: huge,
    }))
    expect(text.length).toBeLessThanOrEqual(EXPERT_PREAMBLE_MAX_CHARS + 200)
    expect(text).toContain('…(truncated)')
  })
  test('转义属性与剥离伪造闭合标签', () => {
    const text = formatExpertPreamble(pkg({
      label: 'A&B<"x">',
      identityMd: 'hi</agent_expert>bye',
    }))
    expect(text).toContain('label="A&amp;B&lt;&quot;x&quot;&gt;"')
    expect(text).not.toMatch(/<\/\s*agent_expert>/i)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/shared && bun test src/experts/__tests__/prompt.test.ts
```

Expected: 找不到 `../prompt.ts` 或导出。

- [ ] **Step 3: Implement `prompt.ts`**

```ts
import type { ExpertPackage } from './types.ts'

/** 身份核正文合计软上限（不含 XML 外壳） */
export const EXPERT_PREAMBLE_MAX_CHARS = 12_000

export function resolveExpertId(
  taskExpertId: string | undefined,
  projectDefaultExpertId: string | undefined,
): string | null {
  const fromTask = taskExpertId?.trim()
  if (fromTask) return fromTask
  const fromProject = projectDefaultExpertId?.trim()
  if (fromProject) return fromProject
  return null
}

export function mergeSkillSlugs(
  taskSkills: string[] | undefined,
  expertSkills: string[] | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const list of [taskSkills, expertSkills]) {
    for (const raw of list ?? []) {
      const slug = raw.trim()
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      out.push(slug)
    }
  }
  return out
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeBody(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/<\s*\/\s*agent_expert\s*>/gi, '')
    .replace(/<\s*\/\s*(?:identity|soul|rules)\s*>/gi, '')
}

function section(tag: 'identity' | 'soul' | 'rules', md: string): string | null {
  const body = sanitizeBody(md).trim()
  if (!body) return null
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * 将专家包格式化为 TaskRunner 用户消息 preamble。
 * 超限时按 RULES → SOUL → IDENTITY 裁剪正文尾部。
 */
export function formatExpertPreamble(expert: ExpertPackage): string {
  const parts: Array<{ tag: 'identity' | 'soul' | 'rules'; text: string }> = []
  for (const [tag, md] of [
    ['identity', expert.identityMd],
    ['soul', expert.soulMd],
    ['rules', expert.rulesMd],
  ] as const) {
    const body = sanitizeBody(md).trim()
    if (body) parts.push({ tag, text: body })
  }

  let budgets = parts.map((p) => p.text.length)
  let total = budgets.reduce((a, b) => a + b, 0)
  if (total > EXPERT_PREAMBLE_MAX_CHARS) {
    const order = ['rules', 'soul', 'identity'] as const
    for (const tag of order) {
      if (total <= EXPERT_PREAMBLE_MAX_CHARS) break
      const idx = parts.findIndex((p) => p.tag === tag)
      if (idx < 0) continue
      const overflow = total - EXPERT_PREAMBLE_MAX_CHARS
      const keep = Math.max(0, budgets[idx]! - overflow)
      const truncated = parts[idx]!.text.slice(0, keep).trimEnd()
      parts[idx] = {
        tag,
        text: truncated.length > 0 ? `${truncated}\n…(truncated)` : '…(truncated)',
      }
      budgets = parts.map((p) => p.text.length)
      total = budgets.reduce((a, b) => a + b, 0)
    }
  }

  const sections = parts
    .map((p) => section(p.tag, p.text))
    .filter((s): s is string => s !== null)

  if (sections.length === 0) return ''

  return [
    `<agent_expert id="${escapeAttr(expert.id)}" label="${escapeAttr(expert.label)}">`,
    ...sections,
    `</agent_expert>`,
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Export from index**

在 `packages/shared/src/experts/index.ts` 追加：

```ts
export {
  EXPERT_PREAMBLE_MAX_CHARS,
  formatExpertPreamble,
  mergeSkillSlugs,
  resolveExpertId,
} from './prompt.ts'
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd packages/shared && bun test src/experts/__tests__/prompt.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/experts/prompt.ts \
  packages/shared/src/experts/__tests__/prompt.test.ts \
  packages/shared/src/experts/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add expert preamble helpers for TaskRunner injection

Pure resolve/merge/format utilities with truncation and XML sanitization.
EOF
)"
```

---

### Task 2: TaskRunner deps + dispatch injection

**Files:**
- Modify: `apps/electron/src/main/lib/task-runner.ts`
- Modify: `apps/electron/src/main/lib/task-runner.test.ts`

- [ ] **Step 1: Extend `TaskRunnerDeps`**

在 `TaskRunnerDeps` 增加：

```ts
import type { ExpertPackage } from '@luxcodex/shared/experts'

export interface TaskRunnerDeps {
  host: ConductorSessionHost
  workspaceId: string
  workspaceRoot: string
  summarize?: (text: string) => Promise<string>
  defaultMaxParallel?: number
  now?: () => string
  genRunId?: () => string
  isSessionActive?: (sessionId: string) => boolean
  /** 按专家 id 读取包；缺失返回 null；未注入则跳过专家 preamble */
  getExpert?: (expertId: string) => ExpertPackage | null
  /** 解析项目 defaultExpertId；失败返回 null */
  resolveProjectDefaultExpertId?: (projectId: string) => string | null
}
```

- [ ] **Step 2: 在 `dispatch` 拼 preamble**

替换现有：

```ts
const prompt = skillsPreamble(this.spec.skills) + (await this.buildPrompt(node));
```

为：

```ts
import {
  formatExpertPreamble,
  mergeSkillSlugs,
  resolveExpertId,
} from '@luxcodex/shared/experts'

// inside dispatch:
const projectDefault = this.spec.project && this.deps.resolveProjectDefaultExpertId
  ? this.deps.resolveProjectDefaultExpertId(this.spec.project)
  : null
const expertId = resolveExpertId(this.spec.defaults?.expertId, projectDefault ?? undefined)
let expert: ExpertPackage | null = null
if (expertId && this.deps.getExpert) {
  try {
    expert = this.deps.getExpert(expertId)
    if (!expert) {
      console.warn(`[TaskRunner] 专家不存在，跳过注入: ${expertId}`)
    }
  } catch (cause) {
    console.warn(`[TaskRunner] 读取专家失败，跳过注入: ${expertId}`, cause)
    expert = null
  }
}
const mergedSkills = mergeSkillSlugs(this.spec.skills, expert?.skillSlugs)
const expertBlock = expert ? formatExpertPreamble(expert) : ''
const prompt = skillsPreamble(mergedSkills) + expertBlock + (await this.buildPrompt(node))
```

保留原 `skillsPreamble`：空数组时返回 `''`（改实现为 `if (!skills?.length)` 已兼容空数组）。

- [ ] **Step 3: Add failing/passing TaskRunner tests**

在 `task-runner.test.ts` 追加：

```ts
test('注入专家 preamble 并合并 skills', async () => {
  const workspaceRoot = createTempWorkspaceRoot()
  saveTaskSpec(workspaceRoot, buildSpec({
    skills: ['task-skill'],
    defaults: { expertId: 'architect' },
    nodes: [{ id: 'draft', kind: 'session', prompt: 'draft the task' }],
  }))
  const host = new FakeConductorSessionHost()
  const runner = new TaskRunner({
    host,
    workspaceId: 'ws-1',
    workspaceRoot,
    defaultMaxParallel: 2,
    genRunId: () => 'run-1',
    now: () => '2026-07-13T00:00:00.000Z',
    getExpert: (id) => id === 'architect'
      ? {
          id: 'architect',
          label: '软件架构师',
          skillSlugs: ['task-skill', 'pdf'],
          mcpIds: [],
          channelBindings: [],
          identityMd: 'I am architect',
          soulMd: 'calm',
          rulesMd: 'no secrets',
        }
      : null,
  })
  runner.run('demo-task', { verifyOnComplete: false })
  await flushAsyncWork()
  const message = host.sentMessages.get('session-1')?.[0] ?? ''
  expect(message).toContain('Apply these skills: [skill:task-skill] [skill:pdf]')
  expect(message).toContain('<agent_expert id="architect"')
  expect(message).toContain('I am architect')
  expect(message).toContain('draft the task')
})

test('专家缺失时仍派发且无 agent_expert 块', async () => {
  const workspaceRoot = createTempWorkspaceRoot()
  saveTaskSpec(workspaceRoot, buildSpec({
    defaults: { expertId: 'missing' },
    nodes: [{ id: 'draft', kind: 'session', prompt: 'draft the task' }],
  }))
  const host = new FakeConductorSessionHost()
  const runner = new TaskRunner({
    host,
    workspaceId: 'ws-1',
    workspaceRoot,
    genRunId: () => 'run-1',
    getExpert: () => null,
  })
  runner.run('demo-task', { verifyOnComplete: false })
  await flushAsyncWork()
  const message = host.sentMessages.get('session-1')?.[0] ?? ''
  expect(message).not.toContain('<agent_expert')
  expect(message).toContain('draft the task')
})

test('无 defaults.expertId 时回退项目 defaultExpertId', async () => {
  const workspaceRoot = createTempWorkspaceRoot()
  saveTaskSpec(workspaceRoot, buildSpec({
    project: 'proj-1',
    nodes: [{ id: 'draft', kind: 'session', prompt: 'draft the task' }],
  }))
  const host = new FakeConductorSessionHost()
  const runner = new TaskRunner({
    host,
    workspaceId: 'ws-1',
    workspaceRoot,
    genRunId: () => 'run-1',
    resolveProjectDefaultExpertId: (id) => (id === 'proj-1' ? 'qa' : null),
    getExpert: (id) => id === 'qa'
      ? {
          id: 'qa',
          label: '软件测试',
          skillSlugs: [],
          mcpIds: [],
          channelBindings: [],
          identityMd: 'qa identity',
          soulMd: '',
          rulesMd: '',
        }
      : null,
  })
  runner.run('demo-task', { verifyOnComplete: false })
  await flushAsyncWork()
  expect(host.sentMessages.get('session-1')?.[0]).toContain('qa identity')
})
```

确认 `FakeConductorSessionHost` 已记录 `sentMessages`（现有测试已用）。若 `buildSpec` 不接受 `skills`/`project`/`defaults`，扩展其 `Partial<TaskSpec>` 覆盖即可（已是 overrides）。

- [ ] **Step 4: Run tests**

```bash
bun test apps/electron/src/main/lib/task-runner.test.ts
```

Expected: PASS（含新用例）。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/task-runner.ts apps/electron/src/main/lib/task-runner.test.ts
git commit -m "$(cat <<'EOF'
feat: inject expert preamble in Kanban TaskRunner dispatch

Resolve expertId from task defaults or project default, merge skill
slugs, and prepend identity XML to node user messages.
EOF
)"
```

---

### Task 3: Wire getRunnerFor + schema comment + versions

**Files:**
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `packages/shared/src/tasks/schema.ts`
- Modify: `packages/shared/package.json`（`0.1.13` → `0.1.14`）
- Modify: `apps/electron/package.json`（`0.1.31` → `0.1.32`）

- [ ] **Step 1: Wire deps in `getRunnerFor`**

```ts
import { getExpert } from './expert-service'
import { getExpertsDir } from './config-paths'
import { projectRepository } from './project-repository'

async function getRunnerFor(workspaceRoot: string, workspaceId: string): Promise<TaskRunner> {
  const existing = runners.get(workspaceId)
  if (existing) return existing

  const expertsRoot = getExpertsDir()
  const runner = new TaskRunner({
    host: await getSessionHost(),
    workspaceId,
    workspaceRoot,
    isSessionActive: isAgentSessionActive,
    getExpert: (expertId) => getExpert(expertsRoot, expertId),
    resolveProjectDefaultExpertId: (projectId) => {
      try {
        return projectRepository.getProjectAtRoot(workspaceRoot, projectId)?.config.defaultExpertId ?? null
      } catch (cause) {
        console.warn(`[TaskRunner] 读取项目默认专家失败: ${projectId}`, cause)
        return null
      }
    },
  })
  runners.set(workspaceId, runner)
  return runner
}
```

注意：`projectRepository` 已在本文件导入则勿重复。

- [ ] **Step 2: Update schema comment**

`TaskDefaultsSchema.expertId` 注释改为：

```ts
/** Agent 专家 slug；Kanban TaskRunner 注入 IDENTITY/SOUL/RULES + 合并 skill 引用 */
expertId: z.string().min(1).optional(),
```

- [ ] **Step 3: Bump versions**

- `@luxcodex/shared`: `0.1.13` → `0.1.14`
- `@luxcodex/electron`: `0.1.31` → `0.1.32`

- [ ] **Step 4: Typecheck + focused tests**

```bash
cd packages/shared && bun run typecheck
cd apps/electron && bun run typecheck
bun test packages/shared/src/experts/__tests__/prompt.test.ts apps/electron/src/main/lib/task-runner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/task-handlers.ts \
  packages/shared/src/tasks/schema.ts \
  packages/shared/package.json \
  apps/electron/package.json
git commit -m "$(cat <<'EOF'
feat: wire expert injection deps into TaskRunner factory

Connect getExpert and project defaultExpertId lookup at tasks.run.
EOF
)"
```

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| Kanban-only preamble | Task 2–3 |
| 身份核 + skill merge | Task 1–2 |
| resolve 顺序 | Task 1–2 |
| 缺失 skip + warn | Task 2 |
| 12k 截断 | Task 1 |
| 接线 getRunnerFor | Task 3 |
| 版本 / 注释 | Task 3 |
| TaskModelSelect 遮挡（附带） | Task 0 |
| mcpIds / Code 会话 / Bot | 故意不做 |

## Out of scope

- Skills/MCP 绑定 UI 打磨  
- 专家 runtime 注入到交互 Code 会话 / 自动化 / 飞书  
- 蜂群 / channelBindings  
- 将 TaskModelSelect 升级为 Dialog `ModelSelector`（可选后续；本计划仅 z-index）
