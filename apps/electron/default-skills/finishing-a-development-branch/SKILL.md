---
name: finishing-a-development-branch
description: 完成开发分支。当实现已完成、所有测试通过、需要决定如何集成代码时使用。触发词：完成分支、合并分支、merge、创建 Pull Request、创建 PR、推送分支、push、集成代码、收尾、清理 worktree、development branch
group: 开发流程
version: 1.0.1
---

# 完成开发分支

## 概述

**核心原则：** 验证测试 → 检测环境 → 呈现选项 → 执行选择 → 清理。

**开始声明：** 执行时先说 "I'm using the finishing-a-development-branch skill to complete this work."

## 第 1 步：验证测试

运行项目的完整测试套件（`npm test` / `cargo test` / `pytest` / `go test ./...`）。

**如果测试失败**，报告失败并停下——选项菜单要在测试全绿之后才出现：

```
Tests failing (<N> failures). Must fix before completing:

[Show failures]
```

**如果测试通过：** 继续第 2 步。

## 第 2 步：检测环境

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
# Capture now, while still inside the workspace — Step 5 changes directory
# before cleanup (Step 6) needs this value
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

这决定了显示哪个选项菜单以及如何清理：

| 状态 | 菜单 | 清理方式 |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON`（普通仓库） | 标准 3 个选项 | 没有 worktree 需要清理 |
| `GIT_DIR != GIT_COMMON`，命名分支 | 标准 3 个选项 | 基于来源判断（见第 6 步） |
| `GIT_DIR != GIT_COMMON`，游离 HEAD | 精简 2 个选项（无合并） | 外部管理——保持原样 |

## 第 3 步：确定基线分支

基线分支就是这份工作从哪个分支分叉出来的——通常在计划、对话或分支的上游中写明。如果还不知道，就问："This branch split from <your best guess> - is that correct?"（这个分支是从 <你的最佳猜测> 分叉出来的，对吗？）合并前必须确认：合错基线分支很难撤销，代价很高。

## 第 4 步：呈现选项

**普通仓库和命名分支 worktree——呈现以下恰好 3 个选项：**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**游离 HEAD——呈现以下恰好 2 个选项：**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)

Which option?
```

按原文呈现菜单——简洁，每个选项都来自上面的列表。丢弃工作只发生在你的人类伙伴明确要求时（见下方"如果你的人类伙伴要求丢弃工作"）。等待他们的回答；集成决策由他们做。

## 第 5 步：执行选择

### 选项 1：本地合并

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
```

如果合并结果上测试失败：停下，保留 worktree 和分支，展开调查——还没有推送到远程，所以合并是本地且可恢复的。

一旦合并结果全绿：清理 worktree（第 6 步），然后删除分支：

```bash
git branch -d <feature-branch>
```

### 选项 2：推送并创建 PR

```bash
git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# git push origin HEAD:refs/heads/<new-branch>
```

然后使用 forge（代码托管平台）的工具创建针对 <base-branch> 的 pull/merge request——如果有 CLI 就用 CLI，或者用大多数 forge 在推送时打印的创建 URL——遵循仓库的 PR 模板和约定（如果存在），并把 URL 报告给你的人类伙伴。

保留 worktree——你的人类伙伴会在那里处理 PR 反馈的迭代。

### 选项 3：保持原样

报告："Keeping branch <name>. Worktree preserved at <path>."（保留分支 <name>。worktree 保留在 <path>。）

### 如果你的人类伙伴要求丢弃工作

这条路径只作为对明确丢弃请求的响应而存在。先确认：

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

等待那个确切的确认词。收到后：

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

然后清理 worktree（第 6 步）并强制删除分支：

```bash
git branch -D <feature-branch>
```

## 第 6 步：清理工作区

**选项 1 和已确认的丢弃会执行。** 选项 2 和 3 始终保留 worktree。两个调用方都已经把目录切换到了主仓库根目录——worktree 移除必须在 worktree 之外执行——并使用第 2 步捕获的 `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` 值（这些值是在切换目录之前捕获的）。

**如果 `GIT_DIR == GIT_COMMON`：** 普通仓库，没有 worktree 需要清理。完成。

**如果 `WORKTREE_PATH` 位于 `.worktrees/` 或 `worktrees/` 下：** 这个 worktree 是 Superpowers 创建的——我们负责清理：

```bash
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**其他情况：** 工作区归宿主环境所有——保持原样。如果你的平台提供了工作区退出工具，就使用它。

## 快速参考

| 选项 | 合并 | 推送 | 保留 Worktree | 清理分支 |
|--------|-------|------|---------------|----------------|
| 1. 本地合并 | 是 | - | - | 是 |
| 2. 创建 PR | - | 是 | 是 | - |
| 3. 保持原样 | - | - | 是 | - |
| 丢弃（仅限明确请求） | - | - | - | 是（强制） |

## 常见自我合理化

| 借口 | 现实 |
|--------|---------|
| "本次会话早些时候测试通过过" | 要在你准备集成的这份代码树上运行测试套件。一次全绿只能证明它运行过的那份代码树没问题。 |
| "他们显然想合并" | 集成是你的人类伙伴的决策。呈现菜单并等待。 |
| "他们看起来做完这个功能了——我主动提议丢弃它" | 菜单就按原样呈现。只有你的人类伙伴明确说出要求时才丢弃。 |
| "'对，删了吧'也算确认" | 只有打出来的 `discard` 一词才授权删除。 |
| "PR 已经建了，worktree 现在就是多余的" | PR 反馈要在那个 worktree 里修复。在代码落地之前它都要保留。 |
| "这个 worktree 看起来过期了——我也顺手清理一下" | 只清理 `.worktrees/` 或 `worktrees/` 下的 worktree。其他都归宿主所有。 |
| "合并结果失败可能只是偶发的" | 合并结果一旦失败，一切都要停下来。在调查期间，分支和 worktree 都保持原样。 |
| "基线分支显然就是 main" | 确认分叉点，或者直接问。合错基线分支很难撤销。 |
| "推送被拒绝了——强制推送就能解决" | 推送被拒绝意味着远程已经前进了。先调查；只有在你的人类伙伴明确要求时才强制推送。 |
