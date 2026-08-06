---
name: frontend-slides
description: 从零创建或通过转换 PowerPoint 文件，制作令人惊艳、动画丰富的 HTML 演示文稿。当用户想制作演示、把 PPT/PPTX 转为网页、或为演讲/提案（talk/pitch）创建幻灯片时使用。帮助非设计背景的用户通过视觉探索而非抽象选择来发现自己的审美偏好。触发词：演示、幻灯片、PPT、HTML 演示、网页 PPT、演讲、制作演示、转换 PPT、presentation、slides、deck。
group: 演示文稿
version: 1.0.1
---

# Frontend Slides

创建零依赖、动画丰富的 HTML 演示文稿，完全在浏览器中运行。

## 核心原则（Core Principles）

1. **零依赖（Zero Dependencies）** —— 单 HTML 文件，内联 CSS/JS。无 npm、无构建工具。
2. **展示而非说教（Show, Don't Tell）** —— 生成可视化预览而非抽象选项。用户通过"看"来发现自己想要什么。
3. **独特设计（Distinctive Design）** —— 拒绝千篇一律的"AI 味"（AI slop）。每份演示都必须像手工定制。
4. **渐进式呈现（Progressive Disclosure）** —— 先读轻量的样式索引。对于大胆模板，先用小预览卡片做样式预览，只有用户选定模板后才加载完整的 `design.md`。
5. **固定 16:9 舞台（NON-NEGOTIABLE，不可妥协）** —— 每份演示都使用 1920×1080 的幻灯片画布，并整体等比缩放到视口。幻灯片在任何屏幕上（包括手机）都必须保持 16:9，不要为适配设备而重排幻灯片内容。

## 设计美学（Design Aesthetics）

你倾向于产出千篇一律、"随大流"的结果。在前端设计中，这就会形成用户所说的"AI 味"（AI slop）审美。要避免这一点：做出有创意、有辨识度的前端，让人惊喜和愉悦。

重点关注：

- **字体（Typography）**：选择美观、独特、有趣的字体。避免 Arial、Inter 这类通用字体，改用能提升前端美感的独特选择。
- **色彩与主题（Color & Theme）**：坚持统一的审美。使用 CSS 变量保持一致性。强烈主色 + 锐利强调色优于畏手畏脚、平均分布的调色板。可从 IDE 主题和文化审美中汲取灵感。
- **动效（Motion）**：用动画实现效果与微交互。HTML 优先 CSS-only 方案；React 可用时用 Motion 库。聚焦高影响时刻：一次精心编排的页面加载 + 交错浮现（animation-delay）比零散的微交互更能带来愉悦感。
- **背景（Backgrounds）**：营造氛围与层次，而非默认纯色。叠加 CSS 渐变、使用几何图案、或添加与整体审美匹配的情境化效果。

避免常见的 AI 生成审美：

- 过度使用的字体族（Inter、Roboto、Arial、系统字体）
- 陈词滥调的色彩方案（尤其是白底紫渐变）
- 可预测的布局和组件模式
- 缺乏情境个性的套模板式设计

创造性地解读，做出真正贴合情境的意外选择。在明暗主题、不同字体、不同审美之间切换变化。你仍然容易在多轮生成中收敛到常见选择（比如 Space Grotesk）。要避免这一点：跳出框框思考至关重要！

## 固定舞台规则（Fixed Stage Rules）

以下不变量适用于每份演示中的每一页幻灯片：

- 每份演示都有一个填满浏览器窗口的视口包裹层（viewport wrapper）。
- 每页幻灯片都在固定的 1920×1080 舞台内编写。
- 舞台整体等比缩放到视口。可以上下留黑边（letterbox）/ 左右留黑边（pillarbox），但绝不能重排内容。
- 不要用响应式断点在手机上重排幻灯片内容。
- 使用 1920×1080 设计尺寸下的固定内部度量。
- 幻灯片可见性必须通过 `viewport-base.css` 中的 `.active` / `.visible` 配合 `visibility`、`opacity` 和 `pointer-events` 来控制。不要用 `display: none` / `display: block` 切换幻灯片；后面如 `.slide-content { display: flex; }` 这类布局样式会覆盖它们，导致所有幻灯片同时可见。
- `clamp()` 只用于舞台外的非幻灯片 UI，或无法容纳完整舞台时的小型兜底预览。
- 包含 `prefers-reduced-motion` 支持。
- 永远不要直接对 CSS 函数取负（`-clamp()`、`-min()`、`-max()` 会被静默忽略）——改用 `calc(-1 * clamp(...))`。

