# Chat / Code 顶部结构统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消灭 Chat / Code 两模式下顶部 chrome（TabBar + 会话标题行）的行数/样式不对称，统一为共享组件。

**Architecture:** 把 `ChatHeader.tsx` / `AgentHeader.tsx` 里重复的标题编辑逻辑抽成共享的 `SessionHeader.tsx`；把独占一整行的「会话｜看板」切换条拆出一个可复用的 `CodeMainViewSwitchControl`，放入左侧栏「最近会话｜项目」行右侧（craft-agents-oss 式：视图开关挂在会话列表标题行），原有整行版本继续用于看板视图自己的顶部（承担从看板切回会话的入口，等同 craft 里 Board 模式下自带切换控件的做法）；TabBar 完全不动，两模式零差异；最后把 Chat/Code 模式切换器的左右顺序对调。

**Tech Stack:** React 18 + TypeScript + Jotai + Tailwind CSS，Electron renderer 进程（无 React 组件测试基建，验证靠 `bun run typecheck` + `bun run dev` 手动过一遍）。

---

## 关于测试

这几个文件是纯展示型 Electron renderer 组件（标题栏、TabBar 布局），仓库里目前没有 `@testing-library/react` / jsdom 之类的组件测试基建，现有 `.test.ts` 全部是纯逻辑单测（`kanban-view-model.test.ts` 等）。引入组件测试框架超出本次改动范围，因此每个任务用 `bun run typecheck` 做类型层面的快速反馈，最后一个任务做完整的手动可视化验收（覆盖设计文档里列的验证清单）。

---

### Task 1: 把 `.agent-header-polished` 泛化为 `.session-header-polished`

**Files:**
- Modify: `apps/electron/src/renderer/styles/globals.css:1069-1074`
- Modify: `apps/electron/src/renderer/components/agent/AgentHeader.tsx:72`

- [ ] **Step 1: 重命名 CSS class**

在 `apps/electron/src/renderer/styles/globals.css` 里找到：

```css
/* Header：平涂，同内容区一色，仅底部一道 hairline */
:root:not(.ui-classic) .agent-header-polished {
  background: hsl(var(--content-area));
  box-shadow: 0 1px 0 var(--ink-line);
  backdrop-filter: none;
}
```

改成：

```css
/* Header：平涂，同内容区一色，仅底部一道 hairline。Chat/Agent 会话标题行共用。 */
:root:not(.ui-classic) .session-header-polished {
  background: hsl(var(--content-area));
  box-shadow: 0 1px 0 var(--ink-line);
  backdrop-filter: none;
}
```

- [ ] **Step 2: 同步更新 `AgentHeader.tsx` 里的引用**

第 72 行：

```diff
-    <div className="agent-header-polished relative z-[51] flex items-center gap-2 px-5 h-[48px]">
+    <div className="session-header-polished relative z-[51] flex items-center gap-2 px-5 h-[48px]">
```

（这一步在 Task 4 会被整个替换掉，这里先做是为了保证每一步之间仓库始终能编译通过。）

- [ ] **Step 3: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无新增报错

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/styles/globals.css apps/electron/src/renderer/components/agent/AgentHeader.tsx
git commit -m "refactor(ui): rename agent-header-polished to session-header-polished"
```

---

### Task 2: 新建共享 `SessionHeader` 组件

**Files:**
- Create: `apps/electron/src/renderer/components/tabs/SessionHeader.tsx`

- [ ] **Step 1: 写出组件**

把 `AgentHeader.tsx`（标题编辑状态机、pencil/check/x、拖拽层）和 `ChatHeader.tsx`（`actions` 插槽）的公共部分合并成这一个文件：

```tsx
/**
 * SessionHeader — Chat / Agent 会话共用的标题栏
 *
 * 显示会话标题（可点击编辑），右侧可选 actions 插槽由调用方传入
 * （Chat 传系统提示词选择器/置顶/并排模式，Agent 目前不传）。
 */

import * as React from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { detectIsWindows, WINDOW_CONTROLS_INSET_RIGHT } from '@/lib/platform'
import { cn } from '@/lib/utils'

