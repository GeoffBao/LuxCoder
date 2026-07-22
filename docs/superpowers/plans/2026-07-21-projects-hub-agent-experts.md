# 项目中心 Hub + Agent 专家 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Code 左栏「项目中心 / Agent 专家」改为入口行 → 全屏主区（对齐 Agent 技能）；项目可挂 `defaultExpertId`；专家包文件壳可读可写；不做 runtime 注入与 Bot。

**Architecture:** 扩展 `activeViewAtom`（`projects` | `agent-experts`）覆盖主区；看板仍走 `codeMainView='work'`。项目列表从侧栏迁到 `ProjectsHubView`。专家包落在 `~/.luxcoder[-dev]/experts/{slug}/`，经主进程 IPC 读写。Skills 仅以 slug 引用写入 `expert.json`。

**Tech Stack:** React 18、Jotai、Bun test、TypeScript、Electron IPC、`@luxcoder/shared` ProjectConfig、Tailwind / 现有 SidebarModule + AgentSkillsView 视觉模式。

**Spec:** `docs/superpowers/specs/2026-07-21-projects-hub-agent-experts-design.md`

---

## File map

| 文件 | 职责 |
|------|------|
| `apps/electron/src/renderer/atoms/active-view.ts` | `ActiveView` 扩枚举 |
| `apps/electron/src/renderer/components/app-shell/code-main-view-model.ts` | 覆盖视图判定（看板让位） |
| `apps/electron/src/renderer/components/tabs/MainArea.tsx` | 渲染 Hub / 专家视图 |
| `apps/electron/src/renderer/components/app-shell/AppShell.tsx` | 右栏在覆盖视图时隐藏 |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | 模块顺序：技能→专家→项目中心 |
| `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx` | 改为「项目中心」入口行 |
| `apps/electron/src/renderer/components/work/ProjectsHubView.tsx` | 项目 Hub UI |
| `apps/electron/src/renderer/components/work/projects-hub-model.ts` | Hub 导航/过滤纯函数 |
| `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx` | 默认专家选择器 |
| `apps/electron/src/renderer/components/work/project-view-model.ts` | `defaultExpertId` 进 update patch |
| `apps/electron/src/renderer/components/app-shell/kanban/types.ts` | `KanbanProject.defaultExpertId` |
| `packages/shared/src/projects/types.ts` | `ProjectConfig` / `UpdateProjectInput.defaultExpertId` |
| `packages/shared/src/experts/`（新建） | `ExpertManifest`、解析、内置目录常量 |
| `apps/electron/src/main/lib/config-paths.ts` | `getExpertsDir()` |
| `apps/electron/src/main/lib/expert-service.ts`（新建） | seed / list / get / update |
| `apps/electron/src/main/ipc.ts` + preload | experts IPC |
| `apps/electron/src/renderer/components/agent-experts/`（新建） | `AgentExpertsView` + card/detail |
| `apps/electron/package.json` / `packages/shared/package.json` | patch +1 |

---

### Task 1: ActiveView 扩展 + 覆盖视图纯函数

**Files:**
- Modify: `apps/electron/src/renderer/atoms/active-view.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/code-main-view-model.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts`

- [ ] **Step 1: 写失败测试 — 覆盖视图包含 projects / agent-experts**

在 `code-main-view-model.test.ts` 追加：

```ts
test('projects / agent-experts 覆盖视图优先，看板让位', () => {
  expect(shouldShowWorkViewInCode({
    appMode: 'agent',
    codeMainView: 'work',
    activeView: 'projects',
  })).toBe(false)
  expect(shouldShowWorkViewInCode({
    appMode: 'agent',
    codeMainView: 'work',
    activeView: 'agent-experts',
  })).toBe(false)
})

test('isOverlayActiveView 识别四类覆盖视图', () => {
  expect(isOverlayActiveView('conversations')).toBe(false)
  expect(isOverlayActiveView('automations')).toBe(true)
  expect(isOverlayActiveView('agent-skills')).toBe(true)
  expect(isOverlayActiveView('projects')).toBe(true)
  expect(isOverlayActiveView('agent-experts')).toBe(true)
})
```