**生成时：读取 `viewport-base.css`，并把它的完整内容包含到每份演示中。**

### 内容密度模式（Content Density Modes）

先问用户这份演示主要是"阅读型"还是"演讲型"，再围绕答案设计：

| 密度模式 | 适用场景 | 设计行为 |
| -------- | -------- | -------- |
| **低密度 / 演讲主导（Low density / speaker-led）** | 公开演讲、keynote 式分享、现场讲解 | 每页一个想法、大字号、强视觉层级、充裕留白，最多 1-3 条要点，需要时可增加页数 |
| **高密度 / 阅读优先（High density / reading-first）** | 报告、讲义、异步审阅、详细内部文档 | 更多自包含页面、结构化网格/表格/注释，可读时 4-8 条要点或 4-6 张卡片，间距更紧凑但有意识 |

基线限制仍然适用：不滚动、不溢出、面板不重叠、文字不低于舒适阅读大小。如果内容超出所选密度模式，就拆成更多页，而不是一直缩小到局促。

---

## 阶段 0：检测模式（Phase 0: Detect Mode）

判断用户想要什么：

- **模式 A：新建演示（New Presentation）** —— 从零创建。转到阶段 1。
- **模式 B：PPT 转换（PPT Conversion）** —— 转换 .pptx 文件。转到阶段 4。
- **模式 C：增强（Enhancement）** —— 改进现有 HTML 演示。读取、理解、增强。**遵循下面的模式 C 修改规则。**

### 模式 C：修改规则（Mode C: Modification Rules）

增强现有演示时，固定舞台适配是最大风险：

1. **添加内容前**：统计现有元素数量，对照密度限制检查
2. **添加图片**：放进 1920×1080 幻灯片画布内。如果幻灯片已满，拆成两页
3. **添加文字**：每页最多 4-6 条要点。超限？拆成续页
4. **任何修改后都要验证**：幻灯片舞台保持 16:9、文字不溢出卡片、面板不重叠，并且 1280×720 加一个手机视口的截图都正确
5. **主动重组**：如果修改会导致溢出，自动拆分内容并告知用户，不要等用户来问

**向现有幻灯片添加图片时：** 先把图片移到新幻灯片或先减少其他内容。绝不跳过检查就直接加图，先确认现有内容是否已填满 1920×1080 的舞台。

---

## 阶段 1：内容探索（Phase 1: Content Discovery，新建演示）

**一次性问完所有问题**，让用户一次填完。如果当前环境提供原生结构化问题 UI，就使用它；否则用一条简洁消息给出明确编号的选项：

**问题 1 —— 目的**（header: "Purpose"）：
这份演示用于什么？选项：融资路演（Pitch deck）/ 教学教程（Teaching-Tutorial）/ 会议演讲（Conference talk）/ 内部演示（Internal presentation）

**问题 2 —— 篇幅**（header: "Length"）：
大约多少页？选项：短 5-10 / 中 10-20 / 长 20+

**问题 3 —— 内容**（header: "Content"）：
你有现成内容吗？选项：内容齐全（All content ready）/ 粗略笔记（Rough notes）/ 只有主题（Topic only）

**问题 4 —— 密度**（header: "Density"）：
演示应该感觉多密集？选项：

- "低密度 / 演讲主导" —— 大想法、少文字、更多视觉呼吸空间
- "高密度 / 阅读优先" —— 更多自包含细节，供异步阅读

**阶段 1 期间不要询问内联编辑。** 用户不应该在看到草稿之前就选择编辑行为。内联编辑是草稿后的能力：默认包含，除非用户明确要求只读/仅导出的文件。

