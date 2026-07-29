# Session Git Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex-style Git context selection for new Agent sessions: Project | Local/Worktree | Branch, with safe worktree-backed execution.

**Architecture:** Keep Branch and execution location orthogonal. Renderer stores draft choices, main process performs all Git mutations transactionally and persists the resulting execution context into `AgentSessionMeta`. Worktree paths use the existing prompt policy default `<repo-root>/.worktrees/<slug>` and never accept arbitrary renderer-controlled destination paths.

**Tech Stack:** Electron main IPC, Bun tests, TypeScript shared contracts, React renderer components, Git CLI invoked with argument arrays.

---

### Task 1: Shared Git Session Context Contracts

**Files:**
- Modify: `packages/shared/src/types/runtime.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Test: `apps/electron/src/main/lib/agent-session-manager.test.ts`

**Step 1:** Write failing tests showing new `AgentSessionMeta` git fields persist and old sessions without them still load.

**Step 2:** Add shared types: `GitExecutionMode`, `GitBranchInfo`, `SessionGitContext`, `ListGitBranchesInput`, `PrepareSessionGitContextInput`, `PrepareSessionGitContextResult`.

**Step 3:** Add optional `gitRepoPath`, `gitBranch`, `gitExecutionMode`, `gitWorktreePath`, `gitBaseRef` to `AgentSessionMeta` and `AgentSessionMetaUpdates`.

**Step 4:** Run focused tests.

### Task 2: Git Session Context Main Service

**Files:**
- Create: `apps/electron/src/main/lib/git-session-context-service.ts`
- Create: `apps/electron/src/main/lib/git-session-context-service.test.ts`
- Reuse: `apps/electron/src/main/lib/agent-git-worktree-policy.ts`

**Step 1:** Write failing tests for branch listing, branch occupancy from worktrees, dirty Local checkout rejection, detached worktree creation, create-branch worktree creation, and existing worktree reuse.

**Step 2:** Implement Git CLI helpers using `spawnSync` / `execFileSync` with argument arrays and `GIT_TERMINAL_PROMPT=0`.

**Step 3:** Implement safe slug/path calculation under `<repo-root>/.worktrees/<slug>` and reject path escape.

**Step 4:** Implement transactional prepare: no session meta update on failure; cleanup only newly created worktree if meta update throws.

**Step 5:** Run focused service tests.

### Task 3: IPC / Preload Plumbing

**Files:**
- Modify: `packages/shared/src/types/runtime.ts`
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`

**Step 1:** Add IPC channels `git:list-branches` and `git:prepare-session-context`.

**Step 2:** Wire main handlers with source repo authorization based on project/session context. Do not accept target worktree path from renderer.

**Step 3:** Expose typed browser APIs in preload.

**Step 4:** Run typecheck.

### Task 4: Renderer Draft Model

**Files:**
- Create: `apps/electron/src/renderer/components/agent/git-context-picker-model.ts`
- Create: `apps/electron/src/renderer/components/agent/__tests__/git-context-picker-model.test.ts`

**Step 1:** Write failing tests for branch search/sort, occupied branch label, hidden non-Git state, and project remembered execution mode fallback.

**Step 2:** Implement pure model helpers.

**Step 3:** Run renderer model tests.

### Task 5: Draft Composer UI Integration

**Files:**
- Create: `apps/electron/src/renderer/components/agent/DraftGitContextPicker.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`
- Modify: `apps/electron/src/renderer/hooks/create-agent-session-flow.ts`
- Modify: `apps/electron/src/renderer/hooks/useCreateSession.ts` only if needed, preserving old API behavior.

**Step 1:** Show picker only for draft sessions with Git Project cwd.

**Step 2:** Add Local / Worktree segmented control; first use defaults Local, later persists per Project in localStorage.

**Step 3:** Add Branch popover with search and create-new-branch action.

**Step 4:** Before first user send, call `prepareSessionGitContext`; abort send and keep draft if preparation fails.

### Task 6: Verification

**Commands:**
- `bun test src/main/lib/agent-git-worktree-policy.test.ts`
- `bun test src/main/lib/git-session-context-service.test.ts`
- `bun test src/main/lib/agent-session-manager.test.ts`
- `bun test src/renderer/components/agent/__tests__/git-context-picker-model.test.ts`
- `bun run typecheck`
- `git diff --check`

**Manual UI:**
- Non-Git Project keeps existing composer.
- Git Project shows Project | Local/Worktree | Branch.
- First Git Project defaults Local; switching to Worktree is remembered per Project.
- Worktree session actually runs in `.worktrees/<slug>` and main worktree remains unchanged.
