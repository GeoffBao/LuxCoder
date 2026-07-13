# Task 2 Report — Shared Project contracts and storage

## 状态

- 已完成 Projects 范围内的 Task 2 实现，并保留了 Task 1 的 package-root boundary test。
- 已按你的修正要求恢复同一测试文件中的边界覆盖，再增补 Project CRUD / slug / archive / assets / Memory 行为测试。
- 已只提交 Projects 相关文件；报告未纳入 commit。

## 本次修正说明

第一次实现时，我错误地用 Task 2 行为测试覆盖了 Task 1 的 boundary test。收到你的纠正后，我做了两件事：

1. 恢复 `@luxagents/shared/projects` 的 package-root boundary test。
2. 在同一个 `storage.test.ts` 中新增 `storage.ts` full export surface 断言和 Task 2 行为测试。

## 变更文件

- `packages/shared/src/projects/index.ts`
- `packages/shared/src/projects/storage.ts`
- `packages/shared/src/projects/types.ts`
- `packages/shared/src/projects/__tests__/storage.test.ts`

## 实现摘要

- `projects/index.ts` 仅重新导出类型，保留 Task 1 的 renderer-safe package-root 边界。
- `projects/storage.ts`
  - 保留现有 JSON 原子写入（临时文件 + `renameSync`）。
  - 新增 `readProjectMemory(root, slug): string`，缺失时返回空字符串。
  - 收紧 `sanitizeAssetFilename()`：拒绝绝对路径、`/`、`\` 等不安全文件名，不再静默吞掉 `../`。
- `projects/__tests__/storage.test.ts`
  - 保留 package-root boundary test。
  - 新增 storage full export surface 断言。
  - 新增项目创建、唯一 slug、config 持久化、archive/unarchive、资产安全路径、Memory 读写测试。

## RED / GREEN 记录

### RED 1（方向修正后）

命令：

```bash
bun test packages/shared/src/projects/__tests__/storage.test.ts
```

结果：FAIL

关键输出：

```text
(fail) projects package contracts > package root 仅暴露 renderer-safe contract
(fail) projects package contracts > storage 模块保留完整导出面
TypeError: projectStorage.readProjectMemory is not a function
error: expect(received).toThrow(expected)
Expected substring: "不安全"
Received function did not throw
```

说明：这次失败证明修正后的测试确实覆盖到了缺失行为，而不是覆盖掉原边界。

### GREEN 1（Projects focused tests）

命令：

```bash
bun test packages/shared/src/projects/__tests__/storage.test.ts
```

结果：PASS

关键输出：

```text
6 pass
0 fail
```

### Focused tests（按你的要求重跑 Projects + Tasks）

命令：

```bash
bun test packages/shared/src/projects/__tests__ packages/shared/src/tasks/__tests__
```

结果：FAIL（非 Projects 范围阻塞）

关键输出：

```text
(fail) tasks package contracts > package root 仅暴露 renderer-safe contract
8 pass
1 fail
```

说明：失败点在 `packages/shared/src/tasks/__tests__/schema.test.ts` 对应的 Tasks package-root boundary，不在本次 Projects ownership 范围内。

### Shared typecheck

命令：

```bash
bun run --filter='@luxagents/shared' typecheck
```

结果：FAIL（非 Projects 范围阻塞）

关键输出：

```text
@luxagents/shared typecheck: src/tasks/__tests__/schema.test.ts(29,12): error TS18048: 'parsed.error' is possibly 'undefined'.
```

### Diff hygiene

命令：

```bash
git diff --check -- packages/shared/src/projects/types.ts packages/shared/src/projects/storage.ts packages/shared/src/projects/index.ts packages/shared/src/projects/__tests__/storage.test.ts
```

结果：PASS（无输出）

## Commit

实际提交：`2d759959`

命令：

```bash
git add packages/shared/src/projects/types.ts packages/shared/src/projects/storage.ts packages/shared/src/projects/index.ts packages/shared/src/projects/__tests__/storage.test.ts
git commit -m "feat: add workspace project storage"
```

结果：

```text
[feature/work-mode-kanban 2d759959] feat: add workspace project storage
```

## 自检

- 只动了你授权的 Projects 文件和测试。
- 没有回滚或 stage 其他人的工作树改动。
- 用测试证明了：
  - package-root boundary 仍在；
  - storage full export surface 存在；
  - duplicate project name 产生唯一 slug；
  - archive/unarchive 不删除资产和 Memory；
  - `absolutePath` 只存在于运行时资产返回值；
  - `../` 和绝对路径文件名被拒绝。

## 遗留关注点

1. `packages/shared/src/tasks/__tests__/schema.test.ts` 当前也存在 boundary/typecheck 问题，导致 “Projects + Tasks focused tests” 和 shared typecheck 不能全绿，但它超出本次 ownership。
2. `packages/shared/src/projects/types.ts` 这次没有额外修改；当前 skeleton 已满足本任务测试所需 contract。

---

## Task 2 审查修复（2026-07-13）

## 本次修复目标

- 修复 `createProject` / `updateProject` 返回值与 `config.json` 持久化后的 `updatedAt` 可能漂移的问题。
- 补强 archive / unarchive 测试，要求 reload 后验证 `archivedAt` 的持久化与清除。
- 递增 `@luxagents/shared` patch 版本。

## 根因

- `updateProject()` / `createProject()` 已经在内存中构造了目标 `ProjectConfig.updatedAt`。
- 但 `saveProjectConfig()` 在原子写盘前又偷偷执行了一次 `Date.now()`，把调用方传入的 `updatedAt` 覆盖成新的值。
- 因为两次取时钟可能落在不同毫秒，所以返回值与落盘后的 `config.json` 会发生漂移。

## 本次改动

- `packages/shared/src/projects/__tests__/storage.test.ts`
  - 新增可控时间源 helper，避免依赖“同毫秒”偶然通过。
  - 加强 `createProject` 测试：断言返回值 `updatedAt` 与重载后的 `config.json.updatedAt` 完全一致。
  - 加强 `updateProject` 测试：断言返回值 `updatedAt` 与重载后的 `config.json.updatedAt` 完全一致。
  - 加强 archive / unarchive 测试：每次 reload 后分别校验 `archivedAt` 持久化、清除，以及 `updatedAt` 与返回值一致。
- `packages/shared/src/projects/storage.ts`
  - 保留临时文件 + `renameSync` 的原子写入。
  - 移除 `saveProjectConfig()` 对 `updatedAt` 的二次生成与覆盖，改为原样写入调用方传入的 `config`。
- `packages/shared/package.json`
  - 版本从 `0.1.0` 递增到 `0.1.1`。

## RED

命令：

```bash
bun test packages/shared/src/projects/__tests__/storage.test.ts
```

结果：FAIL

关键输出：

```text
Expected: 1000
Received: 1001

