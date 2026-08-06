---
name: excalidraw-diagram
description: "生成 Excalidraw 图表，以手写视觉风格（fontFamily: 5）的可编辑文件保存到磁盘。仅当用户明确要求 Excalidraw、Excalidraw 文件、或要在聊天之外保存/打开的可编辑图表产物时使用。不要用于'可视化一下'、'visualize it' 等通用内联请求或截图式 UI 摘要；此类场景请优先使用应用内置的 visual-preview 或 Mermaid 渲染。"
group: 可视化图表
version: 1.0.1
---

# Excalidraw Diagram Generator

从文本内容生成 Excalidraw 图表，支持多种输出格式。**所有图表自动保存到 `~/Documents/Excalidraw`**。

## 何时不使用此技能

- 不要将此技能用于通用内联请求，如 `visualize it`、`show this visually`、"可视化一下" 或截图式答案卡片
- 不要仅仅因为用户想在聊天中获得"一张图表"就使用此技能
- 对于截图/UI 风格的内联视觉内容，优先使用应用内置的 `visual-preview`
- 对于可以保留在聊天中的关系、流程与架构图，优先使用内置的 Mermaid 渲染
- 如果目标 UI/主题是深琥珀色 / 终端风格，请避免使用粉彩粉或淡紫填充。改用深色面板 + 高对比琥珀色、米白或哑光金色文字。
- **仅当用户明确想要 Excalidraw 或将可编辑文件保存到磁盘时**，才使用此技能

## Output Modes

根据用户的触发词选择输出模式：

| 触发词 | 输出模式 | 文件格式 | 用途 |
|--------|----------|----------|------|
| `Excalidraw`、`Excalidraw file`、`Obsidian Excalidraw` | **Obsidian**（默认） | `.md` | 在 Obsidian 中直接打开 |
| `标准Excalidraw`、`standard excalidraw` | **Standard** | `.excalidraw` | 在 excalidraw.com 打开/编辑/分享 |
| `Excalidraw动画`、`动画图`、`animate` | **Animated** | `.excalidraw` | 拖到 excalidraw-animate 生成动画 |

## 工作流程

1. **检测输出模式** — 根据触发词判断（见上方"输出模式"表）
2. 分析内容 — 识别概念、关系与层级
3. 选择图表类型（见下方"图表类型"）
4. 生成 Excalidraw JSON（Animated 模式需添加动画顺序）
5. 根据模式以正确格式输出
6. **自动保存到 `~/Documents/Excalidraw`**
7. 告知用户文件路径与使用方法

## Output Formats

### 模式 1：Obsidian 格式（默认）

**严格按照以下结构输出，不得有任何修改：**

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
{JSON 完整数据}
\`\`\`
%%
```

**关键要点：**
- Frontmatter 必须包含 `tags: [excalidraw]`
- 警告信息必须完整
- JSON 必须被 `%%` 标记包围
- 不能使用 `excalidraw-plugin: parsed` 以外的其他 frontmatter 设置
- **文件扩展名**：`.md`
- **保存路径**：`~/Documents/Excalidraw/[filename].md`

### 模式 2：标准 Excalidraw 格式

直接输出纯 JSON 文件，可在 excalidraw.com 打开：

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

**关键要点：**
- `source` 使用 `https://excalidraw.com`（不是 Obsidian 插件）
- 纯 JSON，无 Markdown 包装
- **文件扩展名**：`.excalidraw`
- **保存路径**：`~/Documents/Excalidraw/[filename].excalidraw`

### 模式 3：Excalidraw 动画格式

与 Standard 格式相同，但每个元素添加 `customData.animate` 字段控制动画顺序：

```json
{
  "id": "element-1",
  "type": "rectangle",
  "customData": {
    "animate": {
      "order": 1,
      "duration": 500
    }
  },
  ...其他标准字段
}
```

**动画顺序规则：**
- `order`: 动画播放顺序（1, 2, 3...），数字越小越先出现
- `duration`: 该元素的绘制时长（毫秒），默认 500
- 相同 `order` 的元素同时出现
- 建议顺序：标题 → 主要框架 → 连接线 → 细节文字

**使用方法：**
1. 生成 `.excalidraw` 文件
2. 拖到 https://dai-shi.github.io/excalidraw-animate/
3. 点击 Animate 预览，然后导出 SVG 或 WebM

**文件扩展名**：`.excalidraw`
**保存路径**：`~/Documents/Excalidraw/[filename].animate.excalidraw`

---

## 图表类型与选择指南

选择合适的图表形式，以提升理解力与视觉吸引力。

