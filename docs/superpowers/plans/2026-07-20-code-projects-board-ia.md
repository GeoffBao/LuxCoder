# Code Projects + Board IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Work-mode right-rail Projects panel, mount a compact Projects section in the LeftSidebar (Work + Code), and make create → detail carry craft-aligned fields including `workingDirectory`.

**Architecture:** Reuse `serverKanbanProjectsAtom` / `selectedProjectIdAtom` / `workViewAtom`. Extract sidebar-capable list UI from `ProjectsListPanel`, delete the WorkBoardView aside, restore `workingDirectory` on the browser project bridge (currently stripped), and edit it on `ProjectInfoPage` settings. Kanban stays a main-area Board view — not a left-rail peer.

**Tech Stack:** React 18, Jotai, Radix Dialog, Bun test (`bun:test`), Electron preload IPC (`window.electronAPI.projects.*`)

**Spec:** `docs/superpowers/specs/2026-07-20-code-projects-board-ia-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/electron/src/preload/index.ts` | Stop stripping `workingDirectory` from BrowserProject create/update/read |
| `apps/electron/src/renderer/components/app-shell/kanban/types.ts` | Optional `workingDirectory` on `KanbanProject` |
| `apps/electron/src/renderer/components/work/project-view-model.ts` | `buildProjectUpdate` / create-input helpers include cwd |
| `apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts` | TDD for cwd + create payload |
| `apps/electron/src/renderer/components/work/CreateProjectDialog.tsx` | Create dialog (name required; description/cwd/color optional) |
| `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx` | Compact left-rail Projects block |
| `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx` | Slim down / share list row helpers; remove as Work right rail |
| `apps/electron/src/renderer/components/work/WorkBoardView.tsx` | Full-width board/detail; no aside |
| `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx` | Settings: edit `workingDirectory` |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | Mount section after 自动任务 (Work+Code only) |
| `apps/electron/package.json` | bump patch `0.1.22` → `0.1.23` |

---

### Task 1: Restore `workingDirectory` on browser project bridge

**Files:**
- Modify: `apps/electron/src/preload/index.ts` (BrowserProject types + `toBrowserProject`)
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`
- Test: verify with typecheck after Task 2 tests land

- [ ] **Step 1: Expose workingDirectory in preload types**

In `apps/electron/src/preload/index.ts`, change:

```ts
export type BrowserProject = ProjectConfig & { workspaceId: string }
export type BrowserProjectCreateInput = CreateProjectInput
export type BrowserProjectUpdateInput = UpdateProjectInput
```

Update `toBrowserProject`:

```ts
function toBrowserProject(project: LoadedProject): BrowserProject {
  return { ...project.config, workspaceId: project.workspaceId }
}
```

- [ ] **Step 2: Add optional field on KanbanProject**

In `apps/electron/src/renderer/components/app-shell/kanban/types.ts`:

```ts
export interface KanbanProject {
  id: string
  slug?: string
  name: string
  description?: string
  details?: string
  /** 项目绑定工作目录；新会话可继承（主进程 set_project_id） */
  workingDirectory?: string
  color?: string
  archivedAt?: number
  updatedAt?: number
  workspaceId?: string
  kanbanColumns?: Array<{ id: string; name: string; color?: string; dropStatusId?: string }>
}
```

Update the comment above the interface from「不包含本地文件路径」to「列表可含 workingDirectory，供详情编辑；路径仅桌面端本地使用」。

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/preload/index.ts apps/electron/src/renderer/components/app-shell/kanban/types.ts
git commit -m "$(cat <<'EOF'
fix: expose project workingDirectory to renderer

EOF
)"
```

---

### Task 2: project-view-model — cwd + create payload (TDD)

**Files:**
- Modify: `apps/electron/src/renderer/components/work/project-view-model.ts`
- Modify: `apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `project-view-model.test.ts`:

```ts
import {
  buildProjectUpdate,
  buildCreateProjectInput,
  filterProjects,
  getProjectSessions,
} from '../project-view-model'