export interface SessionHeaderProps {
  /** 当前标题 */
  title: string
  /** 保存新标题；title 为空或与当前值相同时不会被调用 */
  onRename: (newTitle: string) => Promise<void> | void
  /** 右侧操作区，不传则不渲染 */
  actions?: React.ReactNode
  /** 编辑态输入框最大长度 */
  maxLength?: number
}

export function SessionHeader({
  title,
  onRename,
  actions,
  maxLength = 100,
}: SessionHeaderProps): React.ReactElement {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const [editing, setEditing] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  /** 进入编辑模式 */
  const startEdit = (): void => {
    setEditTitle(title)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  /** 保存标题：空值或未变化则跳过持久化，直接退出编辑态；失败时记录日志并退出编辑态 */
  const saveTitle = async (): Promise<void> => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === title) {
      setEditing(false)
      return
    }
    try {
      await onRename(trimmed)
    } catch (error) {
      console.error('[SessionHeader] 更新标题失败:', error)
    } finally {
      setEditing(false)
    }
  }

  /** 键盘事件 */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="session-header-polished relative z-[51] flex items-center gap-2 px-5 h-[48px]">
      {/* 拖拽层覆盖整行（Windows 避开右上角 WindowControls ~126px），编辑/标题按钮内部已自带 titlebar-no-drag。 */}
      <div className={cn("absolute inset-0 titlebar-drag-region pointer-events-none", isWindows && WINDOW_CONTROLS_INSET_RIGHT)} />
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 titlebar-no-drag">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveTitle}
            className="flex-1 bg-transparent text-sm font-medium border-b border-primary/50 outline-none px-0 py-0.5 min-w-0"
            maxLength={maxLength}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={saveTitle}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startEdit}
            className="titlebar-no-drag p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="编辑标题"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}

      {actions && (
        <div className="flex items-center gap-1 titlebar-no-drag ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错（新文件目前没有被引用，纯新增）

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/tabs/SessionHeader.tsx
git commit -m "feat(ui): add shared SessionHeader component"
```

---

### Task 3: `ChatHeader.tsx` 改为 `SessionHeader` 的薄封装

**Files:**
- Modify: `apps/electron/src/renderer/components/chat/ChatHeader.tsx`（整个文件重写）

- [ ] **Step 1: 重写文件**

```tsx
/**
 * ChatHeader - 对话头部
 *
 * 复用 SessionHeader，右侧插入 Chat 特有的操作：
 * 系统提示词选择器 + 置顶 + 并排模式切换。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { Pin, Columns2 } from 'lucide-react'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { useConversationParallelMode } from '@/hooks/useConversationSettings'
import type { ConversationMeta } from '@luxcoder/shared'
import { SystemPromptSelector } from './SystemPromptSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SessionHeader } from '@/components/tabs/SessionHeader'
import { cn } from '@/lib/utils'

interface ChatHeaderProps {
  conversation: ConversationMeta | null
}

export function ChatHeader({ conversation }: ChatHeaderProps): React.ReactElement | null {
  const setConversations = useSetAtom(conversationsAtom)
  const [parallelMode, setParallelMode] = useConversationParallelMode()

  if (!conversation) return null

  const handleRename = async (title: string): Promise<void> => {
    const updated = await window.electronAPI.updateConversationTitle(conversation.id, title)
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    )
  }

  return (
    <SessionHeader
      title={conversation.title}
      onRename={handleRename}
      actions={
        <>
          <SystemPromptSelector />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', conversation.pinned && 'bg-accent text-accent-foreground')}
                onClick={async () => {
                  const updated = await window.electronAPI.togglePinConversation(conversation.id)
                  setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                }}
              >
                <Pin className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{conversation.pinned ? '取消置顶' : '置顶对话'}</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', parallelMode && 'bg-accent text-accent-foreground')}
                onClick={() => setParallelMode(!parallelMode)}
              >
                <Columns2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{parallelMode ? '关闭并排模式' : '并排模式'}</p></TooltipContent>
          </Tooltip>
        </>
      }
    />
  )
}
```

注意：原文件里手写的 `titlebar-drag-region` div 和 Windows insets 逻辑已经被 `SessionHeader` 内部接管，这里不用再写。原文件 `saveTitle` 里的 try/catch 也不需要在 wrapper 里重写——`SessionHeader.saveTitle` 内部已统一 catch 并保证退出编辑态，`handleRename` 直接 await 即可。

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/chat/ChatHeader.tsx
git commit -m "refactor(ui): ChatHeader uses shared SessionHeader"
```

---

### Task 4: `AgentHeader.tsx` 改为 `SessionHeader` 的薄封装

**Files:**
- Modify: `apps/electron/src/renderer/components/agent/AgentHeader.tsx`（整个文件重写）

- [ ] **Step 1: 重写文件**

```tsx
/**
 * AgentHeader — Agent 会话头部
 *
 * 复用 SessionHeader；重命名时同步更新 Tab 标题和会话列表的新鲜度排序。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { tabsAtom, updateTabTitle } from '@/atoms/tab-atoms'
import { replaceAgentSessionInFreshnessOrder } from '@/lib/agent-session-list'
import { SessionHeader } from '@/components/tabs/SessionHeader'

interface AgentHeaderProps {
  sessionId: string
}

export function AgentHeader({ sessionId }: AgentHeaderProps): React.ReactElement | null {
  const sessions = useAtomValue(agentSessionsAtom)
  const session = sessions.find((s) => s.id === sessionId) ?? null
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setTabs = useSetAtom(tabsAtom)

  if (!session) return null

  const handleRename = async (title: string): Promise<void> => {
    const updated = await window.electronAPI.updateAgentSessionTitle(session.id, title)
    setTabs((prev) => updateTabTitle(prev, updated.id, updated.title))
    setAgentSessions((prev) => replaceAgentSessionInFreshnessOrder(prev, updated))
  }

  return <SessionHeader title={session.title} onRename={handleRename} />
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/agent/AgentHeader.tsx
git commit -m "refactor(ui): AgentHeader uses shared SessionHeader"
```

---

### Task 5: 从 `CodeMainViewSwitcher` 拆出可嵌入的 `CodeMainViewSwitchControl`

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/CodeMainViewSwitcher.tsx`（整个文件重写）

- [ ] **Step 1: 重写文件**

拆成两部分：`CodeMainViewSwitchControl`（纯控件，支持 `compact` 图标态）+ `CodeMainViewSwitcher`（原有整行包装，看板视图自己顶部继续用）。

```tsx
/**
 * CodeMainViewSwitcher / CodeMainViewSwitchControl - Code（agent）模式主区视图切换
 *
 * CodeMainViewSwitchControl 是纯控件（会话｜看板 segmented），两处复用：
 * 1. 左侧栏「最近会话｜项目」行嵌入版（compact，会话视图场景，见 LeftSidebar.tsx）
 * 2. 本文件的 CodeMainViewSwitcher：看板视图自己的顶部整行版
 *    （看板视图下侧栏可能折叠，需要自带切换入口保证能切回，
 *    对应 craft-agents-oss 里 Board 模式下 header 自带一份切换控件的做法）
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { LayoutDashboard, MessageSquare } from 'lucide-react'
import { codeMainViewAtom, workViewAtom } from '@/atoms/project-atoms'
import type { CodeMainView } from '@/atoms/project-atoms'
import { cn } from '@/lib/utils'

interface SwitcherOption {
  id: CodeMainView
  label: string
  icon: React.ReactNode
}

const OPTIONS: SwitcherOption[] = [
  { id: 'session', label: '会话', icon: <MessageSquare size={12} /> },
  { id: 'work', label: '看板', icon: <LayoutDashboard size={12} /> },
]

export interface CodeMainViewSwitchControlProps {
  /** 紧凑态：只显示图标，不显示文字（嵌入侧栏行内时用） */
  compact?: boolean
  className?: string
}

export function CodeMainViewSwitchControl({ compact, className }: CodeMainViewSwitchControlProps): React.ReactElement {
  const [mainView, setMainView] = useAtom(codeMainViewAtom)
  const setWorkView = useSetAtom(workViewAtom)

  const handleSelect = (id: CodeMainView): void => {
    // 切到 Work 时固定先看板，避免停留在上次「项目详情」造成的认知错位
    if (id === 'work') setWorkView('board')
    setMainView(id)
  }

  return (
    <div className={cn('view-switcher-control titlebar-no-drag flex items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5', className)}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mainView === option.id}
          aria-label={option.label}
          title={compact ? option.label : undefined}
          onClick={() => handleSelect(option.id)}
          className={cn(
            'view-switcher-option flex items-center rounded-lg font-medium transition-colors',
            compact ? 'h-6 w-6 justify-center' : 'h-7 gap-1.5 px-3 text-[12px]',
            mainView === option.id
              ? 'view-switcher-option-active bg-background text-foreground'
              : 'text-foreground/50 hover:text-foreground/80',
          )}
        >
          {option.icon}
          {!compact && option.label}
        </button>
      ))}
    </div>
  )
}

