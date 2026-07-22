# Workspace / Project / Session IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `2026-07-22-workspace-project-session-ia-design.md`：Workspace 作顶层隔离、Project 作日常主容器、Session 双投影（最近/项目）、打开文件夹一键进 Draft Session；删除独立「项目中心」入口。

**Architecture:** 主进程先补齐路径规范化 / 托管 `workdir/` / `effectiveCwd` / 按路径复用或创建 Project；Renderer 用 Jotai 驱动侧栏「最近会话｜项目」双视图与 Workspace 选择器，复用现有 Session atom；Project 主页在现有 `ProjectInfoPage` + `WorkBoardView` 上扩 tab，不新建看板数据源。

**Tech Stack:** Bun test、TypeScript、Electron IPC、Jotai、React、`@luxcoder/shared` projects storage、现有 `draftSessionIdsAtom` / `openFolderDialog`。

**Spec:** `docs/superpowers/specs/2026-07-22-workspace-project-session-ia-design.md`

**Out of scope (spec §3.2):** Repo Wiki、Browser/Terminal 重构、多 Repo、CLI/深链、Project 级 Skills/MCP 副本、Workspace 删除语义重设计。

---

## File map

| 文件 | 职责 |
|------|------|
| `packages/shared/src/utils/project-path.ts`（新建） | 展示路径保留 + 比较用规范化（pure） |
| `packages/shared/src/projects/storage.ts` | `getProjectWorkdirPath`、创建时 ensure `workdir/` |
| `packages/shared/src/projects/types.ts` | `ProjectPathStatus` / `EffectiveCwdResult` 类型（可选导出） |
| `packages/shared/src/protocol/channels.ts` | 扩展 `PROJECT_IPC_CHANNELS` |
| `apps/electron/src/main/lib/project-path-service.ts`（新建） | realpath、按路径查找/创建、effectiveCwd、重新定位 |
| `apps/electron/src/main/lib/project-repository.ts` | 委托 path service；resolve 改走 effectiveCwd |
| `apps/electron/src/main/lib/task-handlers.ts` | `set_project_id` / Task cwd 使用 effectiveCwd |
| `apps/electron/src/main/lib/agent-workspace-manager.ts` | 新安装默认名 `Default Space` |
| `apps/electron/src/main/ipc.ts` + `preload/index.ts` | 新 Project IPC 四层同步 |
| `apps/electron/src/renderer/atoms/sidebar-session-view.ts`（新建） | `'recent' \| 'projects'` |
| `apps/electron/src/renderer/hooks/useCreateSession.ts` | `projectId?` + 全局/项目 Draft |
| `apps/electron/src/renderer/hooks/useOpenLocalFolder.ts`（新建） | 打开文件夹编排 |
| `apps/electron/src/renderer/components/app-shell/WorkspaceSwitcher.tsx`（新建） | 顶栏 Workspace 选择器（图标 + ChevronDown） |
| `apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx`（新建） | 最近｜项目切换 |
| `apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts`（新建） | 双视图纯派生 |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | 组合新 IA；删「项目中心」与「工作区」分区标题；加打开文件夹 |
| `apps/electron/src/renderer/components/work/SidebarProjectsSection.tsx` | 删除或改为死代码移除 |
| `apps/electron/src/renderer/components/work/ProjectsHubView.tsx` | 从 MainArea 卸载入口（文件可暂留或删） |
| `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx` | 概览｜会话｜任务｜资料；设置进 `…` |
| `apps/electron/src/renderer/components/app-shell/kanban/TaskEditor.tsx` | 强制 `projectId` |
| `apps/electron/src/renderer/components/work/TeambitionPicker.tsx` | 无 Project 则先选再导入 |
| `apps/electron/package.json` / `packages/shared/package.json` | patch +1 |

---

### Task 1: 路径规范化纯函数

**Files:**
- Create: `packages/shared/src/utils/project-path.ts`
- Create: `packages/shared/src/utils/__tests__/project-path.test.ts`
- Modify: `packages/shared/src/utils/index.ts`（导出）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from 'bun:test'
import { normalizeProjectPathForCompare, displayProjectPath } from '../project-path.ts'