并在同文件顶部从 `code-main-view-model` 导入 `isOverlayActiveView`。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts`

Expected: FAIL（`projects` 不在 ActiveView / `isOverlayActiveView` 未导出）

- [ ] **Step 3: 最小实现**

`active-view.ts`：

```ts
export type ActiveView =
  | 'conversations'
  | 'automations'
  | 'agent-skills'
  | 'projects'
  | 'agent-experts'
```

`code-main-view-model.ts`：

```ts
export function isOverlayActiveView(activeView: ActiveView): boolean {
  return (
    activeView === 'automations' ||
    activeView === 'agent-skills' ||
    activeView === 'projects' ||
    activeView === 'agent-experts'
  )
}

export function shouldShowWorkViewInCode({
  appMode,
  codeMainView,
  activeView,
}: CodeMainViewInput): boolean {
  return (
    appMode === 'agent' &&
    codeMainView === 'work' &&
    activeView === 'conversations'
  )
}
```

（`shouldShowWorkViewInCode` 逻辑可不变；覆盖视图测试依赖 ActiveView 类型可赋值。）

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/atoms/active-view.ts \
  apps/electron/src/renderer/components/app-shell/code-main-view-model.ts \
  apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts
git commit -m "feat: extend ActiveView with projects and agent-experts overlays"
```

---

### Task 2: ProjectConfig.defaultExpertId 类型贯通

**Files:**
- Modify: `packages/shared/src/projects/types.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`
- Modify: `apps/electron/src/renderer/components/work/project-view-model.ts`
- Modify: `apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts`
- Modify: `packages/shared/package.json`（patch +1，如 `0.1.10` → `0.1.11`）

- [ ] **Step 1: 写失败测试 — buildProjectUpdate 带 defaultExpertId**

在 `project-view-model.test.ts` 追加（按现有 `buildProjectUpdate` 签名扩展）：

```ts
test('buildProjectUpdate 写入 defaultExpertId', () => {
  const patch = buildProjectUpdate({
    name: 'Demo',
    description: '',
    details: '',
    color: '',
    workingDirectory: '',
    defaultExpertId: 'architect',
  })
  expect(patch.defaultExpertId).toBe('architect')
})

test('buildProjectUpdate 空 defaultExpertId 清除为 undefined', () => {
  const patch = buildProjectUpdate({
    name: 'Demo',
    description: '',
    details: '',
    color: '',
    workingDirectory: '',
    defaultExpertId: '',
  })
  expect(patch.defaultExpertId).toBeUndefined()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts`

Expected: FAIL（draft 无 `defaultExpertId`）

- [ ] **Step 3: 最小实现**

`packages/shared/src/projects/types.ts` — `ProjectConfig` 与 `UpdateProjectInput` 增加：

```ts
/** 项目默认 Agent 专家 slug；缺失表示未设置。不在本阶段注入 runtime。 */
defaultExpertId?: string;
```

`KanbanProject` 增加同名字段。

`ProjectSettingsDraft` / `ProjectUpdatePatch` 增加 `defaultExpertId?: string`。

`buildProjectUpdate`：

```ts
export function buildProjectUpdate(draft: ProjectSettingsDraft): ProjectUpdatePatch {
  const patch: ProjectUpdatePatch = {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    details: optionalText(draft.details),
    color: optionalText(draft.color),
    workingDirectory: optionalText(draft.workingDirectory),
  }
  if (draft.kanbanColumns) patch.kanbanColumns = draft.kanbanColumns
  const expertId = optionalText(draft.defaultExpertId ?? '')
  if (expertId) patch.defaultExpertId = expertId
  else patch.defaultExpertId = undefined
  return patch
}
```

确认 preload `BrowserProject` 已是 `ProjectConfig & { workspaceId }`，字段会自动透传；若 `projects.update` 映射白名单存在，加入 `defaultExpertId`。