| 类型 | 英文 | 使用场景 | 做法 |
|------|------|---------|------|
| **流程图** | Flowchart | 步骤说明、工作流程、任务执行顺序 | 用箭头连接各步骤，清晰表达流程走向 |
| **思维导图** | Mind Map | 概念发散、主题分类、灵感捕捉 | 以中心为核心向外发散，放射状结构 |
| **层级图** | Hierarchy | 组织结构、内容分级、系统拆解 | 自上而下或自左至右构建层级节点 |
| **关系图** | Relationship | 要素之间的影响、依赖、互动 | 图形间用连线表示关联，箭头与说明 |
| **对比图** | Comparison | 两种以上方案或观点的对照分析 | 左右两栏或表格形式，标明比较维度 |
| **时间线图** | Timeline | 事件发展、项目进度、模型演化 | 以时间为轴，标出关键时间点与事件 |
| **矩阵图** | Matrix | 双维度分类、任务优先级、定位 | 建立 X 与 Y 两个维度，坐标平面安置 |
| **自由布局** | Freeform | 内容零散、灵感记录、初步信息收集 | 无需结构限制，自由放置图块与箭头 |

## 设计规则

### 文本与格式
- **默认手写风格**：所有文本元素使用 `fontFamily: 5`（Excalifont）
- **所有文本元素必须使用** `fontFamily: 5`（Excalifont 手写字体）
- **文本中的双引号替换规则**：`"` 替换为 `『』`
- **文本中的圆括号替换规则**：`()` 替换为 `「」`
- **字体大小规则**（硬性下限，低于此值在正常缩放下不可读）：
  - 标题：20-28px（最小 20px）
  - 副标题：18-20px
  - 正文/标签：16-18px（最小 16px）
  - 次要注释：14px（仅限不重要的辅助说明，慎用）
  - **绝对禁止低于 14px**
- **行高**：所有文本使用 `lineHeight: 1.25`
- **文字居中估算**：独立文本元素没有自动居中，需手动计算 x 坐标：
  - 估算文字宽度：`estimatedWidth = text.length * fontSize * 0.5`（CJK 字符用 `* 1.0`）
  - 居中公式：`x = centerX - estimatedWidth / 2`
  - 示例：文字 "Hello"（5字符, fontSize 20）居中于 x=300 → `estimatedWidth = 5 * 20 * 0.5 = 50` → `x = 300 - 25 = 275`

### 布局与设计
- **画布范围**：建议所有元素在 0-1200 x 0-800 区域内
- **最小形状尺寸**：带文字的矩形/椭圆不小于 120x60px
- **元素间距**：最小 20-30px 间距，防止重叠
- **层次清晰**：使用不同颜色和形状区分不同层级的信息
- **图形元素**：适当使用矩形框、圆形、箭头等元素来组织信息
- **禁止 Emoji**：不要在图表文本中使用任何 Emoji 符号，如需视觉标记请使用简单图形（圆形、方形、箭头）或颜色区分

### 调色板

**文字颜色（strokeColor for text）：**

| 用途 | 色值 | 说明 |
|------|------|------|
| 标题 | `#1e40af` | 深蓝 |
| 副标题/连接线 | `#3b82f6` | 亮蓝 |
| 正文文字 | `#374151` | 深灰（白底最浅不低于 `#757575`） |
| 强调/重点 | `#f59e0b` | 金色 |

**形状填充色（backgroundColor, fillStyle: "solid"）：**

| 色值 | 语义 | 适用场景 |
|------|------|---------|
| `#a5d8ff` | 浅蓝 | 输入、数据源、主要节点 |
| `#b2f2bb` | 浅绿 | 成功、输出、已完成 |
| `#ffd8a8` | 浅橙 | 警告、待处理、外部依赖 |
| `#d0bfff` | 浅紫 | 处理中、中间件、特殊项 |
| `#ffc9c9` | 浅红 | 错误、关键、告警 |
| `#fff3bf` | 浅黄 | 备注、决策、规划 |
| `#c3fae8` | 浅青 | 存储、数据、缓存 |
| `#eebefa` | 浅粉 | 分析、指标、统计 |

**区域背景色（大矩形 + opacity: 30，用于分层图表）：**

| 色值 | 语义 |
|------|------|
| `#dbe4ff` | 前端/UI 层 |
| `#e5dbff` | 逻辑/处理层 |
| `#d3f9d8` | 数据/工具层 |

**对比度规则：**
- 白底上文字最浅不低于 `#757575`，否则不可读
- 浅色填充上用深色变体文字（如浅绿底用 `#15803d`，不用 `#22c55e`）
- 避免浅灰色文字（`#b0b0b0`、`#999`）出现在白底上

## JSON 结构

**Obsidian 模式：**
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://github.com/zsviczian/obsidian-excalidraw-plugin",
  "elements": [...],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

