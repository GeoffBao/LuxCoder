# Chat / Code 顶部结构统一设计

## 背景

Chat 模式和 Code（Agent）模式切换时，主区顶部的层数和位置会跳动，体验不一致（用户截图反馈）。追查后定位到两个根因：

1. **`ChatHeader.tsx` / `AgentHeader.tsx` 是两份几乎复制粘贴出来的组件**（标题编辑、pencil 图标、键盘处理逻辑重复）。2026-07-22 的 `fcd148b0 feat(ui): polish modern workbench visuals` 提交给 `AgentHeader` 加了 `agent-header-polished`（纯色背景 + 底部 1px hairline，视觉上把它和上方 `TabBar` 分层)，但没有同步给 `ChatHeader`，导致 Chat 模式下 TabBar 和标题行没有可见分界，看起来像"少了一行"。
2. **`CodeMainViewSwitcher`（「会话｜看板」切换条）是独立一整行**，只在 `appMode === 'agent'` 时渲染在 `TabBar` 上方（[MainArea.tsx:268](../../apps/electron/src/renderer/components/tabs/MainArea.tsx)）。切换 Chat ⇄ Code 时，主区顶部因此从 2 行变 3 行，TabBar/Header 的起始 y 坐标跟着跳动。

参考了两个项目的做法：

- **craft-agents-oss**：所有面板统一复用同一个 `PanelHeader` 组件（标题 + 可选 titleMenu + actions 插槽），永远只有"全局 TopBar + 内容 PanelHeader"两层，不存在按内容类型分叉出不同渲染路径的可能。List⇄Board 视图切换（`BoardListToggle`）不是独立一行，而是塞进已有 header 行的 `actions` 插槽里的一个小 segmented 控件；Board 视图激活时侧边栏隐藏，切换按钮改放到 Board 自己的单行 header 里 —— 视图变了，但 header 永远只占 1 行。
- **Proma（上游项目）**：`ChatHeader`/`AgentHeader`/`TabBar` 的重复结构是从这里继承来的，说明这不是 LuxCoder 自己引入的问题，但也证明了不解决"两份重复代码"这件事，以后还会因为"改了一处忘了另一处"再犯。

## 目标

- Chat / Code 两模式下，主区顶部的**行数、高度、位置永远一致**（固定 TabBar + SessionHeader 两行），不因模式切换或视图切换（会话/看板）而跳动。
- 消灭 `ChatHeader`/`AgentHeader` 重复代码，改为同一个组件的两种用法，防止未来的视觉改动再次单边生效。
- 「会话｜看板」切换从独立整行改为嵌入 TabBar 行内的小控件，不占用额外一行。
- Mode 切换器（Chat/Code 胶囊按钮）左右顺序对调：Code 在左，Chat 在右。

## 非目标

- 不改变 TabBar 本身"草稿 + 当前会话"只保留 2 个入口（不做真正的多标签浏览器）这一现有交互模型 —— 这是本次讨论中方案 A（合并 header）而非方案 C（去掉 Tab 条）的延伸，更彻底的 IA 调整留作后续独立项。
- 不改动 `WorkBoardView` 内部（看板列、卡片、项目详情）的任何交互，只改它上方的入口。
- 不给 `AgentHeader` 补齐 `ChatHeader` 独有的 `SystemPromptSelector`/置顶/并排模式按钮 —— 这些是 Chat 特有能力，`SessionHeader` 只需支持"两边各自传入不同 actions"，不要求功能对齐。

## 设计

### 1. 抽取共享 `SessionHeader` 组件

新增 `apps/electron/src/renderer/components/tabs/SessionHeader.tsx`，把 `ChatHeader.tsx` 和 `AgentHeader.tsx` 里几乎相同的"标题 + 编辑态 + pencil/check/x + 拖拽层"逻辑收进来：

```tsx
interface SessionHeaderProps {
  title: string
  /** 保存新标题；沿用现有"trim 为空或未变化则不保存"语义 */
  onRename: (newTitle: string) => Promise<void> | void
  /** 右侧操作区，Chat/Agent 各自传入不同按钮组；不传则不渲染 */
  actions?: React.ReactNode
  /** 编辑态输入框的 maxLength，默认 100，两边现状一致 */
  maxLength?: number
}
```

内部固定使用统一的 `session-header-polished` class（从 `agent-header-polished` 改名 / 复用同一份 CSS 规则，`background: hsl(var(--content-area))` + `box-shadow: 0 1px 0 var(--ink-line)`）、固定 `px-5 h-[48px]`，Windows 拖拽区适配逻辑保持不变。

`ChatHeader.tsx` 收窄为：

```tsx
export function ChatHeader({ conversation }: ChatHeaderProps) {
  if (!conversation) return null
  return (
    <SessionHeader
      title={conversation.title}
      onRename={async (title) => {
        const updated = await window.electronAPI.updateConversationTitle(conversation.id, title)
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      }}
      actions={
        <>
          <SystemPromptSelector />
          <PinToggleButton conversation={conversation} />
          <ParallelModeButton />
        </>
      }
    />
  )
}
```