describe('buildCreateProjectInput', () => {
  test('name 必填 trim；空可选字段不写入', () => {
    expect(buildCreateProjectInput({
      name: '  Demo  ',
      description: ' ',
      workingDirectory: '',
      color: '',
    })).toEqual({ name: 'Demo' })
  })

  test('写入非空 description / workingDirectory / color', () => {
    expect(buildCreateProjectInput({
      name: 'Demo',
      description: '  desc ',
      workingDirectory: ' /repo/app ',
      color: '#ff0000',
    })).toEqual({
      name: 'Demo',
      description: 'desc',
      workingDirectory: '/repo/app',
      color: '#ff0000',
    })
  })
})

describe('buildProjectUpdate with workingDirectory', () => {
  test('可选 cwd trim 后写入或清空为 undefined', () => {
    expect(buildProjectUpdate({
      name: 'X',
      description: '',
      details: '',
      color: '',
      workingDirectory: ' /tmp/p ',
    })).toEqual({
      name: 'X',
      description: undefined,
      details: undefined,
      color: undefined,
      workingDirectory: '/tmp/p',
      kanbanColumns: undefined,
    })

    expect(buildProjectUpdate({
      name: 'X',
      description: '',
      details: '',
      color: '',
      workingDirectory: '   ',
    }).workingDirectory).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/electron && bun test src/renderer/components/work/__tests__/project-view-model.test.ts
```

Expected: FAIL — `buildCreateProjectInput` not exported / `workingDirectory` missing on update.

- [ ] **Step 3: Minimal implementation**

Update `project-view-model.ts`:

```ts
export interface ProjectSettingsDraft {
  name: string
  description: string
  details: string
  color: string
  workingDirectory: string
  kanbanColumns?: ProjectColumnDraft[]
}

export interface ProjectUpdatePatch {
  name: string
  description?: string
  details?: string
  color?: string
  workingDirectory?: string
  kanbanColumns?: ProjectColumnDraft[]
}

export interface CreateProjectDraft {
  name: string
  description: string
  workingDirectory: string
  color: string
}

export function buildCreateProjectInput(draft: CreateProjectDraft): {
  name: string
  description?: string
  workingDirectory?: string
  color?: string
} {
  return {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    workingDirectory: optionalText(draft.workingDirectory),
    color: optionalText(draft.color),
  }
}

export function buildProjectUpdate(draft: ProjectSettingsDraft): ProjectUpdatePatch {
  return {
    name: draft.name.trim(),
    description: optionalText(draft.description),
    details: optionalText(draft.details),
    color: optionalText(draft.color),
    workingDirectory: optionalText(draft.workingDirectory),
    kanbanColumns: draft.kanbanColumns && draft.kanbanColumns.length > 0
      ? draft.kanbanColumns
      : undefined,
  }
}
```

Fix existing test that constructs `buildProjectUpdate` without `workingDirectory` — add `workingDirectory: ''`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/electron && bun test src/renderer/components/work/__tests__/project-view-model.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/components/work/project-view-model.ts \
  apps/electron/src/renderer/components/work/__tests__/project-view-model.test.ts
git commit -m "$(cat <<'EOF'
feat: project view-model create/update include workingDirectory

EOF
)"
```

---

### Task 3: CreateProjectDialog

**Files:**
- Create: `apps/electron/src/renderer/components/work/CreateProjectDialog.tsx`

- [ ] **Step 1: Implement dialog**

```tsx
import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildCreateProjectInput, type CreateProjectDraft } from './project-view-model'

export interface CreateProjectDialogProps {
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ReturnType<typeof buildCreateProjectInput>) => void
}

const EMPTY: CreateProjectDraft = {
  name: '',
  description: '',
  workingDirectory: '',
  color: '',
}

export function CreateProjectDialog({
  open,
  busy = false,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps): React.ReactElement {
  const [draft, setDraft] = React.useState<CreateProjectDraft>(EMPTY)

  React.useEffect(() => {
    if (open) setDraft(EMPTY)
  }, [open])

  const canSubmit = draft.name.trim().length > 0 && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1.5 text-xs font-medium">
            名称
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="必填"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            描述
            <Input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="可选"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            工作目录
            <Input
              value={draft.workingDirectory}
              onChange={(e) => setDraft((d) => ({ ...d, workingDirectory: e.target.value }))}
              placeholder="可选，绝对路径"
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            强调色
            <Input
              type="color"
              value={draft.color || '#6366f1'}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => onSubmit(buildCreateProjectInput(draft))}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/CreateProjectDialog.tsx
git commit -m "$(cat <<'EOF'
feat: add CreateProjectDialog with optional cwd/color

EOF
)"
```

---

### Task 4: SidebarProjectsSection

**Files:**
- Create: `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx`
- Modify: `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx` (optional: delete if fully replaced; prefer keep thin re-export or delete unused)

- [ ] **Step 1: Implement sidebar section**

Wire atoms + create dialog. Behavior:

- Visible data from `serverKanbanProjectsAtom` filtered to current workspace slug (same as LeftSidebar `currentWorkspaceProjects`)
- Click row → `setSelectedProjectId` + `setWorkView('board')`；若当前不是 cowork，可保持 mode（Code 下只更新选中，Board 在切 Work 时生效）
- Info button → `setSelectedProjectId` + `setWorkView('project')` + `setMode('cowork')`（复用 LeftSidebar `handleOpenProjectDetail` 语义）
- `+` → open `CreateProjectDialog`
- On create success → upsert via callback/`setProjects`，select id，`setWorkView('project')`，`setMode('cowork')`
- `max-h-[220px]`，列表 `overflow-y-auto`，支持折叠

Skeleton:

```tsx
export interface SidebarProjectsSectionProps {
  workspaceRoot: string | null
  workspaceSlug: string | null
}

export function SidebarProjectsSection({
  workspaceRoot,
  workspaceSlug,
}: SidebarProjectsSectionProps): React.ReactElement | null {
  const [projects, setProjects] = useAtom(serverKanbanProjectsAtom)
  const [selectedProjectId, setSelectedProjectId] = useAtom(selectedProjectIdAtom)
  const setWorkView = useSetAtom(workViewAtom)
  const setMode = useSetAtom(appModeAtom)
  // filter by workspaceSlug; empty root → return null or empty state
  // render header + list + CreateProjectDialog
}
```

Filter:

```ts
const visible = filterProjects(
  projects.filter((p) => !workspaceSlug || !p.workspaceId || p.workspaceId === workspaceSlug),
  { query, showArchived },
)
```

Create:

```ts
const project = await window.electronAPI.projects.create(workspaceRoot, input)
setProjects((current) => {
  const without = current.filter((item) => item.id !== project.id)
  return [project, ...without]
})
setSelectedProjectId(project.id)
setWorkView('project')
setMode('cowork')
```

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx
git commit -m "$(cat <<'EOF'
feat: add SidebarProjectsSection for left-rail Projects

EOF
)"
```

---

### Task 5: Mount in LeftSidebar (Work + Code only)

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] **Step 1: Import and insert**

After the 自动任务 block (~line 2208–2215), and after Skills block when agent:

```tsx
import { SidebarProjectsSection } from '@/components/work/SidebarProjectsSection'

// resolve workspace root path for projects API — reuse existing agent workspace path helper if present;
// otherwise derive from workspaces + currentWorkspaceId via electronAPI.getAgentWorkspacePath / existing WorkBoardView pattern
```

Find how `WorkBoardView` resolves `workspaceRoot` and reuse the same IPC (grep `getWorkspaceRoot` / `workspaceRoot` in WorkBoardView). Pass `workspaceRoot` + `currentWorkspaceSlug` into:

```tsx
{(mode === 'agent' || mode === 'cowork') && (
  <div className="px-3 pb-1 titlebar-no-drag">
    <SidebarProjectsSection
      workspaceRoot={/* same root Work uses */}
      workspaceSlug={currentWorkspaceSlug}
    />
  </div>
)}
```

Place **after** Automation (+ Skills when agent), **before** the chat/agent session list branches — matches the red-box slot.

Do **not** render when `mode === 'chat'`.

- [ ] **Step 2: Manual smoke (dev)**

```bash
bun run dev
```

Check: Chat — no Projects; Code — Projects under 自动任务/Skills; Work — Projects visible even if session list empty.

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: mount SidebarProjectsSection in Work/Code left rail

EOF
)"
```

---

### Task 6: Remove Work right rail

**Files:**
- Modify: `apps/electron/src/renderer/components/work/WorkBoardView.tsx`
- Modify or delete: `apps/electron/src/renderer/components/work/ProjectsListPanel.tsx`

- [ ] **Step 1: Strip aside from WorkBoardView**

Replace the return layout (~267–329) with single-column:

```tsx
return (
  <div className="flex h-full min-h-0 flex-col gap-2 bg-background p-3">
    {/* existing toolbar unchanged */}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* error + board/project content unchanged */}
    </div>
  </div>
)
```

Remove `ProjectsListPanel` import and JSX. Keep `handleProjectChanged` / delete handlers for `ProjectInfoPage`.

- [ ] **Step 2: Delete or gut ProjectsListPanel**

If nothing else imports it, delete `ProjectsListPanel.tsx`. Grep first:

```bash
rg -n 'ProjectsListPanel' apps/electron/src
```

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/work/WorkBoardView.tsx
# and deletion of ProjectsListPanel if applicable
git commit -m "$(cat <<'EOF'
feat: remove Work-mode right-rail Projects panel

EOF
)"
```

---

### Task 7: ProjectInfoPage — edit workingDirectory

**Files:**
- Modify: `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx`

- [ ] **Step 1: Extend settingsDraft**

```ts
const [settingsDraft, setSettingsDraft] = React.useState({
  name: project.name,
  description: project.description ?? '',
  details: project.details ?? '',
  color: project.color ?? '',
  workingDirectory: project.workingDirectory ?? '',
})

React.useEffect(() => {
  setSettingsDraft({
    name: project.name,
    description: project.description ?? '',
    details: project.details ?? '',
    color: project.color ?? '',
    workingDirectory: project.workingDirectory ?? '',
  })
  setColumns(project.kanbanColumns ?? [])
}, [project])
```

In settings tab, add field before 描述:

```tsx
<label className="block space-y-1.5 text-xs font-medium">
  工作目录
  <Input
    value={settingsDraft.workingDirectory}
    onChange={(event) =>
      setSettingsDraft((current) => ({
        ...current,
        workingDirectory: event.target.value,
      }))
    }
    placeholder="绝对路径；新会话可继承"
  />
</label>
```

`saveSettings` already uses `buildProjectUpdate` — once Task 2 lands, cwd persists via `projects.update`.

- [ ] **Step 2: Commit**

```bash
git add apps/electron/src/renderer/components/work/ProjectInfoPage.tsx
git commit -m "$(cat <<'EOF'
feat: edit project workingDirectory on ProjectInfoPage

EOF
)"
```

---

### Task 8: Version bump + verification

**Files:**
- Modify: `apps/electron/package.json` (`0.1.22` → `0.1.23`)

- [ ] **Step 1: Bump version**

```json
"version": "0.1.23"
```

- [ ] **Step 2: Run tests**

```bash
cd apps/electron && bun test src/renderer/components/work/__tests__/project-view-model.test.ts
cd ../.. && bun run typecheck
```

Expected: tests PASS; typecheck clean for touched files.

- [ ] **Step 3: Manual P0 checklist**

1. Work 主区无右栏，看板更宽  
2. Work/Code 左栏可选项目；选中后看板过滤  
3. `+` 新建 → 进入详情；可改 cwd/颜色  
4. Chat 左栏无 Projects  
5. ⓘ / 顶栏「项目详情」仍可用  

- [ ] **Step 4: Commit**

```bash
git add apps/electron/package.json
git commit -m "$(cat <<'EOF'
chore: bump @luxcoder/electron 0.1.23

EOF
)"
```

---

## Spec coverage self-review

| Spec P0 requirement | Task |
|---------------------|------|
| 去掉 Work 右栏，看板全宽 | Task 6 |
| LeftSidebar 次级 Projects（Work + Code） | Task 4–5 |
| 单击过滤；新建 → 详情 | Task 4 |
| 详情可编辑核心字段含 cwd | Task 1–2, 7 |
| Chat 无 Projects | Task 5 (`mode === 'chat'` 不渲染) |
| Create 可选快捷字段 | Task 3 |
| 共享 atoms | Task 4（无新 atom） |

**Out of scope (P1/P2):** 砍顶栏 Work、Sessions board toggle、自定义 kanbanColumns UI polish（列编辑已存在于详情，不作为本计划新增）。

**No placeholders** in task steps; types consistent (`workingDirectory` on draft/update/create/KanbanProject/BrowserProject).
