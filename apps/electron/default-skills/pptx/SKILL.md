---
name: pptx
description: "只要任务以任何方式涉及 .pptx 文件——无论是作为输入、输出还是两者兼有——就使用本 Skill。这包括：创建幻灯片、提案文稿或演示文稿；读取、解析或提取任何 .pptx 文件中的文本（即使提取的内容将用于其他地方，如邮件或摘要）；编辑、修改或更新现有演示文稿；合并或拆分幻灯片文件；使用模板、版式、演讲者备注或批注。当用户提到\"deck（演示文稿）\"、\"slides（幻灯片）\"、\"presentation（演示文稿）\"或引用 .pptx 文件名时，无论之后计划如何处理内容，都应触发本 Skill。如果需要打开、创建或处理 .pptx 文件，请使用本 Skill。"
license: Proprietary. LICENSE.txt has complete terms
version: "1.0.2"
---

# PPTX Skill

## 快速参考

| 任务 | 指南 |
|------|-------|
| 读取/分析内容 | `python -m markitdown presentation.pptx` |
| 编辑或基于模板创建 | 阅读 [editing.md](editing.md) |
| 从零创建 | 阅读 [pptxgenjs.md](pptxgenjs.md) |

---

## 读取内容

```bash
# 文本提取
python -m markitdown presentation.pptx

# 视觉概览
python scripts/thumbnail.py presentation.pptx

# 原始 XML
python scripts/office/unpack.py presentation.pptx unpacked/
```

---

## 编辑工作流

**完整细节请阅读 [editing.md](editing.md)。**

1. 使用 `thumbnail.py` 分析模板
2. 解包 → 操作幻灯片 → 编辑内容 → 清理 → 重新打包

---

## 从零创建

**完整细节请阅读 [pptxgenjs.md](pptxgenjs.md)。**

在没有模板或参考演示文稿时使用。

---

## 设计思路

**不要制作无聊的幻灯片。** 白底纯文本要点不会打动任何人。为每张幻灯片从下面的清单中挑选思路。

### 开始之前

- **挑选醒目且贴合内容主题的配色方案**：调色板应让人感觉专为 THIS 主题设计。如果把这套颜色套用到完全不同的演示文稿依然"成立"，说明你的选择还不够有针对性。
- **主次分明而非平均用力**：一种颜色应占主导（60-70% 的视觉权重），配以 1-2 种辅助色调和一种锐利点缀色。绝不要让所有颜色权重相等。
- **深浅对比**：标题页和结语页用深色背景，内容页用浅色（"三明治"结构）。或者全程保持深色以营造高级感。
- **坚持一个视觉母题**：挑选一个独特的元素并重复使用——圆角图片框、彩色圆环中的图标、粗单侧边框。让它贯穿每一张幻灯片。

### 配色方案

选择与主题匹配的颜色——不要默认使用通用蓝色。可将这些调色板作为灵感：

| 主题 | 主色 | 辅助色 | 点缀色 |
|-------|---------|-----------|--------|
| **午夜行政（Midnight Executive）** | `1E2761`（藏青） | `CADCFC`（冰蓝） | `FFFFFF`（白） |
| **森林与苔藓（Forest & Moss）** | `2C5F2D`（森林绿） | `97BC62`（苔藓绿） | `F5F5F5`（奶油白） |
| **珊瑚能量（Coral Energy）** | `F96167`（珊瑚红） | `F9E795`（金色） | `2F3C7E`（藏青） |
| **暖赤陶（Warm Terracotta）** | `B85042`（赤陶） | `E7E8D1`（沙色） | `A7BEAE`（鼠尾草绿） |
| **海洋渐变（Ocean Gradient）** | `065A82`（深蓝） | `1C7293`（青绿） | `21295C`（午夜蓝） |
| **炭黑极简（Charcoal Minimal）** | `36454F`（炭灰） | `F2F2F2`（米白） | `212121`（黑） |
| **青色信任（Teal Trust）** | `028090`（青） | `00A896`（海沫绿） | `02C39A`（薄荷绿） |
| **浆果与奶油（Berry & Cream）** | `6D2E46`（浆果红） | `A26769`（灰玫瑰） | `ECE2D0`（奶油白） |
| **鼠尾草宁静（Sage Calm）** | `84B59F`（鼠尾草绿） | `69A297`（桉树绿） | `50808E`（石板蓝） |
| **樱桃醒目（Cherry Bold）** | `990011`（樱桃红） | `FCF6F5`（米白） | `2F3C7E`（藏青） |

