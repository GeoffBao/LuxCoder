# Open Project Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `2026-07-22-open-project-entry-design.md`：侧栏双主 CTA「新会话｜新任务」；选/建项目仅发生在两流内部的共享 `ProjectContextPicker`；隐藏 Folder 主按钮与 Teambition 认领；仓库发现挂在选择器内。

**Architecture:** Renderer 抽共享 `ProjectContextPicker`（session 可跳过 / task 必选）；`LeftSidebar` 顶栏改双按钮；新任务经选择器后再打开 `TaskEditor`。主进程新增有界 repo 扫描（`.git`、默认深度 3、不扫 `$HOME`），扫描根存 `AppSettings.projectDiscovery`。

**Tech Stack:** Bun test、TypeScript、Electron IPC、Jotai、React、现有 `openOrCreateByPath` / `CreateProjectDialog` / `TaskEditor`。

**Spec:** `docs/superpowers/specs/2026-07-22-open-project-entry-design.md`

**Out of scope:** Teambition 上架、Hermes worktree、全盘扫描、README/AGENTS.md。

---

## File map

| 文件 | 职责 |
|------|------|
| `renderer/.../project-context-picker-model.ts` | 选择器分区/跳过规则纯函数 |
| `renderer/.../ProjectContextPicker.tsx` | 共享 UI |
| `renderer/atoms/project-context-picker.ts` | 打开/聚焦 browse（⌘O）、新任务流状态 |
| `main/lib/repo-discovery-service.ts` | 有界 `.git` 扫描 |
| `types/settings.ts` + settings-service | `projectDiscovery.scanRoots/maxDepth` |
| `shared` PROJECT_IPC + preload/ipc | `projects:discoverRepos` |
| `LeftSidebar.tsx` | 双 CTA；去 Folder/新建项目；空态；项目 tab ⋯ |
| `DraftProjectPicker` → 改用 ProjectContextPicker | Draft 内选项目 |
| `KanbanBoardContainer.tsx` | 隐藏 TW；新增任务可走同一流 |
| `GlobalShortcuts` / shortcuts | ⌘O → 聚焦浏览 |
| package.json patch | electron + shared |

---

### Task 1: 选择器纯模型（TDD）

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/project-context-picker-model.ts`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/project-context-picker-model.test.ts`

- [ ] **Step 1–4:** `allowsSkipProject(mode)` — session true / task false；`buildPickerSections` 产出 recents / existing / discovery / actions；task 无「无项目」；空 scanRoots → discovery empty + `needsScanRootGuide`。

- [ ] **Step 5: Commit**

---

### Task 2: Repo 发现服务（TDD）

**Files:**
- Create: `apps/electron/src/main/lib/repo-discovery-service.ts`
- Create: `apps/electron/src/main/lib/repo-discovery-service.test.ts`

- [ ] **Step 1–4:** `discoverGitRepos({ roots, maxDepth })` — 含 `.git` 为 root；深度 1–5 clamp；默认 3；不隐式扫 home；可注入 fs。

- [ ] **Step 5: Commit**

---

### Task 3: Settings + IPC 四层

**Files:**
- Modify: `apps/electron/src/types/settings.ts` — `projectDiscovery?: { scanRoots: string[]; maxDepth?: number }`
- Modify: `packages/shared/src/protocol/channels.ts` — `DISCOVER_REPOS`
- Modify: `task-handlers` / `ipc` / `preload`

- [ ] 注册 `projects:discoverRepos`；读写 settings 的 scanRoots（也可经 updateSettings）。
- [ ] Commit

---

### Task 4: ProjectContextPicker UI

**Files:**
- Create: `ProjectContextPicker.tsx`
- Modify: `DraftProjectPicker.tsx` 或 AgentView 改挂新组件
- Create atom: `project-context-picker.ts`（`focusBrowseRequestAtom`、`newTaskProjectFlowOpenAtom`）

分区：Recents / 已有 / 发现 / 浏览… / 新建… /（session）无项目。绑定：`set_project_id` 或回调 `onSelect(projectId | null)`；浏览/发现走 `openOrCreateByPath`。

- [ ] Commit

---

### Task 5: 侧栏双 CTA + 空态 + 去独立新建

**Files:**
- Modify: `LeftSidebar.tsx`

- [ ] agent 顶栏：`[＋ 新会话] [＋ 新任务]` + 搜索 + 收起；去 Folder
- [ ] 新会话：现有 unbound draft（选择器在主区）
- [ ] 新任务：打开 `newTaskProjectFlow` → 选项目 → `pendingTaskEditorTargetAtom` + `codeMainView='work'`
- [ ] 双投影旁去掉「新建项目」
- [ ] 项目投影空态文案指向顶栏；⋯ 仅管理（归档显示 / 添加扫描目录 / 刷新）
- [ ] Commit

---

### Task 6: 隐藏 TW + Board 对齐

**Files:**
- Modify: `KanbanBoardContainer.tsx` — 移除/隐藏「从 Teambition 认领」按钮
- Board「新增任务」：无 selectedProject 时先走 ProjectContextPicker，有则直接 TaskEditor

- [ ] Commit

---

### Task 7: ⌘O

**Files:**
- Modify shortcuts / `GlobalShortcuts.tsx`

- [ ] 在 Draft 或选择器打开时触发 browse（`openFolderDialog` / focus browse action）；不单独第三主按钮
- [ ] Commit

---

### Task 8: 版本与验证

- [ ] `@luxcoder/electron` + `@luxcoder/shared` patch +1
- [ ] `bun test` 相关文件；`bun run typecheck` 若可行
- [ ] Push + PR
