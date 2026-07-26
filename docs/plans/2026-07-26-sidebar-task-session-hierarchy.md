# Sidebar Task Session Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在所有侧边栏分组模式中统一展示 Task 主任务、Task 子任务和 collaboration 子会话关系，保证窄侧边栏中的文字可读性。

**Architecture:** 抽取 renderer 纯函数 `sidebar-session-tree.ts`，按 `parentSessionId` 构建单层会话树并提供状态、进度和活跃时间聚合。日期、项目、状态、自定义分组、不分组和置顶视图统一消费该树模型；操作级联仍只作用于 collaboration 子会话。

**Tech Stack:** React、TypeScript、Jotai、Tailwind CSS、bun:test

---

### Task 1: 建立统一会话树纯函数

**Files:**
- Create: `apps/electron/src/renderer/components/app-shell/sidebar-session-tree.ts`
- Create: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-tree.test.ts`

**Steps:**
1. 先写失败测试，覆盖 Task 子会话、collaboration 子会话、孤儿子会话和稳定排序。
2. 运行 `bun test apps/electron/src/renderer/components/app-shell/__tests__/sidebar-session-tree.test.ts`，确认失败。
3. 实现建树、任务族状态、聚合活跃时间、完成进度纯函数。
4. 增加同一 `taskNodeId` 多次运行只取最新会话的进度测试。
5. 重跑测试并确认通过。

### Task 2: 日期、置顶和扁平分组消费统一树

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AgentSessionItem.tsx`

**Steps:**
1. 用新模块替换 `LeftSidebar.tsx` 内只识别 `sourceDelegationId` 的展示建树逻辑。
2. 保留 `getDirectDelegatedChildren` 供删除、归档、置顶和迁移级联，避免改变操作语义。
3. 将日期、置顶、状态、自定义分组和不分组列表改为以任务族根节点分页/分桶。
4. 将 `delegationSummary` 泛化为子会话摘要，Task 主任务显示紧凑进度。
5. Task 子任务复用 `GitBranch` 图标、20px 单层缩进和 `MarqueeText`。
6. 当前、running 或 blocked 子任务所在任务族自动展开，手动收起优先。

### Task 3: 项目分组展示完整任务树

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/sidebar-projects-model.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/SidebarProjectsTab.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/__tests__/sidebar-projects-model.test.ts`

**Steps:**
1. 更新失败测试：可分组集合保留子任务，项目树以主任务归属分桶。
2. 项目模式先建树，再按根会话 `projectId` 分组。
3. 项目内按任务族聚合活跃时间排序，注意力状态包含子任务。
4. 渲染主任务行、紧凑进度、展开按钮和缩进子任务行。
5. 项目预览上限按根任务族计数，避免一个多节点任务耗尽全部预览名额。
6. 重跑项目模型测试。

### Task 4: 回归验证与文档沉淀

**Files:**
- Modify: `docs/plans/2026-07-26-sidebar-task-session-hierarchy-design.md`（仅在实现偏离设计时）
- Modify: `/Users/admin/.luxcoder/agent-workspaces/default/projects/luxcoder/MEMORY.md`

**Steps:**
1. 运行侧边栏树、项目模型、会话列表和看板模型测试。
2. 运行 renderer typecheck。
3. 运行 Electron build。
4. 检查 240px 最小宽度下主任务进度、子任务缩进和标题省略，确保无横向溢出。
5. 将最终决策、文件索引和验证结果追加到项目 MEMORY。