Bump `@luxcoder/shared` patch。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts packages/shared/src/projects/__tests__/storage.test.ts`

Expected: PASS（storage 测试若构造完整 ProjectConfig，补可选字段即可）

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/electron/src/renderer/components/work/project-view-model.ts \
  apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts \
  apps/electron/src/renderer/components/app-shell/kanban/types.ts
git commit -m "feat: add ProjectConfig.defaultExpertId"
```

---

### Task 3: projects-hub-model 纯函数

**Files:**
- Create: `apps/electron/src/renderer/components/work/projects-hub-model.ts`
- Create: `apps/electron/src/renderer/components/work/__tests__/projects-hub-model.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from 'bun:test'
import {
  resolveExpertLabel,
  shouldOpenProjectsHub,
  type ExpertOption,
} from '../projects-hub-model'

const EXPERTS: ExpertOption[] = [
  { id: 'general', label: '通用专家' },
  { id: 'architect', label: '软件架构师' },
]

describe('projects-hub-model', () => {
  test('shouldOpenProjectsHub 仅 agent 模式', () => {
    expect(shouldOpenProjectsHub('agent')).toBe(true)
    expect(shouldOpenProjectsHub('chat')).toBe(false)
    expect(shouldOpenProjectsHub('cowork')).toBe(true)
  })

  test('resolveExpertLabel 缺失回退未设置', () => {
    expect(resolveExpertLabel('architect', EXPERTS)).toBe('软件架构师')
    expect(resolveExpertLabel('missing', EXPERTS)).toBe('未设置')
    expect(resolveExpertLabel(undefined, EXPERTS)).toBe('未设置')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/renderer/components/work/__tests__/projects-hub-model.test.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
import type { AppMode } from '@/atoms/app-mode'

export interface ExpertOption {
  id: string
  label: string
}

export function shouldOpenProjectsHub(mode: AppMode): boolean {
  return mode === 'agent' || mode === 'cowork'
}

export function resolveExpertLabel(
  expertId: string | undefined,
  experts: readonly ExpertOption[],
): string {
  if (!expertId) return '未设置'
  return experts.find((e) => e.id === expertId)?.label ?? '未设置'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/renderer/components/work/__tests__/projects-hub-model.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/work/projects-hub-model.ts \
  apps/electron/src/renderer/components/work/__tests__/projects-hub-model.test.ts
git commit -m "feat: add projects hub view-model helpers"
```

---

### Task 4: 侧栏「项目中心」入口行 + 模块顺序（专家入口先占位）

**Files:**
- Modify: `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

- [ ] **Step 1: 改写 SidebarProjectsSection 为纯入口**

删除折叠列表 / 搜索 / `CreateProjectDialog`（新建改到 Hub）。整文件收敛为：

```tsx
export function SidebarProjectsSection({
  count,
}: { count: number }): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const mode = useAtomValue(appModeAtom)
  if (!shouldOpenProjectsHub(mode)) return <></>

  return (
    <SidebarModule
      icon={FolderKanban}
      title="项目中心"
      count={count}
      active={useAtomValue(activeViewAtom) === 'projects'}
      onClick={() => setActiveView('projects')}
      ariaLabel={`项目中心，${count} 个项目`}
    />
  )
}
```

（`useAtomValue` 提到组件顶层，勿内联 hooks。）

- [ ] **Step 2: LeftSidebar 装配顺序**

在 Agent 技能入口之后插入 Agent 专家占位（可先 `onClick={() => setActiveView('agent-experts')}`，视图 Task 9 再接）：

```tsx
{/* Agent 技能 */}
{/* Agent 专家 — 仅 agent */}
{/* 项目中心 — agent | cowork */}
```

把原 `SidebarProjectsSection` 块移到专家之后；传入 `count={currentWorkspaceProjects.length}`。

- [ ] **Step 3: AppShell 右栏隐藏**

```ts
activeView !== 'automations' &&
activeView !== 'agent-skills' &&
activeView !== 'projects' &&
activeView !== 'agent-experts'
```

- [ ] **Step 4: 手动冒烟（dev）**

Run: 已有 `bun run dev` 时热更即可。点「项目中心」——此时 MainArea 可能空白/落到会话（Task 5 前可接受）。确认侧栏无展开项目列表。

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx \
  apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx \
  apps/electron/src/renderer/components/app-shell/AppShell.tsx
git commit -m "feat: projects hub sidebar entry and module order"
```

