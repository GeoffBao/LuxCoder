# Claude Desktop 侧栏 / IA 对标参考

> 状态：参考资料（非实施 spec）。2026-07-23 由用户提供 Claude Desktop 实际截图整理。
> 用途：后续 Chat / Code 模式全面对标 Claude 的起点。用户已明确：Chat 与 Code 模式后续都对标 Claude；Claude 的 Cowork 模式暂不对标（"后面再说"）。

## 截图来源观察（Claude Desktop macOS，2026-07）

### 1. 顶部模式切换

- 侧栏顶部是 `Home | Code` 胶囊 segmented 切换，**Home 在左、Code 在右**。
- 位置与 LuxCoder 的 `ModeSwitcher` 一致（侧栏顶部），验证了现有布局选型。
- **Home 即 Chat**：没有独立的"Chat 模式"入口，Home 的默认动作就是发起对话。Claude 没有把"聊天"当作一个并列模式，而是当作主页。
- 由此决策：LuxCoder 保持 Chat 左、Code 右（原"Code 放左"指令撤销，见 session-header-tabbar-unification 设计文档第 3 节修订）。

### 2. 两模式共用同一套侧栏骨架（最核心）

Home 和 Code 的侧栏**结构完全相同**，只是内容集合不同：

```
[Home | Code 切换]
New                    ← 主操作，永远第一位
Projects
Artifacts
Scheduled
Dispatch (Beta)
Customize
More ▾                 ← 非核心项收纳
――――――――
Dispatch               ← 运行中任务区（有活跃任务时出现）
Pinned                 ← 置顶会话
Recents  [排序按钮]     ← 最近会话
――――――――
Design (Labs) / 账号
```

切模式变的是内容，不是层级结构、行高或分区方式。这与 LuxCoder 本次"消灭两模式顶部 chrome 不对称"的方向一致，但 Claude 把对称贯彻到了整个侧栏。

对照 LuxCoder 现状的差距：Code 侧栏有 工作区切换器 / 新会话+新任务 / 搜索 / 自动任务 / Agent 技能 / Agent 专家 / 置顶 / 最近会话｜项目，Chat 侧栏只有 新对话 / 搜索 / 自动任务 / 对话列表——结构和密度都不同。对标方向是让两边共享同一套骨架组件。

### 3. 侧栏可定制（Customize sidebar）

- 一级导航项用户可勾选显隐（弹窗里勾选 Artifacts / Routines / Dispatch / Customize）。
- 未勾选项收进 `More ▾`。侧栏保持极简，功能增长不导致侧栏膨胀。
- LuxCoder 启示：自动任务 / Agent 技能 / Agent 专家 三行常驻可改为可定制 + More 收纳。

### 4. Skills / Connectors / Plugins 归入 Settings

- Settings 弹窗左栏分组：Settings（General/Account/Privacy/Billing/Usage/Capabilities/Claude Code/Cowork/Claude in Chrome）、Desktop app（General/Extensions/Developer）、**Customize（Skills / Connectors / Plugins）**。
- Skills 是表格视图（名称 / Last updated / Author），带 All|Personal|Organization 过滤、Browse、Add。
- 对照：LuxCoder 的 Agent 技能 / Agent 专家目前是侧栏一级入口 + 全屏视图。Claude 把"管理能力"归到设置，侧栏只留"使用会话"的入口。

### 5. 会话列表细节

- `Pinned` 与 `Recents` 分区；Recents 标题行右侧有排序/筛选小图标（与 craft 的 filter 位、LuxCoder 的 MoreHorizontal 位同构——"列表标题行右侧放列表级操作"是三家共识）。
- 列表项左侧有状态点：蓝点 = 后台运行中，空心 = 已完成/静止。后台任务状态直接呈现在会话列表上，不需要单独的"任务中心"。
- 会话不分"Chat 会话"和"Code 会话"两个列表体系——Home 的 Recents 里能看到代码类会话（点击会带模式跳转）。

### 6. 新会话 composer（Home）

- 输入框内部有 `Chat | Cowork` 切换（会话类型是**输入框级别**的选择，不是全局模式）、模型+effort 选择器（"Sonnet 5 High"）、语音输入。
- 输入框下方附加行：`Project or folder` 关联选择 + Skip。发起会话时就近选择项目上下文，与 LuxCoder 的「选择项目」下拉同思路。
- "Ideas for you" 建议卡片（daily briefing / organize inbox / customize）。

## 对 LuxCoder 的启示（按优先级）

1. **统一侧栏骨架**（大工程，后续独立立项）：Chat/Code 共享同一套导航组件树，模式只切换内容源。这是"对标 Claude"的主体工作。
2. **导航可定制 + More 收纳**：把 自动任务/Agent 技能/Agent 专家 改为可配置项，默认收进 More，侧栏一级只留 New/Projects/置顶/最近。
3. **能力管理归设置**：Agent 技能/专家的管理界面迁入设置面板 Customize 分组，侧栏入口降级或移除。
4. **会话列表状态点**：把 Agent 运行状态（running/completed 未读）以状态点形式统一到 Chat/Code 两边的列表项上（LuxCoder 已有 `SessionIndicatorStatus`，是数据就绪的）。
5. **会话类型输入框化**（远期，涉及 IA 根本调整）：Claude 的 Chat|Cowork 在输入框里选，意味着"模式"未必要是全局状态。LuxCoder 的 Chat/Code 若对标到这一层，`appModeAtom` 的全局模式设计需要重新评估——放到 Cowork 对标阶段一起考虑。

## 明确不做（当前）

- Cowork 模式对标（用户明确"后面再说"）。
- 本参考文档不指导当前 session-header-tabbar-unification 分支的任何实现，该分支按其自身 spec 收尾。