记住用户的密度选择。它影响页数、字号比例、每页文字量、布局密度，以及是偏向电影感演讲页还是自包含阅读页。

如果用户有内容，请他们分享。

### 步骤 1.2：图片评估（Step 1.2: Image Evaluation，如果提供了图片）

如果用户选择"无图片"→ 跳到阶段 2。

如果用户提供图片文件夹：

1. **扫描（Scan）** —— 列出所有图片文件（.png、.jpg、.svg、.webp 等）
2. **检查每张图片（Inspect）** —— 使用 agent 可用的图像理解能力。如果无法读图，用文件名/元数据，仅在必要时请用户澄清
3. **评估（Evaluate）** —— 对每张图：展示内容、可用（USABLE）或不可用（NOT USABLE，附原因）、代表什么概念、主色
4. **协同设计大纲（Co-design the outline）** —— 精选图片与文字一起决定幻灯片结构。这不是"先定幻灯片再加图"——从一开始就围绕两者设计（例如 3 张截图 → 3 页功能页，1 个 logo → 标题/结尾页）
5. **确认大纲**，在可用时使用同样的结构化问题机制："这个幻灯片大纲和图片选择看起来对吗？"选项：看起来不错（Looks good）/ 调整图片（Adjust images）/ 调整大纲（Adjust outline）

**预览中的 Logo：** 如果识别到可用的 logo，把它（base64）嵌入阶段 2 的每个样式预览——用户能看到自己的品牌被做成三种不同风格。

---

## 阶段 2：样式探索（Phase 2: Style Discovery）

**这是"展示而非说教"的阶段。** 大多数人无法用语言描述设计偏好。

### 步骤 2.0：直接生成 3 个样式预览

根据目的、受众、氛围和内容密度，生成 3 个不同的单页 HTML 预览，展示字体、色彩、动画和整体审美。

不要问用户是否想要选项或预设选择器。默认的探索体验永远是视觉对比。

如果用户已经给了氛围（vibe），就用它。如果没有，从场合、受众、内容和利害关系中推断可能的氛围。保持选项足够多元，让用户能直接做出视觉反应，而不是被迫先说出自己的品味。

如果用户明确点名某个预设或大胆模板，就把它作为一个选项，并围绕它生成其余预览槽位。

读取 [STYLE_PRESETS.md](STYLE_PRESETS.md) 获取安全的预设候选。如果 [bold-template-pack/selection-index.json](bold-template-pack/selection-index.json) 存在，也读这个紧凑索引，但先不要读任何 `design.md` 文件。

| 氛围（Mood） | 建议预设（Suggested Presets） |
| ------------ | ------------------------------ |
| 印象深刻/自信（Impressed/Confident） | Bold Signal、Electric Studio、Dark Botanical |
| 兴奋/活力（Excited/Energized） | Creative Voltage、Neon Cyber、Split Pastel |
| 平静/专注（Calm/Focused） | Notebook Tabs、Paper & Ink、Swiss Modern |
| 感动/启发（Inspired/Moved） | Dark Botanical、Vintage Editorial、Pastel Geometry |

**预览混合规则：**

- 默认生成 3 个预览：1 个来自 `STYLE_PRESETS.md` 的安全预设、至少 1 个来自 `bold-template-pack/selection-index.json` 的大胆模板、1 个通配（wildcard）。
- 通配可以是第二个大胆模板，也可以是自定义设计。选择对用户场合、受众、氛围和内容形成最强烈、最有用的对比的那个。
- 不要让所有表达性选项都来自模板库。如果需求比现有模板更精准、更具体，就用通配槽位自由设计。
- 对保守或高利害的演示：让安全预设特别克制；选择冷静、更正式的大胆模板；通配做成另一个克制模板，或做出权威而非装饰性的自定义设计。
- 对表达性演示：把安全预设保留为可读的兜底；选一个强力大胆模板；让通配冒险、贴合情境、并与其他两个预览明显不同。
- 如果大胆模板匹配感不强，用通配做自定义设计，或退回另一个安全预设，而不是硬套模板。

