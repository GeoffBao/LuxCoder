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
- 「会话｜看板」切换从独立整行改为左侧栏会话列表标题行内的小控件（craft 式），不占用主区额外一行。
- 展开态 Mode 切换器保持 Chat 左（对标 Claude Desktop）；折叠态图标栏顺序与展开态对齐（Chat 在上）。

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

### 2. 「会话｜看板」切换挪入左侧栏会话列表区（craft 式）

> 修订（2026-07-23）：最初方案是把开关嵌入 TabBar 右侧；用户对照 craft-agents-oss 实际截图后指出其「列表｜看板」放在**会话列表面板的标题行**（"所有会话 [列表|看板] [filter]"），语义上更合理——这个开关切换的是"如何浏览会话集合"，操作对象是会话列表而非当前 Tab。采纳该方案，TabBar 完全不动，两模式 TabBar 达成零差异（连条件渲染都不需要），也避免了 TabBar 内绝对定位坐标耦合。

`CodeMainViewSwitcher` 现有内部实现（小 segmented 控件）本身形态是对的，问题只在**渲染位置** —— 现在是 `MainArea.tsx` 里 TabBar 之上的独立一行。改法：

- `MainArea.tsx` 会话视图分支去掉 `{appMode === 'agent' && <CodeMainViewSwitcher />}` 这一整行独立渲染。
- 拆出纯控件 `CodeMainViewSwitchControl`（支持 `compact` 图标态），放进 `LeftSidebar.tsx` 的「最近会话｜项目」切换行（`SidebarSessionViewToggle` 所在行，约 3013-3053 行）右侧——该行右侧本来就有一个按需出现的操作位（项目模式下的 `MoreHorizontal` 菜单），结构与 craft 的"所有会话 [列表|看板] [filter]"同构。
- 看板视图自己顶部的整行版 `CodeMainViewSwitcher`（`MainArea.tsx` 的 `showCodeWorkView` 分支）保留，承担"从看板切回会话"的入口——对应 craft 里 Board 模式下 navigator 收起、由 Board 自带开关切回的做法。

效果：TabBar 两模式完全一致（无任何条件渲染）；会话/看板切换语义归位到会话列表；侧栏折叠时看不到入口是已知代价（craft 同样如此），看板视图自带开关保证不会被困住。已归档视图（`viewMode === 'archived'`）下该行不渲染，切看板需先返回活跃会话——语义上开关操作的就是活跃会话集合，接受这一路径变长。切换时同步 `setActiveView('conversations')`，避免覆盖视图（技能/专家/自动任务）下点击无可见效果。

看板视图激活后主区不渲染 TabBar + SessionHeader（现状行为，`showCodeWorkView` 分支整体替换主区），本次不改。

### 3. Mode 切换器顺序（修订：保持 Chat 左，对标 Claude Desktop）

> 修订（2026-07-23）：最初用户要求 Code 放左边；后用户提供 Claude Desktop 截图并确定后续 Chat/Code 模式全面对标 Claude——Claude 的顶部切换是 Home(Chat) 左、Code 右。为避免后续对标时改回来，**取消展开态顺序对调，保持现状 Chat 左、Code 右**。

连锁变化：折叠态侧栏图标目前是 Agent/Code 在上、Chat 在下（纵向阅读顺序对应展开态的"Code 左"），与保留的展开态"Chat 左"相反。因此改为**交换折叠态两个图标按钮的上下顺序**（`LeftSidebar.tsx` 里 `handleRailModeSwitch` 对应的两个圆形按钮，约 2496-2532 行），Chat 在上、Code 在下，与展开态一致。`ModeSwitcher.tsx` 不动。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/electron/src/renderer/components/tabs/SessionHeader.tsx` | 新增，从 ChatHeader/AgentHeader 抽取的共享组件 |
| `apps/electron/src/renderer/components/chat/ChatHeader.tsx` | 收窄为 SessionHeader 的薄封装 |
| `apps/electron/src/renderer/components/agent/AgentHeader.tsx` | 收窄为 SessionHeader 的薄封装 |
| `apps/electron/src/renderer/components/tabs/MainArea.tsx` | 会话视图分支移除独立渲染的 `CodeMainViewSwitcher` 行（看板分支保留） |
| `apps/electron/src/renderer/components/app-shell/CodeMainViewSwitcher.tsx` | 拆出纯控件 `CodeMainViewSwitchControl`（支持 compact 图标态），整行版保留给看板视图 |
| `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` | 「最近会话｜项目」行右侧加入 `CodeMainViewSwitchControl`（compact）；折叠态图标栏 Chat/Code 顺序对调 |
| `apps/electron/src/renderer/styles/globals.css` | `agent-header-polished` 改名/复用为通用 class，供 `SessionHeader` 统一引用 |

## 验证计划

- 类型检查：`bun run typecheck`
- 手动过一遍（`bun run dev`）：
  - Chat 模式：TabBar + SessionHeader 两行高度、背景、hairline 与 Code 模式一致
  - Code 模式会话视图：左侧栏「最近会话｜项目」行右侧出现「会话｜看板」小开关，切换到看板后主区正确切到 `WorkBoardView`；主区无独立切换行
  - Chat ⇄ Code 来回切换：TabBar 起始位置不跳动
  - 顶部 Chat/Code 胶囊按钮：保持 Chat 左、Code 右；折叠侧边栏时图标顺序一致（Chat 在上、Code 在下）
  - 会话标题重命名（Chat 和 Agent 两种会话）功能不受影响
