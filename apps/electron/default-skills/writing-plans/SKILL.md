---
name: writing-plans
description: 当你有多步骤任务的规格说明或需求、且尚未开始写代码时使用。在动手编码前，为多步骤任务编写全面的实施计划。制定实施计划、写计划、规划任务拆分时使用。
version: "1.0.3"
---
# Writing Plans（编写实施计划）

## 概览

编写全面的实施计划，假定工程师对我们的代码库零上下文、品味存疑。记录他们需要知道的一切：每个任务要改哪些文件、代码、测试、可能需要查看的文档、如何测试。把整个计划拆成小而可咀嚼的任务。DRY、YAGNI、TDD、频繁提交。

假定他们是熟练的开发者，但对我们的工具集或问题域几乎一无所知。假定他们不太擅长良好的测试设计。

**开始声明**：执行时先说 "I'm using the writing-plans skill to create the implementation plan."

**上下文**：此流程应在专用 worktree 中运行。

**计划保存到：** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## 小而可咀嚼的任务粒度

**每一步是一个动作（2-5 分钟）：**
- "编写失败的测试" - 步骤
- "运行它以确认失败" - 步骤
- "实现让测试通过的最小代码" - 步骤
- "运行测试并确认通过" - 步骤
- "提交" - 步骤

## 计划文档头部

**每个计划必须以如下头部开头：**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## 任务结构

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
```

## 记住
- 始终使用确切的文件路径
- 计划中包含完整代码（不要写"添加校验"这种空话）
- 给出确切命令及预期输出
- 使用 @ 语法引用相关技能
- DRY、YAGNI、TDD、频繁提交

## 执行交接

保存计划后，提供执行方式选择（向用户说明）：

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?"**

**如果选择 Subagent-Driven（本会话内子代理驱动）：**
- **必需子技能：** 使用 superpowers:subagent-driven-development
- 留在当前会话
- 每个任务派发全新子代理 + 代码审查

**如果选择 Parallel Session（独立并行会话）：**
- 引导他们在 worktree 中打开新会话
- **必需子技能：** 新会话使用 superpowers:executing-plans
