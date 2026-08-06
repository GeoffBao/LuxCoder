---
name: staged-review-and-fix
description: Reviews current git changes (staged and/or unstaged), identifies issues (bugs, style, security, logic), and applies targeted fixes. Use when the user asks to review "this commit", "git status", "staged changes", "当前改动", "审核这笔提交", or to review and fix the pending changes.
group: 代码质量
version: 1.0.0
---

# Staged Changes Review and Fix

针对 `git status` 下的当前改动（暂存或未暂存）做代码审核，发现问题并针对性修复。

## 工作流

1. **获取改动范围**
   - `git status` 确认修改/新增/删除的文件
   - `git diff --staged` 看暂存区 diff；若需含工作区则再加 `git diff`
   - 仅对本次「这一笔」相关的文件做 review，不扩大范围

2. **执行 Code Review**
   - 按下方 Checklist 逐项检查
   - 对每个问题标注：🔴 必须修 / 🟡 建议修 / 🟢 可选

3. **列出问题点**
   - 用简短列表写出：文件、位置（行号/符号）、问题描述、严重程度
   - 优先修 🔴，再视情况修 🟡

4. **针对性修复**
   - 按列表逐项改代码，改完可顺带跑 linter/tests 验证
   - 不重写无关代码，只动有问题的地方

## Review Checklist

- **正确性**：逻辑是否对、边界/空值/错误是否处理、是否有明显 bug
- **安全**：敏感信息是否硬编码、输入是否校验、权限/依赖是否合理
- **风格与一致性**：与项目既有风格、命名、目录结构是否一致
- **可维护性**：重复代码、过长函数、魔法数字、缺失注释（在关键处）
- **类型/契约**：TS 类型是否合理、接口/DTO 是否与调用方一致
- **测试**：改动是否应有单测或需更新已有测试

## 输出格式

**问题列表示例：**

```text
- [🔴] packages/shared/src/agent/claude-agent.ts:123 — 未处理 Promise rejection，可能导致未捕获异常
- [🟡] apps/electron/src/renderer/App.tsx — 重复的 useState 可合并为 useReducer 或自定义 hook
- [🟢] packages/shared/src/protocol/dto.ts — 缺少 JSDoc，建议补全导出类型说明
```

**修复时**：先说明要修哪一条，再给出具体修改（可只贴关键片段），避免大段无关代码。

## 注意事项

- 以「这一笔提交」为范围，不主动扩大为全项目重构
- 修复后若项目有 lint/format（如 Prettier、ESLint），跑一遍确保通过
- 不引入新依赖、不改变既有 API 语义，除非问题本身需要