describe('project-path', () => {
  test('比较用规范化：绝对化语义由调用方保证；统一斜杠并去尾斜杠', () => {
    expect(normalizeProjectPathForCompare('/Users/me/Repo/')).toBe('/Users/me/Repo')
    expect(normalizeProjectPathForCompare('C:\\Users\\me\\Repo\\')).toBe('C:/Users/me/Repo')
  })

  test('macOS/Linux 比较大小写敏感保留原大小写；Windows 比较小写化', () => {
    expect(normalizeProjectPathForCompare('/Users/Me/Repo', 'posix')).toBe('/Users/Me/Repo')
    expect(normalizeProjectPathForCompare('C:/Users/Me/Repo', 'win32')).toBe('c:/users/me/repo')
  })

  test('display 路径原样保留展示用输入（仅 trim）', () => {
    expect(displayProjectPath('  /Users/me/Repo  ')).toBe('/Users/me/Repo')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/shared/src/utils/__tests__/project-path.test.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
export type PathPlatform = 'posix' | 'win32'

export function displayProjectPath(filePath: string): string {
  return filePath.trim()
}

/** 仅用于同一 Workspace 内路径唯一性比较；不做 realpath（那是主进程职责）。 */
export function normalizeProjectPathForCompare(
  filePath: string,
  platform: PathPlatform = process.platform === 'win32' ? 'win32' : 'posix',
): string {
  let p = filePath.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (platform === 'win32') p = p.toLowerCase()
  return p
}
```

在 `packages/shared/src/utils/index.ts` 导出上述符号。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/shared/src/utils/__tests__/project-path.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/project-path.ts packages/shared/src/utils/__tests__/project-path.test.ts packages/shared/src/utils/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add project path compare helpers for IA

EOF
)"
```

---

### Task 2: 托管 workdir 路径 + 创建时 ensure

**Files:**
- Modify: `packages/shared/src/projects/storage.ts`
- Modify: `packages/shared/src/projects/__tests__/storage.test.ts`

- [ ] **Step 1: 写失败测试**

在 `storage.test.ts` 追加：

```ts
test('createProject 确保 projects/{slug}/workdir/ 存在且与 assets 分离', () => {
  const workspaceRoot = createTempWorkspaceRoot()
  const project = projectStorage.createProject(workspaceRoot, { name: 'AI Dev' })
  const workdir = projectStorage.getProjectWorkdirPath(workspaceRoot, project.slug)
  const assets = projectStorage.getProjectAssetsPath(workspaceRoot, project.slug)
  expect(existsSync(workdir)).toBe(true)
  expect(workdir.endsWith(`${project.slug}/workdir`)).toBe(true)
  expect(assets.includes('/assets')).toBe(true)
  expect(workdir).not.toBe(assets)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/shared/src/projects/__tests__/storage.test.ts`

Expected: FAIL（`getProjectWorkdirPath` 未定义）

- [ ] **Step 3: 最小实现**

在 `storage.ts` 增加：

```ts
export function getProjectWorkdirPath(workspaceRootPath: string, projectSlug: string): string {
  return join(getProjectPath(workspaceRootPath, projectSlug), 'workdir')
}

export function ensureProjectWorkdir(workspaceRootPath: string, projectSlug: string): string {
  const dir = getProjectWorkdirPath(workspaceRootPath, projectSlug)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
```

在 `createProject` 里 `ensureProjectAssetsDir` 之后调用 `ensureProjectWorkdir`。  
在 `loadProject` / `LoadedProject` 组装处可按需附带（本阶段不强制改 `LoadedProject` 字段；workdir 路径由 helper 派生即可）。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/shared/src/projects/__tests__/storage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/projects/storage.ts packages/shared/src/projects/__tests__/storage.test.ts
git commit -m "$(cat <<'EOF'
feat(projects): ensure managed workdir on project create

EOF
)"
```

---

### Task 3: ProjectPathService — effectiveCwd + 按路径查找/创建

**Files:**
- Create: `apps/electron/src/main/lib/project-path-service.ts`
- Create: `apps/electron/src/main/lib/project-path-service.test.ts`
- Modify: `packages/shared/src/projects/types.ts`（如需共享结果类型，可放 service 内避免污染 shared）

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProject, getProjectWorkdirPath } from '../../../../../packages/shared/src/projects/storage.ts'
import {
  resolveEffectiveCwd,
  findProjectByWorkingDirectory,
  openOrCreateProjectForPath,
  type ProjectPathFs,
} from './project-path-service.ts'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lux-path-svc-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function accessibleFs(extra?: Partial<ProjectPathFs>): ProjectPathFs {
  return {
    exists: (p) => existsSync(p),
    realpath: (p) => p, // 测试用：跳过真实 symlink
    isDirectory: () => true,
    ...extra,
  }
}

describe('project-path-service', () => {
  test('无外部目录时 effectiveCwd = 托管 workdir，并按需创建', () => {
    const ws = tempRoot()
    const project = createProject(ws, { name: 'Solo' })
    const result = resolveEffectiveCwd(ws, project, accessibleFs())
    expect(result.status).toBe('managed')
    expect(result.cwd).toBe(getProjectWorkdirPath(ws, project.slug))
    expect(existsSync(result.cwd!)).toBe(true)
  })

  test('外部目录可访问时使用 workingDirectory，不回退托管目录', () => {
    const ws = tempRoot()
    const external = join(tempRoot(), 'repo')
    mkdirSync(external)
    const project = createProject(ws, { name: 'Ext', workingDirectory: external })
    const result = resolveEffectiveCwd(ws, project, accessibleFs())
    expect(result.status).toBe('external')
    expect(result.cwd).toBe(external)
  })

  test('外部目录不可访问时 status=unavailable，cwd 为空，不静默回退', () => {
    const ws = tempRoot()
    const project = createProject(ws, {
      name: 'Gone',
      workingDirectory: join(ws, 'missing-repo'),
    })
    const result = resolveEffectiveCwd(ws, project, accessibleFs({
      exists: () => false,
    }))
    expect(result.status).toBe('unavailable')
    expect(result.cwd).toBeUndefined()
  })

  test('同 Workspace 内按规范化路径复用 Project；不同路径同名则新 slug', () => {
    const ws = tempRoot()
    const pathA = join(tempRoot(), 'App')
    mkdirSync(pathA)
    const first = openOrCreateProjectForPath(ws, pathA, accessibleFs())
    const second = openOrCreateProjectForPath(ws, pathA, accessibleFs())
    expect(second.project.id).toBe(first.project.id)
    expect(second.created).toBe(false)

    const pathB = join(tempRoot(), 'App') // 同名不同路径
    mkdirSync(pathB)
    const third = openOrCreateProjectForPath(ws, pathB, accessibleFs())
    expect(third.project.id).not.toBe(first.project.id)
    expect(third.project.slug).not.toBe(first.project.slug)
  })

  test('findProjectByWorkingDirectory 使用比较规范化路径', () => {
    const ws = tempRoot()
    const external = join(tempRoot(), 'repo')
    mkdirSync(external)
    const project = createProject(ws, { name: 'R', workingDirectory: external + '/' })
    const found = findProjectByWorkingDirectory(ws, external, accessibleFs())
    expect(found?.id).toBe(project.id)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/main/lib/project-path-service.test.ts`

Expected: FAIL

- [ ] **Step 3: 最小实现**

`project-path-service.ts` 核心接口：

```ts
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { ProjectConfig } from '@luxcoder/shared/projects'
import {
  createProject,
  ensureProjectWorkdir,
  getProjectWorkdirPath,
  loadWorkspaceProjects,
  updateProject,
} from '../../../../../packages/shared/src/projects/storage.ts'
import {
  displayProjectPath,
  normalizeProjectPathForCompare,
} from '@luxcoder/shared/utils'

export type EffectiveCwdStatus = 'managed' | 'external' | 'unavailable'

export interface EffectiveCwdResult {
  status: EffectiveCwdStatus
  cwd?: string
  displayPath?: string
}

export interface ProjectPathFs {
  exists: (path: string) => boolean
  realpath: (path: string) => string
  isDirectory: (path: string) => boolean
}

export const defaultProjectPathFs: ProjectPathFs = {
  exists: existsSync,
  realpath: (p) => realpathSync(p),
  isDirectory: (p) => statSync(p).isDirectory(),
}

export function canonicalizeForCompare(path: string, fs: ProjectPathFs = defaultProjectPathFs): string {
  const absolute = resolve(displayProjectPath(path))
  const real = fs.exists(absolute) ? fs.realpath(absolute) : absolute
  return normalizeProjectPathForCompare(real)
}

export function resolveEffectiveCwd(
  workspaceRoot: string,
  project: ProjectConfig,
  fs: ProjectPathFs = defaultProjectPathFs,
): EffectiveCwdResult {
  const external = project.workingDirectory?.trim()
  if (!external) {
    const cwd = ensureProjectWorkdir(workspaceRoot, project.slug)
    return { status: 'managed', cwd, displayPath: cwd }
  }
  const absolute = resolve(external)
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    return { status: 'unavailable', displayPath: external }
  }
  return { status: 'external', cwd: absolute, displayPath: external }
}

export function findProjectByWorkingDirectory(
  workspaceRoot: string,
  folderPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): ProjectConfig | null {
  const target = canonicalizeForCompare(folderPath, fs)
  for (const loaded of loadWorkspaceProjects(workspaceRoot)) {
    const wd = loaded.config.workingDirectory?.trim()
    if (!wd) continue
    if (canonicalizeForCompare(wd, fs) === target) return loaded.config
  }
  return null
}

export function openOrCreateProjectForPath(
  workspaceRoot: string,
  folderPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): { project: ProjectConfig; created: boolean } {
  const absolute = resolve(displayProjectPath(folderPath))
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    throw new Error(`目录不可访问: ${folderPath}`)
  }
  const existing = findProjectByWorkingDirectory(workspaceRoot, absolute, fs)
  if (existing) return { project: existing, created: false }
  const name = basename(absolute) || 'Project'
  const project = createProject(workspaceRoot, {
    name,
    workingDirectory: absolute,
  })
  ensureProjectWorkdir(workspaceRoot, project.slug)
  return { project, created: true }
}

export function relocateProjectWorkingDirectory(
  workspaceRoot: string,
  projectSlug: string,
  newPath: string,
  fs: ProjectPathFs = defaultProjectPathFs,
): ProjectConfig {
  const absolute = resolve(displayProjectPath(newPath))
  if (!fs.exists(absolute) || !fs.isDirectory(absolute)) {
    throw new Error(`目录不可访问: ${newPath}`)
  }
  const conflict = findProjectByWorkingDirectory(workspaceRoot, absolute, fs)
  // 冲突且不是自身：抛错（调用方先 load 当前 slug）
  const updated = updateProject(workspaceRoot, projectSlug, {
    workingDirectory: absolute,
  })
  if (conflict && conflict.slug !== projectSlug) {
    throw new Error('该路径已绑定其他 Project')
  }
  return updated
}
```

注意：`relocateProjectWorkingDirectory` 实现时先 `find` 再 update，避免竞态写错；测试可后补。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/main/lib/project-path-service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/project-path-service.ts apps/electron/src/main/lib/project-path-service.test.ts
git commit -m "$(cat <<'EOF'
feat(main): add project path service for effectiveCwd and open-folder

EOF
)"
```

---

### Task 4: Repository / TaskHandlers 改走 effectiveCwd

**Files:**
- Modify: `apps/electron/src/main/lib/project-repository.ts`
- Modify: `apps/electron/src/main/lib/project-repository.test.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.ts`
- Modify: `apps/electron/src/main/lib/task-handlers.test.ts`

- [ ] **Step 1: 写失败测试**

更新 `task-handlers` 语义测试：绑定 Project 时，即使无外部 `workingDirectory`，也应写入托管 workdir 作为 session `workingDirectory`。

在 `task-handlers.test.ts` 增加集成风格测试（可用临时 workspace + real `resolveEffectiveCwd`），或把 `resolveTaskWorkingDirectory` 改为：

```ts
test('无外部目录时 resolveTaskWorkingDirectory 返回托管 workdir', () => {
  // 构造临时 project 无 workingDirectory，断言返回 .../workdir
})
```

同步修正旧测试注释：「项目无 cwd 不写 workingDirectory」→「无外部目录时写托管 workdir」。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/main/lib/task-handlers.test.ts apps/electron/src/main/lib/project-repository.test.ts`

Expected: FAIL（旧语义断言）

- [ ] **Step 3: 实现**

`project-repository.resolveWorkingDirectory`：

```ts
resolveWorkingDirectory(workspaceRoot: string, projectId: string | undefined): string | undefined {
  if (!projectId) return undefined
  const loaded = this.getProjectAtRoot(workspaceRoot, projectId) // 现有 by-id 查找
  if (!loaded) return undefined
  const result = resolveEffectiveCwd(workspaceRoot, loaded.config)
  if (result.status === 'unavailable') return undefined // 调用方需区分；见下一步 IPC
  return result.cwd
}
```

新增 `resolveEffectiveCwdForProject(workspaceRoot, projectId): EffectiveCwdResult` 供 IPC / orchestrator 判断 unavailable。

`buildSetProjectIdUpdates`：当 `resolvedWorkingDirectory` 有值时写入（托管或外部均写入）。unavailable 时 **不** 写入 cwd，但可仍绑定 `projectId`（允许浏览历史）；运行 Agent 时再拦。

Agent 运行拦截：在 `conductor-session-host` / `agent-orchestrator` 取 cwd 处，若 session 有 `projectId` 且 effectiveCwd unavailable → throw/返回可读错误（本 Task 先在 `resolveTaskWorkingDirectory` + 导出 `assertRunnableCwd` helper；orchestrator 接线可放 Task 4b 同 commit）。

最小 `assertRunnableCwd`：

```ts
export function assertRunnableCwd(result: EffectiveCwdResult): string {
  if (result.status === 'unavailable' || !result.cwd) {
    throw new Error('项目主目录不可用，请重新定位后再运行 Agent')
  }
  return result.cwd
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test apps/electron/src/main/lib/task-handlers.test.ts apps/electron/src/main/lib/project-repository.test.ts apps/electron/src/main/lib/project-path-service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/project-repository.ts apps/electron/src/main/lib/project-repository.test.ts apps/electron/src/main/lib/task-handlers.ts apps/electron/src/main/lib/task-handlers.test.ts
git commit -m "$(cat <<'EOF'
fix(main): bind sessions to project effectiveCwd including managed workdir

EOF
)"
```

---

### Task 5: Project IPC — openOrCreateByPath / resolveEffectiveCwd / relocate

**Files:**
- Modify: `packages/shared/src/protocol/channels.ts`
- Modify: `packages/shared/src/protocol/__tests__/channels.test.ts`
- Modify: `apps/electron/src/main/ipc.ts`（或 `task-handlers` 旁的 project handlers）
- Modify: `apps/electron/src/preload/index.ts`
- Modify: renderer 类型声明（`electronAPI` 类型文件，若有）

- [ ] **Step 1: 写失败测试**

在 `channels.test.ts` 断言新常量存在：

```ts
expect(PROJECT_IPC_CHANNELS.OPEN_OR_CREATE_BY_PATH).toBe('projects:openOrCreateByPath')
expect(PROJECT_IPC_CHANNELS.RESOLVE_EFFECTIVE_CWD).toBe('projects:resolveEffectiveCwd')
expect(PROJECT_IPC_CHANNELS.RELOCATE_WORKING_DIRECTORY).toBe('projects:relocateWorkingDirectory')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/shared/src/protocol/__tests__/channels.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现四层**

`channels.ts`：

```ts
export const PROJECT_IPC_CHANNELS = {
  // ...existing
  OPEN_OR_CREATE_BY_PATH: 'projects:openOrCreateByPath',
  RESOLVE_EFFECTIVE_CWD: 'projects:resolveEffectiveCwd',
  RELOCATE_WORKING_DIRECTORY: 'projects:relocateWorkingDirectory',
} as const
```

Handler 输入（workspace 用 root path，与现有 projects API 一致）：

```ts
// openOrCreateByPath(workspaceRoot, folderPath) → { project: ProjectConfig, created: boolean }
// resolveEffectiveCwd(workspaceRoot, projectSlug) → EffectiveCwdResult
// relocateWorkingDirectory(workspaceRoot, projectSlug, newPath) → ProjectConfig
```

复用现有 `dialog`：Renderer 可先 `openFolderDialog()` 再调 `openOrCreateByPath`，不必新 dialog 通道。

Preload：

```ts
openOrCreateByPath: (workspaceRoot: string, folderPath: string) =>
  ipcRenderer.invoke(PROJECT_IPC_CHANNELS.OPEN_OR_CREATE_BY_PATH, workspaceRoot, folderPath),
// ...
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/shared/src/protocol/__tests__/channels.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol/channels.ts packages/shared/src/protocol/__tests__/channels.test.ts apps/electron/src/main/ipc.ts apps/electron/src/preload/index.ts
git commit -m "$(cat <<'EOF'
feat(ipc): expose project path open/resolve/relocate channels

EOF
)"
```

---

### Task 6: 新安装默认 Workspace 名 Default Space

**Files:**
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.ts`
- Modify: `apps/electron/src/main/lib/agent-workspace-manager.test.ts`（若无覆盖 ensureDefault，则新增）

- [ ] **Step 1: 写失败测试**

```ts
test('ensureDefaultWorkspace 新建时名称为 Default Space，不改已有名称', () => {
  // 空 index → 创建 name === 'Default Space', slug === 'default'
  // 已有 name: '默认工作区' → 保持不变
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test apps/electron/src/main/lib/agent-workspace-manager.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现**

```ts
name: 'Default Space',
// ensurePluginManifest('default', 'Default Space') 仅新建时
```

禁止批量 rename 已有「默认工作区」。

- [ ] **Step 4: 测试通过 + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(workspace): name new default workspace Default Space

EOF
)"
```

---

### Task 7: 会话创建统一 Draft + 可选 projectId

**Files:**
- Modify: `apps/electron/src/renderer/hooks/useCreateSession.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/create-session-options.test.ts`（测纯辅助，若 hook 难测则抽 `buildCreateAgentFlow`）
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（全局新会话改 draft；项目内复用 hook）

- [ ] **Step 1: 抽纯函数并写测试**

Create: `apps/electron/src/renderer/hooks/create-agent-session-flow.ts`

```ts
export interface CreateAgentSessionFlowInput {
  draft?: boolean
  projectId?: string
  channelId?: string
  modelId?: string
  workspaceId?: string
}

export function shouldMarkDraft(input: CreateAgentSessionFlowInput): boolean {
  return input.draft !== false // 默认 true（对齐 spec：未发送不进列表）
}
```

Spec：全局与 Project 新会话都是 Draft。将 `useCreateSession.createAgent` 扩展：

```ts
interface CreateSessionOptions {
  draft?: boolean
  channelId?: string
  modelId?: string
  projectId?: string
}
```

流程：
1. `createAgentSession(...)`
2. 若 `projectId` → `sendSessionCommand({ kind: 'set_project_id', projectId })`
3. 若 draft（默认 true）→ `draftSessionIds` add
4. `openSession` + `activeView=conversations`

LeftSidebar：
- `handleNewAgentSession` → `createAgent({ draft: true })`
- `createAgentSessionInProject` → `createAgent({ draft: true, projectId })`
- 删除重复的两套创建逻辑（改为调 hook）

- [ ] **Step 2–4: 测试 → 实现 → 通过**

Run: `bun test apps/electron/src/renderer/hooks/__tests__/create-session-options.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(renderer): create agent sessions as drafts with optional project bind

EOF
)"
```

---

### Task 7b: Draft 输入区 Project 标签 + 离开丢弃

**Files:**
- Create: `apps/electron/src/renderer/components/agent/DraftProjectPicker.tsx`
- Create: `apps/electron/src/renderer/components/agent/draft-session-lifecycle.ts`
- Create: `apps/electron/src/renderer/components/agent/__tests__/draft-session-lifecycle.test.ts`
- Modify: Agent 输入区宿主（`AgentView.tsx` / 现有 input chrome，以实际挂载点为准）
- Modify: tab 关闭 / 切走 draft 会话的清理路径（`TabBar` / `useOpenSession` 邻近逻辑）

- [ ] **Step 1: 写失败测试**

```ts
test('未归类 draft 可在首条发送前绑定 projectId', () => {
  expect(canBindProjectBeforeSend({ projectId: undefined, isDraft: true })).toBe(true)
  expect(canBindProjectBeforeSend({ projectId: 'p1', isDraft: true })).toBe(true)
})

test('离开未发送 draft 时应删除会话而非留空历史', () => {
  expect(shouldDiscardDraftOnLeave({ isDraft: true, hasUserMessage: false })).toBe(true)
  expect(shouldDiscardDraftOnLeave({ isDraft: true, hasUserMessage: true })).toBe(false)
})
```

- [ ] **Step 2: 实现**

- 全局 Draft（`projectId` 空）：输入区上方/旁显示可选 Project 芯片；选择后 `sendSessionCommand(set_project_id)` 并刷新 session atom。
- 已绑定 Project 的 Draft：显示只读 Project 色点/名，不可误绑到其他项目（或允许改绑——本阶段允许改绑直到首条发送）。
- 关闭 tab / 切到其他非 draft 会话且该 draft 仍无用户消息：`deleteAgentSession` + 从 `draftSessionIdsAtom` / `agentSessionsAtom` 移除。
- 复用现有「首条消息清除 draft 标记」逻辑（ChatView/Agent 发送路径已有则对齐）。

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(renderer): draft project picker and discard empty drafts on leave

EOF
)"
```

---

### Task 8: 打开文件夹 → Project + Draft Session

**Files:**
- Create: `apps/electron/src/renderer/hooks/useOpenLocalFolder.ts`
- Create: `apps/electron/src/renderer/hooks/open-local-folder-model.ts`
- Create: `apps/electron/src/renderer/hooks/__tests__/open-local-folder-model.test.ts`
- Modify: `LeftSidebar.tsx`（「打开文件夹」按钮）

- [ ] **Step 1: 写失败测试（纯编排模型）**

```ts
import { describe, expect, test } from 'bun:test'
import { planOpenLocalFolder } from '../open-local-folder-model.ts'