**自定义通配设计规则：**

- 遵循上文"设计美学"一节：没有通用"AI 味"、没有默认字体/色彩/布局选择、没有白底紫渐变俗套、没有千篇一律的仪表盘/卡片外观。
- 匹配用户说明的场合、受众、氛围/格调、内容密度。自定义设计应让人觉得"为这份演示而作"，而不仅是"时尚"。
- 做出有意的视觉主张：独特的字体、坚定的调色板、可识别的布局系统、一个强烈的氛围或图形手法。
- 保证能扩展到整份演示。预览必须暗示一个能扩展到章节页、内容页、引言页、对比页和结尾页的设计系统。
- 使用固定 1920×1080 舞台规则，并像其他所有选项一样通过预览真实性检查。
- 绝不在幻灯片本身上渲染"custom"、"wildcard"、"AI-generated"或设计过程标签。

**大胆模板选择规则：**

- 将用户目的和氛围与 `mood`、`tone`、`best_for`、`avoid_for`、`formality`、`density`、`scheme` 匹配。
- 把 `best_for` 示例当作软信号，而非严格的行业过滤器。
- 保持三个预览彼此真正不同。
- 选定大胆模板候选后，只从选择索引的 `preview_md` 路径读取这些候选的 `preview.md` 文件。
- `preview.md` 只用于标题页预览。在用户选定最终模板之前，不要读取完整的 `design.md` 文件。
- 除非选定的最终 `design.md` 缺少关键实现细节，否则不要读取或复制 `template.html`。

**预览真实性规则（NON-NEGOTIABLE，不可妥协）：**

- 每个样式预览都必须看起来像用户演示里真实的第一页，而不是诊断卡片。
- 绝不在幻灯片上渲染内部工作流文字：不要 `preview`、`generated from`、`preview.md`、`template`、`preset`、`style option`、`Option A/B/C`、文件名、路径或源文档标签。
- 绝不在幻灯片本身上渲染模板名或 slug 名。模板/样式名只出现在给用户的消息里。
- 绝不在幻灯片上渲染用户需求笔记，如 "sharp and provocative"、"safe option"、"bold option"、"for internal sharing" 或 "audience: ..."，除非用户明确希望这句话出现在演示里。
- 如果幻灯片需要页眉装饰（chrome），只用真实的演示页眉：演示标题、章节标题、日期、作者、公司、页码，或用户素材中的真实内容短语。
- 打开预览前，检查可见文字，若出现任何内部元数据就修改。

把预览保存到 `.frontend-slides/slide-previews/`（style-a.html、style-b.html、style-c.html）。每个都应自包含且紧凑，展示一页带动画的标题页。

自动为每个预览打开。

### 步骤 2.1：用户选择

问（header: "Style"）：
你更喜欢哪个样式预览？选项：样式 A：[名称] / 样式 B：[名称] / 样式 C：[名称] / 混合元素（Mix elements）

如果选"混合元素"，问具体细节。

---

## 阶段 3：生成演示（Phase 3: Generate Presentation）

使用阶段 1 的内容（文字，或文字 + 精选图片）和阶段 2 的样式，生成完整演示。

如果提供了图片，幻灯片大纲已在步骤 1.2 中纳入它们。如果没有，CSS 生成的视觉（渐变、形状、图案）提供视觉趣味——这是一条完全受支持的一等路径。

在整份演示中应用用户的密度选择：

- **低密度 / 演讲主导：** 用更多页面、每页更少想法。偏好大标题、短语、视觉隐喻、章节节拍、引言/宣言页，以及面向演讲者的节奏。
- **高密度 / 阅读优先：** 让页面更自包含。使用结构化网格、对比表格、注释图、说明文字和简洁的解释性文案。保持强层级，让它看起来是"设计过"的，而不是"文档贴到幻灯片上"。

如果用户的需求混合，选择两种模式中更接近的那个，而不是发明中间选项：现场受众说服默认低密度；异步传阅或详细审阅默认高密度。

绝不让高密度变成视觉杂乱。如果高密度页面开始溢出，就拆分或重新设计成更清晰的结构。

