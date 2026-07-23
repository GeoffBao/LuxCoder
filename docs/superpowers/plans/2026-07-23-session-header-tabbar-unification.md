# Chat / Code 顶部结构统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消灭 Chat / Code 两模式下顶部 chrome（TabBar + 会话标题行）的行数/样式不对称，统一为共享组件。

**Architecture:** 把 `ChatHeader.tsx` / `AgentHeader.tsx` 里重复的标题编辑逻辑抽成共享的 `SessionHeader.tsx`；把独占一整行的「会话｜看板」切换条拆出一个可复用的 `CodeMainViewSwitchControl`，嵌入 `TabBar.tsx` 右侧（会话视图场景），原有整行版本继续用于看板视图自己的顶部（该场景下没有 TabBar 可嵌入，等同 craft-agents-oss 里 Board 模式下 header 自带一份切换控件的做法）；最后把 Chat/Code 模式切换器的左右顺序对调。

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
 * 1. TabBar 右侧嵌入版（compact，会话视图场景，见 TabBar.tsx）
 * 2. 本文件的 CodeMainViewSwitcher：看板视图自己的顶部整行版
 *    （看板视图下没有 TabBar 可嵌入，需要独立一行承载切换入口，
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
  /** 紧凑态：只显示图标，不显示文字（嵌入 TabBar 时用） */
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

/** 看板视图自己顶部的整行版本（会话视图场景改用嵌入 TabBar 的 CodeMainViewSwitchControl） */
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
git commit -m "refactor(ui): extract CodeMainViewSwitchControl for TabBar embedding"
```

---

### Task 6: 会话视图下把切换条嵌入 `TabBar`，移除独立一行

**Files:**
- Modify: `apps/electron/src/renderer/components/tabs/TabBar.tsx`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`

- [ ] **Step 1: `TabBar.tsx` 导入新控件**

在文件顶部 import 区（现有 `import { TabBarItem } from './TabBarItem'` 附近）新增：

```diff
+import { CodeMainViewSwitchControl } from '@/components/app-shell/CodeMainViewSwitcher'
```

- [ ] **Step 2: `TabBar`（外层导出组件）把 `appMode` 传给 `TabBarInner`**

`TabBar` 函数里已经有 `const appMode = useAtomValue(appModeAtom)`（用于 `handleActivate` 里判断 tab 类型），把它一并传给 `TabBarInner`：

```diff
       <TabBarInner
         tabs={tabs}
         activeTabId={activeTabId}
         streamingMap={indicatorMap}
         workspaceNameBySessionId={workspaceNameBySessionId}
         automationSessionIds={automationSessionIds}
         delegationSessionIds={delegationSessionIds}
+        appMode={appMode}
         onActivate={handleActivate}
         onClose={requestClose}
         onDragStart={handleDragStart}
         onTearOff={handleTearOff}
       />
```

- [ ] **Step 3: `TabBarInner` 接收 `appMode` 并渲染切换控件**

先在 import 区加上类型导入：

```diff
+import type { AppMode } from '@/atoms/app-mode'
```

在 `TabBarInner` 的 props 类型里加一行：

```diff
 function TabBarInner({
   tabs,
   activeTabId,
   streamingMap,
   workspaceNameBySessionId,
   automationSessionIds,
   delegationSessionIds,
+  appMode,
   onActivate,
   onClose,
   onDragStart,
   onTearOff,
 }: {
   tabs: TabItem[]
   activeTabId: string | null
   streamingMap: Map<string, SessionIndicatorStatus>
   workspaceNameBySessionId: Map<string, string>
   automationSessionIds: Set<string>
   delegationSessionIds: Set<string>
+  appMode: AppMode
   onActivate: (tabId: string) => void
   onClose: (tabId: string) => void
   onDragStart: (tabId: string, e: React.PointerEvent) => void
   onTearOff: (tabId: string) => void
 }): React.ReactElement {
```

在 `showOpenPanelButton` 定义下面新增一个派生值：

```diff
   const [isPanelOpen, setSidePanelOpen] = useAtom(agentSidePanelOpenAtom)
   const activeTab = React.useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId])
   const showOpenPanelButton = !isPanelOpen && activeTab?.type === 'agent'
+  // 会话｜看板切换：仅 Code 模式下出现（看板视图激活时 TabBar 整体不渲染，见 MainArea.tsx）
+  const showCodeViewSwitch = appMode === 'agent'
```

滚动区的右侧留白逻辑要把新控件的宽度也算进去（原本只在 `showOpenPanelButton` 时留 `pr-10`）：

```diff
       <div
         ref={scrollRef}
         className={cn(
           "relative flex items-end flex-1 min-w-0 overflow-x-auto scrollbar-none",
           // Windows 始终避开 WindowControls（~126px）；非 Windows 打开按钮时给 scroll 预留空间
           isWindows && WINDOW_CONTROLS_PADDING_RIGHT,
-          !isWindows && showOpenPanelButton && "pr-10",
+          !isWindows && (showOpenPanelButton || showCodeViewSwitch) && "pr-16",
         )}
       >
```

在 `showOpenPanelButton && <AgentPanelOpenButton .../>` 之前插入新控件，用跟 `AgentPanelOpenButton` 同款的坐标方案（同一处注释里已经说明这块是"手动坐标耦合"，这里保持一致，只是把 `right-1` 换成 `right-9` 让出 `AgentPanelOpenButton` 的位置）：