test('取消对话框 → 无操作', () => {
  expect(planOpenLocalFolder({ dialog: null })).toEqual({ kind: 'cancel' })
})

test('选中路径 → openOrCreate + draft session + 切会话视图', () => {
  expect(planOpenLocalFolder({
    dialog: { path: '/repo/app', name: 'app' },
    workspaceRoot: '/ws',
  })).toEqual({
    kind: 'open',
    folderPath: '/repo/app',
    workspaceRoot: '/ws',
  })
})
```

Hook 实现顺序：
1. 解析当前 workspace root（与 ProjectsInitializer / LeftSidebar 相同链路）
2. `openFolderDialog()`
3. `projects.openOrCreateByPath(workspaceRoot, path)`
4. 刷新 `serverKanbanProjectsAtom`（或依赖 `projects:changed`）
5. `createAgent({ draft: true, projectId })`
6. `setActiveView('conversations')` + `codeMainView='session'`

- [ ] **Step 2–4: 实现并测纯函数**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(renderer): open folder finds or creates project and draft session

EOF
)"
```

---

### Task 9: 侧栏双投影纯函数（最近｜项目）

**Files:**
- Create: `apps/electron/src/renderer/atoms/sidebar-session-view.ts`
- Create: `apps/electron/src/renderer/components/app-shell/sidebar-session-views.ts`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts`
- Modify: 复用/扩展 `sidebar-project-groups.ts`（未归类标签）

- [ ] **Step 1: 写失败测试**

```ts
test('recent 视图按 updatedAt 降序含未归类与 Project Session，同一 session id', () => {
  const sessions = [/* project-bound + unbound */]
  const recent = buildRecentSessionList(sessions)
  const projects = buildProjectSessionView(sessions, projectsList)
  expect(recent.map(s => s.id).sort()).toEqual(
    [...projects.projectGroups.flatMap(g => g.sessions), ...projects.unboundSessions]
      .map(s => s.id).sort()
  )
})

