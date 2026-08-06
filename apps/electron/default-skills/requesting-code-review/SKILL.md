---
name: requesting-code-review
description: 请求代码评审。在完成任务、实现主要功能或合并之前使用，用于验证工作是否符合需求。触发词：请求评审、代码评审、code review、找人 review、review 我的代码、合并前检查、PR 评审、代码检查、review before merge
group: 代码质量
version: 1.0.1
---

# 请求代码评审

派一个代码评审子 Agent，在问题扩散之前把它们抓住。评审者拿到的是精心构造的评估上下文——绝不是你的会话历史。

**核心原则：** 早评审，勤评审。

## 何时请求评审

**必须：**
- 子 Agent 驱动开发中，每个任务完成之后
- 完成主要功能之后
- 合并到 main 之前

**可选但有价值：**
- 卡住的时候（换一个全新视角）
- 重构之前（基线检查）
- 修复复杂 Bug 之后

## 如何请求

**1. 获取 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派发代码评审子 Agent：**

派发一个 `general-purpose` 子 Agent，填充 [code-reviewer.md](code-reviewer.md) 中的模板。

**占位符：**
- `{DESCRIPTION}` - 你所做内容的简要说明
- `{PLAN_OR_REQUIREMENTS}` - 它应该做什么
- `{BASE_SHA}` - 起始提交
- `{HEAD_SHA}` - 结束提交

**3. 处理反馈：**
- Critical（严重）问题立即修复
- Important（重要）问题在继续之前修复
- Minor（次要）问题记下来稍后处理
- 如果评审者错了，提出异议（附理由）

## 示例

```
[刚刚完成第 2 项任务：添加验证函数]

你：继续之前，让我请求代码评审。

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[派发代码评审子 Agent]
  DESCRIPTION: 添加了 verifyIndex() 和 repairIndex()，含 4 种问题类型
  PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md 中的第 2 项任务
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[子 Agent 返回]:
  优点: 架构干净，测试真实
  问题:
    重要: 缺少进度指示
    次要: 报告间隔的魔法数字（100）
  评估: 可以继续

你: [修复进度指示]
[继续第 3 项任务]
```

## 常见自我合理化

| 借口 | 现实 |
|--------|---------|
| "我自己看看 diff 就行了，不用派评审" | 你是协调者——内联看 diff 会烧掉你需要用来继续推进工作的上下文窗口。派一个评审子 Agent：diff 和评估都在它的上下文里，回到你手里的只有结论。 |
| "评审者需要我完整的会话历史才能理解这个改动" | 交给它精心构造的上下文，绝不是你的会话历史。这样评审者关注的是工作成果，而不是你的思考过程。 |

## 危险信号

**绝不：**
- 因为"它很简单"就跳过评审
- 忽略 Critical（严重）问题
- 带着未修复的 Important（重要）问题继续
- 与合理的技术反馈争论

**如果评审者错了：**
- 用技术理由提出异议
- 展示能证明它有效的代码/测试
- 请求澄清

模板见：[code-reviewer.md](code-reviewer.md)
