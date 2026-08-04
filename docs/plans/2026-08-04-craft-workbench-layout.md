# Craft 工作台布局实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不破坏现有功能、经典界面和 CRT 主题的前提下，让 `ui-modern` 的主会话与设置页采用 Craft Agents OSS 的统一工作台 frame：外层留白/圆角、独立面板间隙、低对比边缘和分层阴影。

**Architecture:** 保留现有 React 面板结构和 Jotai 状态，只在 `AppShell` 增加一个现代布局 frame 标记/间距层，并在 `globals.css` 通过 `ui-modern` 选择器投影统一几何与材质。Scenic 继续使用当前本地背景与透明 surface；Solid custom 和旧具名主题继续使用各自颜色；`ui-classic` 与 CRT 不进入新规则。先覆盖 AppShell 的左侧栏、MainArea、右侧检查器和 SettingsPanel，再用浏览器检查交互和遮罩层。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Jotai、Electron/Vite、Bun test。

---

### Task 1: 固化布局边界与可测试行为

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/styles/globals.css`
- Test: `apps/electron/src/renderer/theme/theme-css-regression.test.ts`

**Step 1: 写失败测试**

为现代布局 CSS 增加行为断言，覆盖：
- `.ui-modern .refined-shell` 作为外层 frame 的布局入口；
- `.ui-modern .shell-content-layer` 有外层间隙/圆角所需的 frame 规则；
- `.ui-modern` 的 panel surface 规则只匹配现代界面，不影响 `.ui-classic`；
- Scenic 仍保留现有背景、输入框和主内容不整体 blur 的规则。

**Step 2: 运行测试确认失败**

Run: `bun test apps/electron/src/renderer/theme/theme-css-regression.test.ts`

Expected: 新增的 Craft layout 断言失败，现有 Scenic 断言继续通过。

**Step 3: 记录最小结构方案**

不重写 AppShell 的面板组件，不引入新依赖；优先使用现有 `refined-shell`、`crt-sidebar`、`refined-content`、`refined-inspector` 和 `shell-overlay-layer` class，避免破坏面板拖拽与 overlay stacking。

---

### Task 2: 实现 ui-modern 外层工作台 frame

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/styles/globals.css`

**Step 1: 为现代 AppShell 添加 frame 层级**

给现有 shell 内容增加明确的现代 frame class；保留 classic 的已有 `p-2` 分支和所有面板宽度/拖拽逻辑。设置 overlay 必须继续覆盖整个 shell，不被新 frame 的 overflow 或 border-radius 截断。

**Step 2: 添加外层间隙与圆角**

仅在 `:root.ui-modern` 下：
- shell 外层保留 Craft 风格的约 12px 视觉 inset；
- frame 使用约 16px–20px 圆角和 `overflow: hidden`；
- 顶部标题栏仍可拖拽，Windows 控制按钮区域保持原来的安全区；
- Scenic 时让 shell 背景/壁纸从 frame 外层与 panel gap 露出；Solid custom/旧主题使用对应背景，不强行添加图片。

**Step 3: 将三列转为独立 panel surface**

仅现代界面为左侧栏、中间 MainArea、右侧检查器提供统一 gap、圆角、低对比边缘和分层 shadow。不要把 `shadow-middle` 直接套到所有内部 card；真实 panel 才使用该层级。主内容 pane 不恢复整块 Scenic blur，输入框和弹层继续使用现有局部玻璃。

**Step 4: 运行目标测试**

Run: `bun test apps/electron/src/renderer/theme/theme-css-regression.test.ts`

Expected: 新增布局断言与全部 Scenic 断言通过。

---

### Task 3: 主会话与设置页视觉回归

**Files:**
- Modify: `apps/electron/src/renderer/components/settings/SettingsPanel.tsx`（仅在实际需要时）
- Modify: `apps/electron/src/renderer/styles/globals.css`
- Test: `apps/electron/src/renderer/theme/theme-css-regression.test.ts`

**Step 1: 验证主会话**

检查顶部 TabBar、会话标题、主内容、输入框和右侧检查器是否都在 frame 内；确认内容滚动仍发生在原有 scroll container，面板拖拽宽度没有被 gap 改变成不可用。

**Step 2: 验证设置页**

检查 SettingsPanel 的 navigator/content 两列是否复用同一 frame；确认顶部拖拽区域、滚动内容、关闭按钮、Radix 弹层和背景图不被 `overflow-hidden` 截断。

**Step 3: 保持主题隔离**

分别检查 `ui-classic`、`theme-terminal-dark` 与 `ui-modern`：前两者不应获得新的外层圆角/gap 规则；所有已有主题色、选中态、输入框、权限条和面板交互保持不变。

---

### Task 4: 完整验证与收尾

**Files:**
- No source changes expected unless validation finds a regression.
- Update: `/Users/admin/.luxcoder/agent-workspaces/default/projects/luxcoder/MEMORY.md` with confirmed layout result.

**Step 1: 运行主题测试**

Run: `bun test apps/electron/src/renderer/theme`

Expected: 全部通过。

**Step 2: 运行全量测试、类型检查和构建**

Run: `bun test`
Run: `bun run --filter='*' typecheck`
Run: `bun run --filter @luxcoder/electron build:renderer`
Run: `git diff --check`

Expected: 全部成功，无新增错误。

**Step 3: 开发窗口人工回归**

检查 Haze 主会话、Haze 设置页、任意 Solid custom 预设、classic 和 CRT；重点验证窗口控制、拖拽面板、滚动、设置 overlay、弹层 z-index 和输入框焦点。

**Step 4: 不提交**

保留当前所有修改在工作树，等待用户确认视觉效果后再考虑提交；不修改 `AGENTS.md` 或 `README.md`，除非用户另行允许文档同步。