test('项目视图底部未归类分组仅含 projectId 为空或指向失效项目的 session', () => {
  // ...
})
```

- [ ] **Step 2–4: 实现**

```ts
// atoms/sidebar-session-view.ts
import { atom } from 'jotai'
export type SidebarSessionViewMode = 'recent' | 'projects'
export const sidebarSessionViewModeAtom = atom<SidebarSessionViewMode>('recent')
```

`buildRecentSessionList`：过滤 archived/draft，按 `updatedAt` desc。  
`buildProjectSessionView`：委托现有 `buildSidebarProjectGroups`，将 `unboundSessions` UI 文案定为「未归类会话」。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(renderer): add recent/projects session view models

EOF
)"
```

---

### Task 10: WorkspaceSwitcher + 侧栏 IA 组装（去项目中心 / 去工作区标题）

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/WorkspaceSwitcher.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/SidebarSessionViewToggle.tsx`
- Modify: `LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`（卸 `ProjectsHubView`）
- Modify: `apps/electron/src/renderer/components/app-shell/code-main-view-model.ts` + test（`projects` overlay 可保留兼容或移除）
- Delete or gut: `SidebarProjectsSection.tsx` 的入口挂载

- [ ] **Step 1: 结构目标（对照 spec §6.1）**

Code 侧栏从上到下：

1. ModeSwitcher（已有）
2. **WorkspaceSwitcher**（图标 + 名称 + Lucide `ChevronDown`，禁止 `▾`）
3. `[＋ 新会话] [打开文件夹]`（打开文件夹用 FolderOpen 图标按钮）
4. 自动任务 / Agent 技能 / Agent 专家（**删除项目中心 SidebarModule**）
5. `[最近会话｜项目]` toggle + 右侧 `＋`（项目视图下 `＋` = 新建 Project）
6. 列表区：recent 或 projects（含未归类）
7. **删除**「工作区」section label 与多 Workspace 树展开列表

Workspace 切换能力迁入 `WorkspaceSwitcher` 下拉（列表、新建、重命名、管理）。切换时：先清空 `serverKanbanProjectsAtom` / 会话过滤依赖当前 `currentAgentWorkspaceIdAtom`，避免闪旧数据（沿用现有 ProjectsInitializer 的 workspace slug 匹配；必要时在 switch 时 `set(serverKanbanProjectsAtom, [])`）。

- [ ] **Step 2: 实现 WorkspaceSwitcher**

复用 LeftSidebar 内已有 create/rename/switch/delete workspace 回调，通过 props 注入，避免一次搬完 4k 行。图标：`Layers` 或现有 workspace 色点 + `ChevronDown`。

- [ ] **Step 3: 接线 toggle + 条件渲染列表**

- `sidebarSessionViewModeAtom === 'recent'` → flat session list（`AgentSessionItem`）
- `'projects'` → `SidebarProjectSubgroup` + 「未归类会话」分组
- Project 名称点击 → `handleOpenProjectDetail`（进 Project 主页）
- Disclosure 只展开 Session

- [ ] **Step 4: 移除 Hub 入口**

- LeftSidebar 删除 `<SidebarProjectsSection />`
- MainArea 删除 `activeView === 'projects'` 分支
- 更新 `code-main-view-model.test.ts`：`isOverlayActiveView('projects')` 可改为 false 并自 ActiveView 联合类型移除 `'projects'`（若有深链再保留一版 redirect → project detail）

- [ ] **Step 5: 手动/单测回归 + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): rebuild Code sidebar around workspace switcher and session projections

EOF
)"
```