---

### Task 5: ProjectsHubView + MainArea

**Files:**
- Create: `apps/electron/src/renderer/components/work/ProjectsHubView.tsx`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`

- [ ] **Step 1: 实现 ProjectsHubView**

对齐 `AgentSkillsView` 顶栏结构（标题「项目中心」、搜索、归档开关、新建按钮 + `CreateProjectDialog`）。

数据：`serverKanbanProjectsAtom` + 当前 workspaceSlug 过滤（逻辑可复制原 `SidebarProjectsSection`）。

导航：

```ts
const openBoard = (projectId: string): void => {
  setSelectedProjectId(projectId)
  setWorkView('board')
  setCodeMainView('work')
  setActiveView('conversations')
}

const openDetail = (projectId: string): void => {
  setSelectedProjectId(projectId)
  setWorkView('project')
  setCodeMainView('work')
  setActiveView('conversations')
}
```

卡片展示：色点、名称、描述、`resolveExpertLabel(project.defaultExpertId, …)`（专家列表暂用内置常量 `BUILTIN_EXPERT_OPTIONS`，Task 7 后再换成 IPC 数据亦可先 hardcode 10 项）。

无 `workspaceRoot`：空态文案「请先选择工作区」。

- [ ] **Step 2: MainArea 分支**

在 `agent-skills` 分支旁增加：

```tsx
) : activeView === 'projects' ? (
  <ProjectsHubView />
) : activeView === 'agent-experts' ? (
  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
    Agent 专家加载中…
  </div>
) : (
```

（专家占位页，Task 9 替换。）

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/components/work/ProjectsHubView.tsx \
  apps/electron/src/renderer/components/tabs/MainArea.tsx
git commit -m "feat: add ProjectsHubView full-page hub"
```

---

### Task 6: ProjectInfoPage 默认专家选择器

**Files:**
- Modify: `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx`

- [ ] **Step 1: settingsDraft 增加 defaultExpertId**

同步 `useEffect` 与保存路径：`buildProjectUpdate` 已支持；`<select>` 选项用与 Hub 相同的内置专家列表。

文案提示（muted）：「将用于任务默认专家（运行时后续接入）」。

- [ ] **Step 2: 手动验证**

Hub → 详情 → 选「软件架构师」→ 保存 → 回 Hub 卡片徽标显示「软件架构师」。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/work/ProjectInfoPage.tsx
git commit -m "feat: edit project defaultExpertId on ProjectInfoPage"
```

---

### Task 7: shared 专家类型 + 内置目录 + expert.json 解析

**Files:**
- Create: `packages/shared/src/experts/types.ts`
- Create: `packages/shared/src/experts/catalog.ts`
- Create: `packages/shared/src/experts/parse-expert.ts`
- Create: `packages/shared/src/experts/index.ts`
- Create: `packages/shared/src/experts/__tests__/parse-expert.test.ts`
- Modify: `packages/shared/package.json` exports（若需 `./experts`）与 patch

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from 'bun:test'
import { parseExpertJson, BUILTIN_EXPERT_DEFINITIONS } from '../index'

describe('parseExpertJson', () => {
  test('解析合法 expert.json', () => {
    const manifest = parseExpertJson(JSON.stringify({
      id: 'architect',
      label: '软件架构师',
      skillSlugs: ['brainstorming'],
      mcpIds: [],
      channelBindings: [],
    }))
    expect(manifest.id).toBe('architect')
    expect(manifest.skillSlugs).toEqual(['brainstorming'])
    expect(manifest.channelBindings).toEqual([])
  })

  test('非法 JSON 抛错', () => {
    expect(() => parseExpertJson('{')).toThrow()
  })

  test('内置目录含 10 个 slug', () => {
    expect(BUILTIN_EXPERT_DEFINITIONS.map((d) => d.id)).toEqual([
      'general', 'driver', 'application', 'system', 'communication',
      'delivery-manager', 'se', 'architect', 'qa', 'reviewer',
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/shared/src/experts/__tests__/parse-expert.test.ts`

Expected: FAIL

- [ ] **Step 3: 最小实现**

```ts
// types.ts
export interface ExpertChannelBinding {
  channel: 'feishu' | 'discord'
  accountId: string
}

export interface ExpertManifest {
  id: string
  label: string
  skillSlugs: string[]
  mcpIds: string[]
  channelBindings: ExpertChannelBinding[]
}

export interface ExpertDefinition {
  id: string
  label: string
  /** IDENTITY.md 种子一句话 */
  identitySummary: string
}

export interface ExpertPackage extends ExpertManifest {
  identityMd: string
  soulMd: string
  rulesMd: string
}
```

`catalog.ts`：导出 `BUILTIN_EXPERT_DEFINITIONS`（10 项，中文 label 与 spec 一致）。

`parse-expert.ts`：校验 `id`/`label` 为 string；数组字段缺省 `[]`；`channelBindings` 过滤非法项。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/shared/src/experts/__tests__/parse-expert.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/experts packages/shared/package.json
git commit -m "feat: add shared expert manifest types and builtin catalog"
```

---

### Task 8: 主进程 expert-service + IPC + preload

**Files:**
- Modify: `apps/electron/src/main/lib/config-paths.ts` — `getExpertsDir()`
- Create: `apps/electron/src/main/lib/expert-service.ts`
- Create: `apps/electron/src/main/lib/__tests__/expert-service.test.ts`（可用 tmpdir）
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`
- 若有共享 IPC 常量文件则追加 `EXPERT_IPC_CHANNELS`

- [ ] **Step 1: 写失败测试 — seed + list**

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listExperts, seedBuiltinExperts, updateExpertManifest } from '../expert-service'