如果用户从 `bold-template-pack` 选了大胆模板，在生成前读取那一个模板的完整 `design.md`。不要读其他大胆模板。把 `design.md` 当作设计配方：

- 保留它的字体、调色板、装饰词汇、间距节奏和组件语法。
- 无论源模板最初用的是 `deck-stage.js` 还是 viewport-fluid CSS，最终演示都生成为固定 1920×1080 舞台并整体等比缩放到视口。
- 把 `design.md` 中的 viewport-fluid 值当作设计比例，翻译成 1920×1080 舞台坐标。不要在最终演示里保留它们作为实时视口重排规则。
- 输出保持为单个自包含的 Frontend Slides HTML 文件。
- 不要复制演示示例内容，也不要过于字面地模仿源模板。
- `template.html` 只作为所选模板的最后手段实现参考。
- 生成后，在渲染后的浏览器截图中同时验证内容溢出和面板重叠。仅靠 `scrollHeight` 检查不够，因为网格面板可能在视觉上互相遮盖。

如果用户选择的是自定义通配，把那个预览的 CSS 和布局当作设计配方：

- 保留它的字体、调色板、装饰词汇、间距节奏、网格逻辑和组件语法。
- 把同一视觉系统扩展到整份演示。用户选定自定义方向后，不要切回预设或大胆模板。
- 从该系统设计缺失的幻灯片布局，而不是从另一种风格导入模式。
- 保持输出固定舞台、单文件，并像其他所有演示一样做视觉验证。

**生成前，读取以下支持文件：**

- [html-template.md](html-template.md) —— HTML 架构与 JS 特性
- [viewport-base.css](viewport-base.css) —— 必选 CSS（完整包含）
- [animation-patterns.md](animation-patterns.md) —— 所选感觉的动画参考

**关键要求：**

- 单个自包含 HTML 文件，所有 CSS/JS 内联
- 在 `<style>` 块中完整包含 viewport-base.css 的内容
- 使用 Fontshare 或 Google Fonts 的字体——绝不用系统字体
- 为每个部分添加详细注释
- 每个部分都需要清晰的 `/* === SECTION NAME === */` 注释块

---

## 阶段 4：PPT 转换（Phase 4: PPT Conversion）

转换 PowerPoint 文件时：

1. **提取内容（Extract content）** —— 运行 `python scripts/extract-pptx.py <input.pptx> <output_dir>`（如需要先安装 python-pptx：`pip install python-pptx`）
2. **与用户确认（Confirm with user）** —— 展示提取的幻灯片标题、内容摘要和图片数量
3. **样式选择（Style selection）** —— 转到阶段 2 做样式探索
4. **生成 HTML（Generate HTML）** —— 转换为所选样式，保留所有文字、图片（来自 assets/）、幻灯片顺序和演讲者备注（作为 HTML 注释）

---

## 阶段 5：交付（Phase 5: Delivery）

1. **清理（Clean up）** —— 如果 `.frontend-slides/slide-previews/` 存在就删除
2. **打开（Open）** —— 用 `open [filename].html` 在浏览器中打开
3. **总结（Summarize）** —— 告诉用户：
   - 文件位置、样式名称、页数
   - 导航：方向键、空格键、如启用则支持滑动/点击
   - 如何自定义：`:root` CSS 变量改颜色、font link 改字体、`.reveal` 类做动画
   - 支持内联文字编辑：悬停左上角或按 E 进入编辑模式，点击任意文字即可编辑，Ctrl+S 保存
   - 提供自然的草稿后操作：请求修改、直接在浏览器中编辑文字、或导出/分享

---

## 阶段 6：分享与导出（Phase 6: Share & Export，可选）

交付后，**问用户：** "_Would you like to share this presentation? I can deploy it to a live URL (works on any device including phones) or export it as a PDF._"（翻译：要不要分享这份演示？我可以部署到在线 URL（任何设备包括手机都能打开）或导出为 PDF。）

选项：