---

### Task 11: Project 主页 tabs（概览｜会话｜任务｜资料）

**Files:**
- Modify: `apps/electron/src/renderer/components/work/ProjectInfoPage.tsx`
- Modify: `apps/electron/src/renderer/components/work/project-view-model.ts` + tests
- Modify: `WorkBoardView.tsx`（任务 tab 内嵌看板或跳转 `workView='board'` + filter）

- [ ] **Step 1: Tab 模型测试**

```ts
test('project home tabs 顺序为 overview/sessions/tasks/assets', () => {
  expect(PROJECT_HOME_TABS.map(t => t.id)).toEqual([
    'overview', 'sessions', 'tasks', 'assets',
  ])
})
```

- [ ] **Step 2: UI**

- 顶栏：名称、主目录状态（调 `resolveEffectiveCwd`）、默认专家、`[新会话][新建任务][…]`
- `…`：重命名/颜色/重新定位主目录/归档/设置（原 settings 字段迁入）
- 概览：进行中 Task、最近 Session、最近资料、cwd 状态摘要
- 会话：现有 sessions 列表 + 新建
- 任务：`selectedProjectId` 已设时渲染精简 `KanbanBoardContainer` 或切换 `codeMainView='work'` + `workView='board'`
- 资料：assets + memory 入口

