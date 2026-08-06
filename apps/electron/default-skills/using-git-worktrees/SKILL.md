---
name: using-git-worktrees
description: 当开始需要与当前工作区隔离的特性开发，或执行实施计划之前使用——确保通过原生工具或 git worktree 回退方案存在隔离工作区。使用 worktree、隔离工作区、特性分支开发时使用。
group: 开发流程
version: 1.0.1
---

# Using Git Worktrees（使用 Git Worktrees）

## 概览

确保工作在隔离工作区中进行。优先使用平台原生 worktree 工具。仅在无原生工具可用时回退到手动 git worktree。

**核心原则：** 先检测现有隔离。然后使用原生工具。然后回退到 git。绝不与 harness 对抗。

**开始声明**：执行时先说 "I'm using the using-git-worktrees skill to set up an isolated workspace."

## 第 0 步：检测现有隔离

**创建任何东西之前，先检查你是否已经处于隔离工作区中。**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**子模块保护：** `GIT_DIR != GIT_COMMON` 在 git 子模块内部也为真。在断定"已在 worktree 中"之前，先确认你没有处于子模块中：

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**如果 `GIT_DIR != GIT_COMMON`（且非子模块）：** 你已在链接的 worktree 中。跳到第 2 步（项目设置）。不要创建另一个 worktree。

报告分支状态：
- 在分支上："Already in isolated workspace at `<path>` on branch `<name>`."
- 分离 HEAD："Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish time."

**如果 `GIT_DIR == GIT_COMMON`（或在子模块中）：** 你处于普通仓库检出。

你的指令中是否已声明了用户的 worktree 偏好？如果没有，在创建 worktree 前征求同意：

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

无需询问即可遵循任何已声明的偏好。如果用户拒绝同意，就在原地工作并跳到第 2 步。

## 第 1 步：创建隔离工作区

**你有两种机制。按此顺序尝试。**

### 1a. 原生 Worktree 工具（优先）

用户已要求隔离工作区（第 0 步已征得同意）。你是否已有创建 worktree 的方式？可能是名为 `EnterWorktree`、`WorktreeCreate` 的工具、`/worktree` 命令，或 `--worktree` 标志。如果有，使用它并跳到第 2 步。

原生工具会自动处理目录放置、分支创建和清理。在有原生工具时使用 `git worktree add` 会创建你的 harness 看不到也无法管理的幻影状态。

只有在没有原生 worktree 工具时才继续到第 1b 步。

### 1b. Git Worktree 回退

**仅在 1a 不适用时使用**——没有原生 worktree 工具可用。使用 git 手动创建 worktree。

#### 目录选择

按以下优先级。用户明确偏好始终优先于观察到的文件系统状态。

1. **检查指令中声明的 worktree 目录偏好。** 如果用户已指定，无需询问直接使用。

2. **检查现有项目本地 worktree 目录：**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   如果找到，使用它。如果两者都存在，`.worktrees` 优先。

3. **如果没有其他指导**，默认使用项目根目录的 `.worktrees/`。

#### 安全检查（仅项目本地目录）

**创建 worktree 前必须确认目录已被忽略：**

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**如果未被忽略：** 添加到 .gitignore，提交该改动，然后继续。

**为何关键：** 防止意外将 worktree 内容提交到仓库。

#### 创建 Worktree

```bash
# Determine path based on chosen location
path="$LOCATION/$BRANCH_NAME"

git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

**沙箱回退：** 如果 `git worktree add` 因权限错误（沙箱拒绝）失败，告知用户沙箱阻止了 worktree 创建，你将在当前目录工作。然后就地运行设置和基线测试。

## 第 2 步：项目设置

自动检测并运行合适的设置：

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

## 第 3 步：验证干净基线

运行测试以确保工作区干净启动：

```bash
# Use project-appropriate command
npm test / cargo test / pytest / go test ./...
```

**如果测试失败：** 报告失败，询问是继续还是调查。

**如果测试通过：** 报告就绪。

### 报告

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## 快速参考

| 情况 | 动作 |
|------|------|
| 已在链接的 worktree 中 | 跳过创建（第 0 步） |
| 在子模块中 | 视为普通仓库（第 0 步保护） |
| 有原生 worktree 工具 | 使用它（第 1a 步） |
| 无原生工具 | Git worktree 回退（第 1b 步） |
| `.worktrees/` 存在 | 使用它（验证已忽略） |
| `worktrees/` 存在 | 使用它（验证已忽略） |
| 两者都存在 | 使用 `.worktrees/` |
| 都不存在 | 检查指令文件，然后默认 `.worktrees/` |
| 目录未被忽略 | 添加到 .gitignore + 提交 |
| 创建时权限错误 | 沙箱回退，就地工作 |
| 基线测试失败 | 报告失败 + 询问 |
| 无 package.json/Cargo.toml | 跳过依赖安装 |

## 常见合理化辩解

| 借口 | 现实 |
|------|------|
| "我显然不在 worktree 中——无需检查" | 运行第 0 步。harness 创建的隔离和子模块都会骗过肉眼；检测命令才能定论。 |
| "`git worktree add` 比找原生工具更快" | 原生工具（如 `EnterWorktree`）负责放置、分支和清理。绕过它是头号错误——它会创建你的 harness 看不到也无法管理的幻影状态。 |
| "worktree 目录肯定已被忽略" | 运行 `git check-ignore`。未忽略的 worktree 目录会把整棵树提交进仓库。 |
| "任何目录名都行" | 明确指令优于现有项目本地目录，后者优于 `.worktrees/` 默认值。 |
| "工作区是全新的——基线测试可以等等" | 脏基线会让之后每个失败都难以定位。现在就跑测试；是否在失败后继续由你的人类伙伴决定。 |