- **部署到 URL（Deploy to URL）** —— 可在任何设备上打开的分享链接
- **导出为 PDF（Export to PDF）** —— 适合邮件、Slack、打印的通用文件
- **都要（Both）**
- **不用了（No thanks）**

如果用户拒绝，就此结束。如果选择其中一个或两个，继续下面的流程。

### 6A：部署到在线 URL（Vercel）

把演示部署到 Vercel——一个免费托管平台。链接可在任何设备（手机、平板、笔记本）打开，直到用户下线它。

**如果用户从未部署过，逐步引导：**

1. **检查是否已安装 Vercel CLI** —— 运行 `npx vercel --version`。如果未找到，先安装 Node.js（macOS 用 `brew install node`，或从 https://nodejs.org 下载）。

2. **检查用户是否已登录** —— 运行 `npx vercel whoami`。
   - 如果未登录，解释："_Vercel is a free hosting service. You need an account to deploy. Let me walk you through it:_"（翻译：Vercel 是免费托管服务，需要一个账号才能部署，我来带你一步步操作：）
     - 第 1 步：请用户在浏览器中访问 https://vercel.com/signup
     - 第 2 步：他们可以用 GitHub、Google、邮箱注册——怎么方便怎么来
     - 第 3 步：注册后运行 `vercel login` 并按提示操作（会打开浏览器窗口授权）
     - 第 4 步：用 `vercel whoami` 确认登录
   - 在继续前等待用户确认已登录。

3. **部署（Deploy）** —— 运行部署脚本：

   ```bash
   bash scripts/deploy.sh <path-to-presentation>
   ```

   脚本接受一个文件夹（含 index.html）或单个 HTML 文件。

4. **分享 URL** —— 告诉用户：
   - 在线 URL（来自脚本输出）
   - 它可在任何设备上打开——可以发短信、Slack、邮件
   - 之后下线：访问 https://vercel.com/dashboard 并删除项目
   - Vercel 免费额度很慷慨——不会被收费

**⚠ 部署注意事项：**

- **本地图片/视频必须随 HTML 一起。** 部署脚本自动检测 HTML 中 `src="..."` 引用的文件并打包。但如果演示通过 CSS `background-image` 或非常规路径引用文件，可能会漏掉。**部署前验证：** 打开部署后的 URL 检查所有图片是否加载。如果有损坏的，最安全的修法是把 HTML 和所有资源放进一个文件夹，然后部署这个文件夹而不是单独的 HTML 文件。
- **资源多时优先文件夹部署。** 如果演示所在的文件夹里还有图片（例如 `my-deck/index.html` + `my-deck/logo.png`），直接部署文件夹：`bash scripts/deploy.sh ./my-deck/`。这比部署单个 HTML 文件更可靠，因为整个文件夹内容会原样上传。
- **文件名带空格能用但可能出问题。** 脚本能处理文件名中的空格，但 Vercel URL 会把空格编码成 `%20`。尽可能避免图片文件名带空格。如果用户图片带空格，脚本能处理——但如果图片仍然损坏，把文件名改成连字符是修复方法。
- **重新部署会更新同一个 URL。** 对同一份演示再次运行部署脚本会覆盖上一次部署。URL 不变——无需重新分享新链接。

### 6B：导出为 PDF

把每页幻灯片截图为图片，再合并成一个 PDF。非常适合邮件附件、嵌入文档或打印。

**注意：** 动画和交互不会被保留——PDF 是静态快照。这是正常且预期的，提前告诉用户以免意外。

1. **运行导出脚本：**

   ```bash
   bash scripts/export-pdf.sh <path-to-html> [output.pdf]
   ```

   如果没给输出路径，PDF 会保存在 HTML 文件旁边。

2. **后台发生什么**（向用户简要解释）：
   - 无头浏览器以 1920×1080（标准宽屏）打开演示
   - 一页一页地截图每页幻灯片
   - 所有截图合并为一个 PDF
   - 脚本需要 Playwright（浏览器自动化工具）——缺失时会自动安装

3. **如果 Playwright 安装失败：**
   - 最常见问题是 Chromium 下载失败。运行：`npx playwright install chromium`
   - 如果还不行，可能是网络/防火墙问题。请用户换个网络试试。