**Standard / Animated 模式：**
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": { "gridSize": null, "viewBackgroundColor": "#ffffff" },
  "files": {}
}
```

## 元素模板

每个元素都需要以下字段（**不要**添加 `frameId`、`index`、`versionNonce`、`rawText` 等额外字段——它们可能在 excalidraw.com 上引发问题。`boundElements` 必须为 `null` 而非 `[]`，`updated` 必须为 `1` 而非时间戳）：

```json
{
  "id": "unique-id",
  "type": "rectangle",
  "x": 100, "y": 100,
  "width": 200, "height": 50,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "groupIds": [],
  "roundness": {"type": 3},
  "seed": 123456789,
  "version": 1,
  "isDeleted": false,
  "boundElements": null,
  "updated": 1,
  "link": null,
  "locked": false
}
```

`strokeStyle` 取值：`"solid"`（实线，默认）| `"dashed"`（虚线）| `"dotted"`（点线）。虚线适合表示可选路径、异步流、弱关联等。

文本元素额外添加：
```json
{
  "text": "显示文本",
  "fontSize": 20,
  "fontFamily": 5,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": null,
  "originalText": "显示文本",
  "autoResize": true,
  "lineHeight": 1.25
}
```

**Animated 模式额外添加** `customData` 字段：
```json
{
  "id": "title-1",
  "type": "text",
  "customData": {
    "animate": {
      "order": 1,
      "duration": 500
    }
  },
  ...其他字段
}
```

## 实现说明

### 自动保存与文件生成工作流程

当生成 Excalidraw 图表时，**必须自动执行以下步骤**：

#### 1. 选择合适的图表类型
- 根据用户提供的内容特性，参考上方 「图表类型与选择指南」 表
- 分析内容的核心诉求，选择最合适的可视化形式

#### 2. 生成有意义的文件名

根据输出模式选择文件扩展名：

| 模式 | 文件名格式 | 示例 |
|------|-----------|------|
| Obsidian | `[主题].[类型].md` | `商业模式.relationship.md` |
| Standard | `[主题].[类型].excalidraw` | `商业模式.relationship.excalidraw` |
| Animated | `[主题].[类型].animate.excalidraw` | `商业模式.relationship.animate.excalidraw` |

- 优先使用中文以提高清晰度

#### 3. 使用 Write 工具自动保存文件
- **保存位置**：`~/Documents/Excalidraw`
- **完整路径**：`~/Documents/Excalidraw/[filename].[ext]`
- 确保目录存在，如不存在则创建

#### 4. 确保 Markdown 结构完全正确
**必须按以下格式生成**（不能有任何修改）：

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
{完整的 JSON 数据}
\`\`\`
%%
```

#### 5. JSON 数据要求
- 包含完整的 Excalidraw JSON 结构
- 所有文本元素使用 `fontFamily: 5`
- 文本中的 `"` 替换为 `『』`
- 文本中的 `()` 替换为 `「」`
- JSON 格式必须有效，通过语法检查
- 所有元素有唯一的 `id`
- 包含 `appState` 和 `files: {}` 字段

#### 6. 用户反馈与确认
向用户报告：
- 图表已生成
- 精确的保存位置：`~/Documents/Excalidraw/[filename]`
- 如何在 Obsidian 中查看
- 图表的设计选择说明（选择了什么类型的图表、为什么）
- 是否需要调整或修改

### 示例输出消息

**Obsidian 模式：**
```
Excalidraw 图已生成！

保存位置：~/Documents/Excalidraw/商业模式.relationship.md

使用方法：
1. 在 Obsidian 中打开此文件
2. 点击右上角 MORE OPTIONS 菜单
3. 选择 Switch to EXCALIDRAW VIEW
```

**Standard 模式：**
```
Excalidraw 图已生成！

保存位置：~/Documents/Excalidraw/商业模式.relationship.excalidraw

使用方法：
1. 打开 https://excalidraw.com
2. 点击左上角菜单 → Open → 选择此文件
3. 或直接拖拽文件到 excalidraw.com 页面
```

**Animated 模式：**
```
Excalidraw 动画图已生成！

保存位置：~/Documents/Excalidraw/商业模式.relationship.animate.excalidraw

动画顺序：标题(1) → 主框架(2-4) → 连接线(5-7) → 说明文字(8-10)

生成动画：
1. 打开 https://dai-shi.github.io/excalidraw-animate/
2. 点击 Load File 选择此文件
3. 预览动画效果
4. 点击 Export 导出 SVG 或 WebM
```

## 需避免的常见错误

- **文字偏移** — 独立 text 元素的 `x` 是左边缘，不是中心。必须用居中公式手动计算，否则文字会偏到一边
- **元素重叠** — y 坐标相近的元素容易堆叠。放置新元素前检查与周围元素是否有至少 20px 间距
- **画布留白不足** — 内容不要贴着画布边缘。在四周留 50-80px 的 padding
- **标题没有居中于图表** — 标题应居中于下方图表的整体宽度，不是固定在 x=0
- **箭头标签溢出** — 长文字标签（如 "ATP + NADPH"）会超出短箭头。保持标签简短或加大箭头长度
- **对比度不够** — 浅色文字在白底上几乎不可见。文字颜色不低于 `#757575`，有色文字用深色变体
- **字号太小** — 低于 14px 在正常缩放下不可读，正文最小 16px