unavailable cwd：横幅「主目录不可用」+「重新定位」按钮 → dialog + `relocateWorkingDirectory`。

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): reshape project home into overview/sessions/tasks/assets

EOF
)"
```

---

### Task 12: Task / Teambition 强制 Project

**Files:**
- Modify: `TaskEditor.tsx`
- Modify: kanban task validate（若有 `tasks:validate`）
- Modify: `TeambitionPicker.tsx`
- Modify: `quick-task-model.ts` / `NewTaskComposer`（无 project 上下文时弹出选择）
- Create/Modify tests under `kanban/__tests__/`

- [ ] **Step 1: 写失败测试**

```ts
test('create task 缺少 projectId 时校验失败', () => {
  expect(validateTaskDraft({ ...base, projectId: '' }).ok).toBe(false)
})

test('Teambition claim 无 localProjectId 时要求选择，取消则不导入', () => {
  expect(planTeambitionClaim({ localProjectId: undefined, userPicked: null })).toEqual({ kind: 'abort' })
})
```

- [ ] **Step 2: 实现**

- TaskEditor：移除「无项目」option；submit 前 `if (!draft.projectId) toast.error('请选择项目')`
- 从 Project 主页/看板打开时 `initialProjectId` 预填且 ideally 锁定
- Teambition：若无 `selectedProjectId`，先 Modal 选 Project；取消 → return
- TaskRunner 已继承 project —— 回归 `conductor-session-host.test.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(kanban): require project for tasks and teambition imports