```diff
+      {/* 会话｜看板切换：与 AgentPanelOpenButton 同款绝对定位方案，右移让出它的位置。
+          Windows 上同样避开 WindowControls，溢出到 TabBar 下方。 */}
+      {showCodeViewSwitch && (
+        <div
+          className={cn(
+            "absolute flex titlebar-no-drag",
+            isWindows
+              ? "top-[37px] right-9 h-7 z-[52]"
+              : "inset-y-0 right-9 items-end pb-[3px] z-10",
+          )}
+        >
+          <CodeMainViewSwitchControl compact />
+        </div>
+      )}
       {showOpenPanelButton && (
         <AgentPanelOpenButton isWindows={isWindows} onToggle={togglePanel} />
       )}
```

- [ ] **Step 4: `MainArea.tsx` 移除会话视图下的独立切换行**

找到（约第 265-270 行附近）：

```diff
             ) : (
               <>
-                {/* Code 模式会话视图顶部常驻「会话 | 看板」切换条 */}
-                {appMode === 'agent' && <CodeMainViewSwitcher />}
                 <TabBar />
                 {automationFormOpen ? (
```

`CodeMainViewSwitcher` 的 import 保留（`showCodeWorkView` 分支里还在用），不要删除 import 语句。

- [ ] **Step 5: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 6: 手动验证（先做这一步的可视化确认，再继续后面任务）**

Run: `bun run dev`

1. 切到 Code 模式，打开任意会话 → TabBar 右侧应出现一个紧凑的「会话｜看板」图标切换按钮，不再有独立的整行切换条
2. 点击"看板"图标 → 主区切到 WorkBoardView，顶部出现原来的整行 `CodeMainViewSwitcher`（文字版），可以点"会话"切回去
3. 右侧文件面板打开时（`showOpenPanelButton` 为 false），确认新按钮没有跟已隐藏的面板按钮重叠、也没有跟最后一个 Tab 的关闭按钮重叠
4. Chat 模式下 TabBar 右侧不出现这个切换按钮

如果第 3 步发现重叠或间距不对，在这一步直接调整 `right-9` / `pr-16` 的数值，不要留到后面任务。

- [ ] **Step 7: Commit**

```bash
git add apps/electron/src/renderer/components/tabs/TabBar.tsx apps/electron/src/renderer/components/tabs/MainArea.tsx
git commit -m "feat(ui): embed code main view switch into TabBar, remove standalone row"
```

---

### Task 7: Mode 切换器（展开态胶囊按钮）顺序对调

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx:24-27`

- [ ] **Step 1: 调整 `modes` 数组顺序**

```diff
 const modes: { value: 'chat' | 'agent'; label: string; icon: React.ReactNode }[] = [
-  { value: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
   { value: 'agent', label: 'Code', icon: <Code2 size={15} /> },
+  { value: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
 ]
```

`modeIndex` / `SLIDER_TRANSLATE` 都是按数组下标算的，不用改任何其他代码，滑动指示器会自动跟着换位。

- [ ] **Step 2: 类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 无报错

- [ ] **Step 3: 手动验证**

Run: `bun run dev`（如果 Task 6 已经在跑，刷新即可）

确认展开态侧边栏顶部胶囊按钮顺序是 `</> Code | Chat`（Code 在左），点击切换、滑动背景指示器位置正确。

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx
git commit -m "feat(ui): swap Code/Chat mode switcher order, Code first"
```

---

### Task 8: 核对折叠态侧边栏图标顺序（预期无需改动）

**Files:** 无（核对任务）

折叠侧边栏是纵向图标栏，没有"左右"只有"上下"，纵向阅读顺序里"上"对应展开态的"左"。当前代码（`LeftSidebar.tsx:2496-2532`）里 Agent/Code 按钮在上、Chat 按钮在下，跟 Task 7 改完后展开态"Code 在左、Chat 在右"的语义已经一致，**不需要修改这个文件**。这一步只是手动核对，避免漏看。

- [ ] **Step 1: 手动核对**

Run: `bun run dev`，折叠侧边栏（点击折叠按钮或 `⌘B`），确认从上到下依次是 Code 图标、Chat 图标，与展开态从左到右 Code、Chat 顺序一致。若发现实际顺序相反，再回头交换 `LeftSidebar.tsx:2496-2532` 里 `CollapsedWorkspacePopover`（Agent 按钮）和 `Tooltip`（Chat 按钮）两个块的先后位置。

---

### Task 9: 最终类型检查 + 完整手动验收

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型检查**

Run: `cd apps/electron && bun run typecheck`
Expected: 通过，无报错

- [ ] **Step 2: 按设计文档验证清单逐条过一遍**

Run: `bun run dev`

- [ ] Chat 模式：TabBar + SessionHeader 两行高度、背景、hairline 与 Code 模式一致（都应该能看到 TabBar 和标题行之间有清晰的一道分界线）
- [ ] Code 模式会话视图：TabBar 右侧出现「会话｜看板」小开关，切换到看板后主区正确切到 `WorkBoardView`，chrome 行数不变
- [ ] Chat ⇄ Code 来回切换：TabBar 起始位置不跳动
- [ ] 顶部 Chat/Code 胶囊按钮：Code 在左、Chat 在右，滑动指示器位置正确；折叠侧边栏时图标顺序一致（Code 在上、Chat 在下）
- [ ] Chat 会话重命名（点 pencil 图标改标题）功能正常，标题栏和侧边栏同步更新
- [ ] Agent 会话重命名功能正常，Tab 标题和侧边栏同步更新
- [ ] Chat 模式下 `SystemPromptSelector` / 置顶 / 并排模式按钮仍然正常工作

- [ ] **Step 3: 若发现问题，回到对应任务修复并重新提交**

不要在这一步引入新功能或顺手改动范围外的代码，只修复本次改动引入的问题。