`AgentHeader.tsx` 收窄为同样结构，`onRename` 调 `updateAgentSessionTitle` + 同步 `tabsAtom`/`agentSessionsAtom`，`actions` 留空（现状本就没有）。

两个文件都从 ~120 行降到 ~30 行，且样式/交互只有一份实现，未来的视觉改动天然两边同步。

### 2. 「会话｜看板」切换嵌入 TabBar 行内

`CodeMainViewSwitcher` 现有内部实现（34px 高的小 segmented 控件）本身形态就是对的，问题只在**渲染位置** —— 现在是 `MainArea.tsx` 里 TabBar 之上的独立一行。改法：

- `MainArea.tsx` 去掉 `{appMode === 'agent' && <CodeMainViewSwitcher />}` 这一整行独立渲染。
- `TabBar.tsx` 的 `TabBarInner` 里，在已有的 `AgentPanelOpenButton`（"打开文件面板"按钮，同样是"仅 Agent 模式下出现的右侧小控件"）旁边，新增一个条件渲染的 `CodeMainViewSwitcherCompact`（复用 `CodeMainViewSwitcher` 的选项数据和逻辑，去掉外层 `h-[34px] px-3.5` 这层"整行"包装，改成 TabBar 内部 flex 子项，跟 tabs 滚动区并排、`shrink-0`，垂直方向用 `items-end`/`self-center` 对齐现有 34px 行高）。
- 两个右侧控件（会话/看板切换、文件面板按钮）在 TabBar 里左右排布共存，宽度不够时先收起文件面板按钮的 tooltip 文案，不改变 TabBar 整体高度。

效果：TabBar 永远是同一行、同一高度，Code 模式下多了个右侧小开关，Chat 模式下这个位置就是空的 —— 不是"多一行"，是"同一行多一个可选控件"，与 craft-agents-oss 的 `BoardListToggle` 做法一致。

看板视图激活后，`SessionHeader` 这一行如何呈现（复用会话标题位置显示"看板"标题 + 是否需要 actions）不在本次范围内单独设计，沿用 `WorkBoardView` 现状（`CodeMainViewSwitcher` 挪位置后，看板视图本身的 UI 不变，只是它上方多了两行固定 chrome：TabBar + 一个不显示具体会话标题的 SessionHeader-like 占位，或者直接不显示 SessionHeader —— 实现时按 `codeMainView === 'work'` 判断跳过 SessionHeader 渲染，因为看板视图没有"当前会话标题"这个概念，这与现状行为一致，只是消除了原来"会话/看板"整行）。

### 3. Mode 切换器顺序对调

`ModeSwitcher.tsx` 里的 `modes` 数组：

```diff
- const modes = [
-   { value: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
-   { value: 'agent', label: 'Code', icon: <Code2 size={15} /> },
- ]
+ const modes = [
+   { value: 'agent', label: 'Code', icon: <Code2 size={15} /> },
+   { value: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
+ ]
```

`modeIndex`/`SLIDER_TRANSLATE` 都是按数组下标算的，滑动指示器自动跟着换位，不需要额外改动。左侧折叠态的图标栏（`LeftSidebar.tsx` 里 `handleRailModeSwitch` 对应的两个圆形按钮，约 2495-2530 行）也顺带把 Agent/Code 按钮换到 Chat 按钮上方，保持展开/折叠两种状态下顺序一致。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/electron/src/renderer/components/tabs/SessionHeader.tsx` | 新增，从 ChatHeader/AgentHeader 抽取的共享组件 |
| `apps/electron/src/renderer/components/chat/ChatHeader.tsx` | 收窄为 SessionHeader 的薄封装 |
| `apps/electron/src/renderer/components/agent/AgentHeader.tsx` | 收窄为 SessionHeader 的薄封装 |
| `apps/electron/src/renderer/components/tabs/TabBar.tsx` | 新增右侧「会话｜看板」小开关，与现有文件面板按钮共存 |
| `apps/electron/src/renderer/components/tabs/MainArea.tsx` | 移除独立渲染的 `CodeMainViewSwitcher` 行 |
| `apps/electron/src/renderer/components/app-shell/CodeMainViewSwitcher.tsx` | 去掉外层整行包装，改造成可嵌入 TabBar 的紧凑版本（或拆出 `CodeMainViewSwitcherCompact`） |
| `apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx` | `modes` 数组顺序对调 |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | 折叠态图标栏顺序对调，与展开态一致 |
| `apps/electron/src/renderer/styles/globals.css` | `agent-header-polished` 改名/复用为通用 class，供 `SessionHeader` 统一引用 |

## 验证计划

- 类型检查：`bun run typecheck`
- 手动过一遍（`bun run dev`）：
  - Chat 模式：TabBar + SessionHeader 两行高度、背景、hairline 与 Code 模式一致
  - Code 模式会话视图：TabBar 右侧出现「会话｜看板」小开关，切换到看板后主区正确切到 `WorkBoardView`，chrome 行数不变
  - Chat ⇄ Code 来回切换：TabBar 起始位置不跳动
  - 顶部 Chat/Code 胶囊按钮：Code 在左、Chat 在右，滑动指示器位置正确；折叠侧边栏时图标顺序一致
  - 会话标题重命名（Chat 和 Agent 两种会话）功能不受影响