Expected: 4000
Received: 4001
```

说明：这次失败直接证明了 `saveProjectConfig()` 二次取时间导致返回值与重载 config 的 `updatedAt` 漂移。

## GREEN

命令：

```bash
bun test packages/shared/src/projects/__tests__/storage.test.ts
```

结果：PASS

关键输出：

```text
7 pass
0 fail
```

## 验证命令与结果

### 1) Project storage tests

命令：

```bash
bun test packages/shared/src/projects/__tests__/storage.test.ts
```

结果：PASS

关键输出：

```text
7 pass
0 fail
35 expect() calls
```

### 2) Shared typecheck

命令：

```bash
bun run --filter='@luxagents/shared' typecheck
```

结果：FAIL（超出本次授权范围的既有问题）

关键输出：

```text
@luxagents/shared typecheck: src/tasks/__tests__/schema.test.ts(29,12): error TS18048: 'parsed.error' is possibly 'undefined'.
@luxagents/shared typecheck: Exited with code 2
```

## 本次修复涉及文件

- `packages/shared/src/projects/storage.ts`
- `packages/shared/src/projects/__tests__/storage.test.ts`
- `packages/shared/package.json`
- `.superpowers/sdd/task-2-report.md`

## 当前结论

- Task 2 审查指出的 timestamp 漂移问题已用确定性测试复现并修复。
- archive / unarchive 现在有 reload 后的持久化断言。
- `@luxagents/shared` patch 版本已递增。
- 本次追加的审查修复报告已随当前提交一并纳入版本控制。
- `packages/shared` 的全量 typecheck 仍被 `src/tasks/__tests__/schema.test.ts` 的既有问题阻塞；这不在本次允许修改范围内。
