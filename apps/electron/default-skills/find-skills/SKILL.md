---
name: find-skills
description: 帮助用户发现并安装 Agent 技能。当用户询问"怎么做 X"、"找一个能做 X 的技能"、"有没有技能可以……"或表达希望扩展 Agent 能力时使用。当用户正在寻找可能已存在为可安装技能的功能时，应使用此技能。搜索技能、查找技能、找 skill、安装技能、技能市场时使用。
version: "1.0.2"
---
# Find Skills（查找技能）

本技能帮助你从开放 Agent 技能生态中发现并安装技能。

## 何时使用本技能

当用户出现以下情况时使用本技能：

- 询问"怎么做 X"，其中 X 可能是已有技能覆盖的常见任务
- 说"找一个能做 X 的技能"或"有没有能做 X 的技能"
- 询问"你能不能做 X"，其中 X 是一种专业化能力
- 表达希望扩展 Agent 能力
- 想要搜索工具、模板或工作流
- 提到希望某个特定领域（设计、测试、部署等）有人帮忙

## 什么是 Skills CLI？

Skills CLI（`npx skills`）是开放 Agent 技能生态的包管理器。技能是可扩展 Agent 能力的模块化包，包含专业知识、工作流和工具。

**常用命令：**

- `npx skills find [query]` - 交互式或按关键词搜索技能
- `npx skills add <package>` - 从 GitHub 或其他来源安装技能
- `npx skills check` - 检查技能更新
- `npx skills update` - 更新所有已安装技能

**浏览技能：** https://skills.sh/

## 如何帮助用户查找技能

### 第一步：理解用户需求

当用户请求帮助时，先明确：

1. 领域（例如 React、测试、设计、部署）
2. 具体任务（例如编写测试、制作动画、审查 PR）
3. 这是否是常见任务、很可能已有现成技能

### 第二步：搜索技能

用相关查询运行 find 命令：

```bash
npx skills find [query]
```

例如：

- 用户问"如何让我的 React 应用更快？" → `npx skills find react performance`
- 用户问"你能帮我做 PR 审查吗？" → `npx skills find pr review`
- 用户说"我需要生成变更日志" → `npx skills find changelog`

命令会返回类似结果：

```
Install with npx skills add <owner/repo@skill>

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### 第三步：向用户展示选项

找到相关技能后，向用户展示：

1. 技能名称及其功能
2. 可运行的安装命令
3. 在 skills.sh 查看更多信息的链接

示例回复：

```
I found a skill that might help! The "vercel-react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.

To install it:
npx skills add vercel-labs/agent-skills@vercel-react-best-practices

Learn more: https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### 第四步：提供安装帮助

如果用户希望继续，可以帮他们安装技能：

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` 标志表示全局安装（用户级），`-y` 跳过确认提示。

## 常见技能分类

搜索时，可参考这些常见分类：

| 分类 | 示例查询 |
| ---- | -------- |
| Web 开发 | react, nextjs, typescript, css, tailwind |
| 测试 | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| 文档 | docs, readme, changelog, api-docs |
| 代码质量 | review, lint, refactor, best-practices |
| 设计 | ui, ux, design-system, accessibility |
| 生产力 | workflow, automation, git |

## 高效搜索技巧

1. **使用具体关键词**："react testing" 优于只搜 "testing"
2. **尝试同义词**：如果 "deploy" 不行，试试 "deployment" 或 "ci-cd"
3. **关注热门来源**：许多技能来自 `vercel-labs/agent-skills` 或 `ComposioHQ/awesome-claude-skills`

## 未找到技能时

如果没有找到相关技能：

1. 说明未找到现有技能
2. 提议直接用你的通用能力帮助完成任务
3. 建议用户用 `npx skills init` 创建自己的技能

示例回复：

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill:
npx skills init my-xyz-skill
```