/** 看板视图自己顶部的整行版本（会话视图场景改用侧栏内嵌的 CodeMainViewSwitchControl） */
export function CodeMainViewSwitcher(): React.ReactElement {
  return (
    <div className="primary-view-switcher titlebar-drag-region flex h-[34px] flex-shrink-0 items-center px-3.5">
      <CodeMainViewSwitchControl />
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错（`CodeMainViewSwitcher` 对外接口不变，`MainArea.tsx` 里已有的用法不受影响）

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/CodeMainViewSwitcher.tsx
git commit -m "refactor(ui): extract CodeMainViewSwitchControl for sidebar embedding"
```

---

### Task 6: 切换控件挪入左侧栏会话列表区，移除会话视图独立一行（craft 式）

> 修订（2026-07-23）：原方案为嵌入 TabBar 右侧；对照 craft-agents-oss 实际 UI 后改为 craft 式——「列表｜看板」放在会话列表面板标题行。TabBar 完全不动（两模式 TabBar 零差异），避免绝对定位坐标耦合。设计文档第 2 节已同步修订。

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（「最近会话｜项目」行右侧加控件）
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`（会话视图分支移除独立切换行）

- [ ] **Step 1: `LeftSidebar.tsx` 导入新控件**

在文件顶部 import 区新增：

```diff
+import { CodeMainViewSwitchControl } from '@/components/app-shell/CodeMainViewSwitcher'
```

（LeftSidebar 与 CodeMainViewSwitcher 同目录，如果文件里同目录 import 用的是相对路径风格，跟随现状用 `./CodeMainViewSwitcher`。）

- [ ] **Step 2: 「最近会话｜项目」行右侧插入控件**

找到「会话投影切换」行（约 3013-3053 行）：

```tsx
          {/* 会话投影切换：最近会话｜项目（仅切换；新建项目只走顶栏两流） */}
          <div className="px-2 pt-2 pb-1 flex items-center gap-1.5 flex-shrink-0 titlebar-no-drag">
            <div className="flex-1 min-w-0">
              <SidebarSessionViewToggle />
            </div>
            {sidebarSessionViewMode === 'projects' ? (
              <DropdownMenu>
                ...（项目管理 MoreHorizontal 菜单）
              </DropdownMenu>
            ) : null}
          </div>
```

在 `<SidebarSessionViewToggle />` 所在 flex 行内、`sidebarSessionViewMode === 'projects'` 条件块**之前**，插入紧凑版切换控件（该行已在 Code 模式分支内渲染；若该行同时服务 Chat 模式，需要包一层 `mode === 'agent' &&` —— 实现时以实际代码为准）：

```diff
             <div className="flex-1 min-w-0">
               <SidebarSessionViewToggle />
             </div>
+            {/* 会话｜看板：切换主区视图（craft 式，挂在会话列表标题行；看板视图自带切回开关） */}
+            {mode === 'agent' && <CodeMainViewSwitchControl compact />}
             {sidebarSessionViewMode === 'projects' ? (
```

- [ ] **Step 3: `MainArea.tsx` 移除会话视图下的独立切换行**

找到（约第 265-270 行附近）：

```diff
             ) : (
               <>
-                {/* Code 模式会话视图顶部常驻「会话 | 看板」切换条 */}
-                {appMode === 'agent' && <CodeMainViewSwitcher />}
                 <TabBar />
                 {automationFormOpen ? (
```

`CodeMainViewSwitcher` 的 import 保留（`showCodeWorkView` 看板分支里还在用，承担"从看板切回会话"的入口），不要删除 import 语句。`TabBar.tsx` 完全不改。

- [ ] **Step 4: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 5: 手动验证（先做这一步的可视化确认，再继续后面任务）**

Run: `bun run dev`

1. 切到 Code 模式 → 左侧栏「最近会话｜项目」行右侧出现紧凑的「会话｜看板」图标开关；主区 TabBar 上方不再有独立整行切换条
2. 点击"看板"图标 → 主区切到 WorkBoardView，其顶部保留整行 `CodeMainViewSwitcher`（文字版），点"会话"可切回
3. 侧栏「最近会话｜项目」在两种投影下（含项目模式的 MoreHorizontal 菜单同时出现时）行内布局不挤压、不换行
4. Chat 模式下侧栏不出现该开关；Chat/Code 切换时主区 TabBar 起始位置不再跳动
5. 折叠侧栏 → 该开关随侧栏隐藏（已知代价，看板视图自带切回开关兜底）

如果第 3 步发现布局挤压，调整该行 gap 或给控件加 `shrink-0`，不要留到后面任务。

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx apps/electron/src/renderer/components/tabs/MainArea.tsx
git commit -m "feat(ui): move code main view switch into sidebar session list header"
```

---

### Task 7: Mode 切换器顺序对调 —— 已取消

> 取消（2026-07-23）：用户确定后续 Chat/Code 全面对标 Claude Desktop，而 Claude 的切换是 Home(Chat) 左、Code 右。保持 `ModeSwitcher.tsx` 现状（Chat 左），不做任何改动。

---

### Task 8: 折叠态侧栏图标顺序对调（Chat 在上）

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx:2496-2532`

Task 7 取消后，展开态保持 Chat 左；折叠态目前 Agent/Code 图标在上、Chat 在下，纵向顺序与展开态相反，需要交换。

- [ ] **Step 1: 交换两个按钮块的先后顺序**

「模式切换」区域内（`{/* 模式切换 */}` 注释下的 `flex flex-col` 容器），把 Chat 的 `Tooltip` 块整体移到 `CollapsedWorkspacePopover`（Agent 按钮）块前面，两个块内部代码原样保留，不改任何 className / handler：

```tsx
        {/* 模式切换 */}
        <div className="flex flex-col items-center gap-1.5">
          <Tooltip>
            {/* …Chat 按钮块（原样搬移）… */}
          </Tooltip>

          <CollapsedWorkspacePopover>
            {/* …Agent/Code 按钮块（原样搬移）… */}
          </CollapsedWorkspacePopover>
        </div>
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx
git commit -m "feat(ui): collapsed rail puts Chat icon above Code, matching expanded order"
```

---

### Task 9: 最终类型检查 + 完整手动验收

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 通过，无报错

- [ ] **Step 2: 按设计文档验证清单逐条过一遍**

Run: `bun run dev`

- [ ] Chat 模式：TabBar + SessionHeader 两行高度、背景、hairline 与 Code 模式一致（都应该能看到 TabBar 和标题行之间有清晰的一道分界线）
- [ ] Code 模式会话视图：左侧栏「最近会话｜项目」行右侧出现「会话｜看板」小开关，切换到看板后主区正确切到 `WorkBoardView`；主区 TabBar 上方无独立切换行
- [ ] Chat ⇄ Code 来回切换：TabBar 起始位置不跳动
- [ ] 顶部 Chat/Code 胶囊按钮：保持 Chat 左、Code 右（对标 Claude，Task 7 已取消）；折叠侧边栏时图标顺序一致（Chat 在上、Code 在下）
- [ ] Chat 会话重命名（点 pencil 图标改标题）功能正常，标题栏和侧边栏同步更新
- [ ] Agent 会话重命名功能正常，Tab 标题和侧边栏同步更新
- [ ] Chat 模式下 `SystemPromptSelector` / 置顶 / 并排模式按钮仍然正常工作

- [ ] **Step 3: 若发现问题，回到对应任务修复并重新提交**

不要在这一步引入新功能或顺手改动范围外的代码，只修复本次改动引入的问题。