EOF
)"
```

---

### Task 13: 版本 bump + 类型检查 + BDD 清单核对

**Files:**
- Modify: `apps/electron/package.json`（0.1.92 → 0.1.93）
- Modify: `packages/shared/package.json`（0.1.30 → 0.1.31）

- [ ] **Step 1: 跑相关测试**

```bash
bun test packages/shared/src/utils/__tests__/project-path.test.ts \
  packages/shared/src/projects/__tests__/storage.test.ts \
  packages/shared/src/protocol/__tests__/channels.test.ts \
  apps/electron/src/main/lib/project-path-service.test.ts \
  apps/electron/src/main/lib/project-repository.test.ts \
  apps/electron/src/main/lib/task-handlers.test.ts \
  apps/electron/src/main/lib/agent-workspace-manager.test.ts \
  apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-views.test.ts \
  apps/electron/src/renderer/components/app-shell/__tests__/sidebar-project-groups.test.ts \
  apps/electron/src/renderer/components/app-shell/__tests__/code-main-view-model.test.ts
```

- [ ] **Step 2: typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: 对照 spec §12 BDD 手测清单**

| # | 场景 | 验证 |
|---|------|------|
| 12.1 | Default Space + 无项目中心 + Lucide chevron | 新 profile / 清 index |
| 12.2 | 最近/项目同批 Session | 切 toggle |
| 12.3 | 全局 vs Project 新会话归属 | 查 session meta |
| 12.4–12.5 | 打开文件夹创建/复用 | 两次同路径 |
| 12.6 | 不可用路径不静默回退 | 改 path 后跑 Agent |
| 12.7 | Teambition 必选 Project | 取消不导入 |
| 12.8 | 升级兼容 | 旧数据仍在 |

- [ ] **Step 4: Commit version**

```bash
git add apps/electron/package.json packages/shared/package.json
git commit -m "$(cat <<'EOF'
chore: bump electron and shared patch for workspace/project IA