### 每张幻灯片

**每张幻灯片都需要视觉元素**——图片、图表、图标或形状。纯文字幻灯片会让人过目即忘。

**布局选项：**
- 双栏（左侧文本，右侧插图）
- 图标 + 文本行（彩色圆环中的图标、加粗标题、下方描述）
- 2x2 或 2x3 网格（一侧图片，另一侧内容块网格）
- 半出血图片（占满左侧或右侧）叠加内容

**数据展示：**
- 大号数据标注（60-72pt 大数字，下方小标签）
- 对比栏（前后对比、优点/缺点、并排选项）
- 时间线或流程（编号步骤、箭头）

**视觉打磨：**
- 章节标题旁的彩色小圆环图标
- 关键数据或标语使用斜体强调文字

### 字体排印

**选择有趣的字体搭配**——不要默认使用 Arial。挑选一款有个性的标题字体，并搭配一款干净的正文字体。

| 标题字体 | 正文字体 |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| 元素 | 字号 |
|---------|------|
| 幻灯片标题 | 36-44pt 加粗 |
| 章节标题 | 20-24pt 加粗 |
| 正文 | 14-16pt |
| 说明文字 | 10-12pt 弱化 |

### 间距

- 最小边距 0.5"
- 内容块之间 0.3-0.5"
- 留出呼吸空间——不要填满每一寸

### 避免（常见错误）

- **不要重复相同布局**——在幻灯片之间变换栏、卡片和标注的形态
- **不要居中正文**——段落和列表左对齐；只居中标题
- **不要吝啬大小对比**——标题需要 36pt+ 才能从 14-16pt 的正文中脱颖而出
- **不要默认用蓝色**——选择贴合具体主题的颜色
- **不要随意混用间距**——选择 0.3" 或 0.5" 的间隙并始终如一地使用
- **不要只给一张幻灯片做样式而其余保持朴素**——要么全面投入，要么全程保持简单
- **不要创建纯文字幻灯片**——添加图片、图标、图表或视觉元素；避免"标题 + 要点"的素版
- **不要忘记文本框内边距**——当线条或形状与文本边缘对齐时，将文本框的 `margin` 设为 0，或偏移形状以抵消内边距
- **不要使用低对比度元素**——图标和文本都需要与背景形成强烈对比；避免浅底浅字或深底深字
- **切勿在标题下加装饰线**——这是 AI 生成幻灯片的标志性特征；改用留白或背景色

---

## QA（必做）

**假设一定有问题。你的工作就是找出它们。**

第一次渲染几乎从不正确。把 QA 当作捉 Bug，而不是确认步骤。如果第一次检查就发现零问题，说明你看得还不够仔细。

### 内容 QA

```bash
python -m markitdown output.pptx
```

检查内容缺失、错别字、顺序错误。

**使用模板时，检查是否残留占位符文本：**

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

如果 grep 返回结果，在宣布成功之前修复它们。

### 视觉 QA

**⚠️ 使用子 Agent**——即使只有 2-3 张幻灯片。你一直盯着代码，会看到你预期的东西，而不是实际存在的东西。子 Agent 有全新的视角。

将幻灯片转换为图片（见 [转换为图片](#converting-to-images)），然后使用以下提示词：

```
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. /path/to/slide-01.jpg (Expected: [brief description])
2. /path/to/slide-02.jpg (Expected: [brief description])

Report ALL issues found, including minor ones.
```

### 验证循环

1. 生成幻灯片 → 转换为图片 → 检查
2. **列出发现的问题**（如果没发现问题，再以更批判的眼光看一遍）
3. 修复问题
4. **重新验证受影响的幻灯片**——一次修复常常会引入新问题
5. 重复，直到完整一轮检查不再发现新问题

**在至少完成一轮"修复并验证"循环之前，不要宣布成功。**

---

## 转换为图片

将演示文稿转换为单张幻灯片图片，以便进行视觉检查：

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

这会生成 `slide-01.jpg`、`slide-02.jpg` 等。

修复后要重新渲染特定幻灯片：

```bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
```

---

## 依赖

- `pip install "markitdown[pptx]"` - 文本提取
- `pip install Pillow` - 缩略图网格
- `npm install -g pptxgenjs` - 从零创建
- LibreOffice（`soffice`） - PDF 转换（沙箱环境通过 `scripts/office/soffice.py` 自动配置）
- Poppler（`pdftoppm`） - PDF 转图片