describe('expert-service', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'experts-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  test('seed 后 list 含 10 个专家', () => {
    seedBuiltinExperts(root)
    const list = listExperts(root)
    expect(list).toHaveLength(10)
    expect(list.map((e) => e.id).sort()).toContain('architect')
  })

  test('updateExpertManifest 可写 skillSlugs', () => {
    seedBuiltinExperts(root)
    updateExpertManifest(root, 'architect', { skillSlugs: ['pdf'] })
    const again = listExperts(root).find((e) => e.id === 'architect')
    expect(again?.skillSlugs).toEqual(['pdf'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/main/lib/__tests__/expert-service.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现 service**

- `getExpertsDir()` → `join(getConfigDir(), 'experts')`
- `seedBuiltinExperts(dir)`：对每个 builtin，若目录不存在则写 `IDENTITY.md` / `SOUL.md` / `RULES.md` / `expert.json`（中文短种子即可）
- `listExperts`：读子目录，坏包 skip
- `getExpert` / `updateExpertFiles`（可选更新三 md）/ `updateExpertManifest`

IPC 建议：

```ts
'experts:list'
'experts:get'
'experts:update-manifest'
'experts:update-files'
'experts:seed' // 或启动时自动 seed
```

启动路径（`runtime-init` 或现有 seed 旁）调用一次 `seedBuiltinExperts(getExpertsDir())`。

preload 暴露 `window.electronAPI.experts.{ list, get, updateManifest, updateFiles }`。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/main/lib/__tests__/expert-service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/config-paths.ts \
  apps/electron/src/main/lib/expert-service.ts \
  apps/electron/src/main/lib/__tests__/expert-service.test.ts \
  apps/electron/src/main/ipc.ts \
  apps/electron/src/preload/index.ts
git commit -m "feat: expert package seed and IPC"
```

---

### Task 9: AgentExpertsView + 侧栏接真视图

**Files:**
- Create: `apps/electron/src/renderer/components/agent-experts/AgentExpertsView.tsx`
- Create: `apps/electron/src/renderer/components/agent-experts/ExpertCard.tsx`
- Create: `apps/electron/src/renderer/components/agent-experts/ExpertDetailSheet.tsx`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（专家 count）

- [ ] **Step 1: 实现 AgentExpertsView**

- mount 时 `experts.list()`；失败 toast
- 网格卡片：label、id、skillSlugs 数量
- 点卡片 → `ExpertDetailSheet`：编辑 IDENTITY/SOUL/RULES 文本 + skillSlugs（可用多行输入或简单 tag；P0 不强制 MCP 多选 UI，可显示 `mcpIds` 只读空数组）
- 保存调用 `updateFiles` / `updateManifest`
- 无 Bot UI；`channelBindings` 不展示或显示「后续接入」

- [ ] **Step 2: MainArea 替换占位**

```tsx
) : activeView === 'agent-experts' ? (
  <AgentExpertsView />
```

- [ ] **Step 3: typecheck**

Run: `cd apps/electron && bun run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/components/agent-experts \
  apps/electron/src/renderer/components/tabs/MainArea.tsx \
  apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat: AgentExpertsView full-page module"
```

---

### Task 10: Hub 专家列表接 IPC + 版本 bump + 回归

**Files:**
- Modify: `ProjectsHubView.tsx` / `ProjectInfoPage.tsx` — 专家选项来自 `experts.list()`（失败回退 `BUILTIN_EXPERT_DEFINITIONS`）
- Modify: `apps/electron/package.json`（`0.1.28` → `0.1.29`）
- 若 shared 本轮已 bump，确认 workspace 引用正常

- [ ] **Step 1: 接 IPC 选项源**

共享小 hook `useExpertOptions()`：`list` → `{ id, label }[]`。

- [ ] **Step 2: 跑相关测试**

Run:

```bash
bun test apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts \
  apps/electron/src/renderer/components/work/__tests__/projects-hub-model.test.ts \
  apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts \
  packages/shared/src/experts/__tests__/parse-expert.test.ts \
  apps/electron/src/main/lib/__tests__/expert-service.test.ts
```

Expected: 全部 PASS

- [ ] **Step 3: 手动 BDD 清单**

1. Code：左栏序 = 自动任务 → Agent 技能 → Agent 专家 → 项目中心 → 会话  
2. 点项目中心 → Hub；侧栏无展开列表  
3. Hub 点项目 → 看板过滤  
4. 详情设默认专家 → Hub 徽标更新  
5. 点 Agent 专家 → 10 张卡片；可改 SOUL 保存  
6. Chat：无项目中心 / Agent 专家  

- [ ] **Step 4: Commit**

```bash
git add apps/electron/package.json apps/electron/src/renderer/components/work \
  apps/electron/src/renderer/components/agent-experts
git commit -m "chore: wire expert options to hub and bump electron 0.1.29"
```

---

## Spec coverage self-check

| Spec 要求 | Task |
|-----------|------|
| activeView `projects` / `agent-experts` | 1, 5, 9 |
| 左栏顺序技能→专家→项目中心 | 4 |
| 入口行不展开项目列表 | 4 |
| ProjectsHubView + 进看板/详情 | 5 |
| defaultExpertId 持久化+展示 | 2, 6, 10 |
| 专家 10 slug + 文件包 + IPC | 7, 8, 9 |
| Chat 隐藏两入口 | 4（`shouldOpenProjectsHub` + 专家仅 agent） |
| 不做 runtime / 蜂群 / Bot UI | 全任务均未包含 |
| electron patch | 10 |

## Out of scope

- TaskEditor 枚举扩表（P1）
- orchestrator 注入专家 prompt
- Feishu/Discord `channelBindings` 配置 UI
- Module Registry 大重构