4. **交付 PDF** —— 脚本会自动打开。告诉用户：
   - 文件位置和大小
   - 它随处可用——邮件、Slack、Notion、Google Docs、打印
   - 动画被替换为最终视觉状态（看起来仍然很棒，只是静态）

**⚠ PDF 导出注意事项：**

- **首次运行较慢。** 脚本会把 Playwright 和 Chromium 浏览器（约 150MB）下载到临时目录。每次运行一次。提醒用户首次可能需要 30-60 秒——同一次会话内的后续导出更快。
- **幻灯片必须使用 `class="slide"`。** 导出脚本通过查询 `.slide` 元素找幻灯片。如果演示用别的类名，脚本会报"0 slides found"并失败。本技能生成的所有演示都用 `.slide`，所以这只影响外部创建的 HTML。
- **本地图片必须能通过 HTTP 加载。** 脚本会启动本地服务器并通过它加载 HTML（这样 Google Fonts 和相对图片路径才能工作）。如果图片使用绝对文件系统路径（如 `src="/Users/name/photo.png"`）而非相对路径（如 `src="photo.png"`），它们不会加载。生成的演示总是用相对路径，但转换的或用户提供的演示可能不是——需要时检查并修复。
- **只要本地图片与 HTML 在同一目录（或相对其路径），就会出现在 PDF 中。** 导出脚本通过 HTTP 提供 HTML 的父目录，所以 `src="photo.png"` 这类相对路径能正确解析——包括带空格的文件名。如果图片仍不出现，检查：(1) 图片文件确实存在于引用路径，(2) 路径是相对路径而非 `/Users/name/photo.png` 这样的绝对文件系统路径。
- **大演示会产生大 PDF。** 每页幻灯片都会截成完整的 1920×1080 PNG。18 页的演示可能产生约 20MB 的 PDF。如果 PDF 超过 10MB，问用户："_The PDF is [size]. Would you like me to compress it? It'll look slightly less sharp but the file will be much smaller._"（翻译：PDF 是 [大小]，要我压缩一下吗？画质会略微下降但文件会小很多。）如果要，用 `--compact` 参数重新导出：

  ```bash
  bash scripts/export-pdf.sh <path-to-html> [output.pdf] --compact
  ```

  这会以 1280×720 而非 1920×1080 渲染，通常能把文件大小削减 50-70%，视觉差异极小。

---

## 支持文件（Supporting Files）

| 文件 | 用途 | 读取时机 |
| -------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| [STYLE_PRESETS.md](STYLE_PRESETS.md) | 12 个精选视觉预设，含色彩、字体和标志性元素 | 阶段 2（样式选择） |
| [bold-template-pack/selection-index.json](bold-template-pack/selection-index.json) | 紧凑的大胆模板元数据，用于候选选择 | 阶段 2（样式选择） |
| [bold-template-pack/templates/*/preview.md](bold-template-pack/templates/) | 入围大胆标题预览的轻量样式卡片 | 阶段 2 入围后 |
| [bold-template-pack/templates/*/design.md](bold-template-pack/templates/) | 仅所选大胆模板的详细设计系统文档 | 阶段 3 用户选定后 |
| [viewport-base.css](viewport-base.css) | 必选的固定舞台 CSS——复制进每份演示 | 阶段 3（生成） |
| [html-template.md](html-template.md) | HTML 结构、JS 特性、代码质量标准 | 阶段 3（生成） |
| [animation-patterns.md](animation-patterns.md) | CSS/JS 动画片段与"效果→感受"对照指南 | 阶段 3（生成） |
| [scripts/extract-pptx.py](scripts/extract-pptx.py) | PPT 内容提取的 Python 脚本 | 阶段 4（转换） |
| [scripts/deploy.sh](scripts/deploy.sh) | 把演示部署到 Vercel 即时分享 | 阶段 6（分享） |
| [scripts/export-pdf.sh](scripts/export-pdf.sh) | 把演示导出为 PDF | 阶段 6（分享） |