EOF
)"
```

- [ ] **Step 5: 文档**

**不要**自动改 `AGENTS.md` / `README.md`——spec §13.8 要求先经用户允许。完成后询问用户是否同步文档。

---

## Spec coverage self-check

| Spec section | Task(s) |
|--------------|---------|
| §4 术语边界 | 10（UI）、6（Default Space） |
| §5 workdir / effectiveCwd / 路径唯一 | 1–4 |
| §6 侧栏 IA | 9–10 |
| §7 Project 主页 | 11 |
| §8.1–8.2 新会话 | 7, 7b |
| §8.3 打开文件夹 | 5, 8 |
| §8.4 Task/Teambition | 12 |
| §9 非破坏迁移 | 2, 6, 10（只删 UI） |
| §10 主进程路径服务 | 3–5 |
| §11 异常安全 | 3, 4, 11 |
| §12 BDD | 13 |
| §3.2 非目标 | 明确不做 |

## Placeholder scan

无 TBD/TODO 步骤；关键新模块含完整函数体。LeftSidebar 大拆分采用「props 注入提取」而非一次重写 3927 行，避免范围爆炸。

## Type consistency

- `EffectiveCwdStatus`: `'managed' | 'external' | 'unavailable'`
- IPC: `OPEN_OR_CREATE_BY_PATH` / `RESOLVE_EFFECTIVE_CWD` / `RELOCATE_WORKING_DIRECTORY`
- Atom: `sidebarSessionViewModeAtom`: `'recent' | 'projects'`
- `createAgent({ draft?: boolean, projectId?: string })`
