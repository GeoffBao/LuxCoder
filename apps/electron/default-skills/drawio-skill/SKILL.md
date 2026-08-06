---
name: drawio-skill
group: 可视化图表
version: 2.1.1
description: 当用户请求图表、流程图、架构图、ER 图、UML / 时序 / 类图、SysML / MBSE 图（块定义、内部块、需求、参数化）、BPMN 业务流程、泳道 / 跨职能流程图、网络拓扑、基于 Terraform 或 Kubernetes 清单的云架构、ML/DL 模型图（Transformer/CNN/LSTM）、思维导图或任何可视化内容时使用。在解释包含 3 个以上组件、复杂数据流或适合可视化表达的关系时，也应主动使用。最适合需要自定义样式、丰富形状库、泳道或可导出图片（PNG/SVG/PDF/JPG）的图表。生成 .drawio XML，并通过本地 draw.io 桌面 CLI 导出。
license: MIT
homepage: https://github.com/Agents365-ai/drawio-skill
compatibility: Requires draw.io desktop app CLI on PATH (macOS/Linux/Windows). Self-check step requires a vision-enabled model (e.g., Claude Sonnet/Opus); gracefully skipped if unavailable. Optional auto-layout (scripts/autolayout.py) needs Graphviz (dot).
platforms: [macos, linux, windows]
metadata: {"openclaw":{"requires":{"anyBins":["draw.io","drawio"]},"emoji":"📐","os":["darwin","linux","win32"],"install":[{"id":"brew-drawio","kind":"brew","formula":"drawio","bins":["drawio"],"label":"Install draw.io via Homebrew","os":["darwin"]},{"id":"brew-graphviz","kind":"brew","formula":"graphviz","bins":["dot"],"label":"Install Graphviz for optional autolayout.py","os":["darwin"],"optional":true}]},"hermes":{"tags":["drawio","diagram","flowchart","architecture","visualization","uml"],"category":"design","requires_tools":["drawio","draw.io"],"related_skills":["mermaid","excalidraw","plantuml"]},"author":"Agents365-ai","version":"2.1.0"}
---

# Draw.io 图表

## 概述

生成 `.drawio` XML 文件，并使用原生 draw.io 桌面应用 CLI 在本地导出为 PNG/SVG/PDF/JPG。

**支持格式：** PNG、SVG、PDF、JPG — 无需浏览器自动化。

PNG、SVG 和 PDF 导出支持 `--embed-diagram`（`-e`）— 导出的文件包含完整的图表 XML，在 draw.io 中打开即可恢复可编辑图表。使用双扩展名（`name.drawio.png`）表示内嵌了 XML。

## 何时使用 / 何时不使用

**此技能用于：** 精致、精确的图表（架构、网络、严格 UML、ERD）、需要实心不透明填充的场景、10,000+ 现成/品牌形状、泳道或自定义几何形状，并导出为可编辑的 PNG/SVG/PDF。

**不要使用它 — 改走其他工具 — 的场景：**

- 休闲手绘 / 白板风格 → **excalidraw** 或 **tldraw**。
- 以代码形式存在于 git 中 / 在 Markdown 中渲染的图表 → **mermaid**（通用）或 **plantuml**（UML）。
- 自由形式的无限画布草图或手绘笔触 → **tldraw**。

## 内置资源

工作流引用到以下资源时，按需读取 — 它们都不需要一开始就放进上下文。

| 文件 | 何时读取 |
| --- | --- |
| `references/toolbox.md` | 你不确定哪个内置脚本适合请求，或想串联多个脚本时 — 全部 31 个脚本的用途分类地图（创作 / 导入代码 / 导入 IaC / 导入 API 规范 / 实时基础设施 / 对比 / 标注 / 反向导出 / 工具），附 "我有 X，想要 Y → 用 Z" 指南 |
| `references/xml-authoring.md` | 你即将**手写 `.drawio` XML**（工作流步骤 3）时 — 文件骨架、形状/连线单元格、容器、连接点分布、调色板、间距/网格规则。使用内置生成器写 XML 时无需读取 |
| `references/mermaid-authoring.md` | 图表是**无自定义样式/图标需求的标准类型**（流程图、状态、甘特、思维导图、时间线、journey、饼图等），且 CLI **≥ v30** 时 — 用 Mermaid 文本创作，让 CLI 转换为原生 `.drawio`（仅结构，布局免费）。也记录了 CLI 对 XML 的 ELK `--layout` 传递 |
| `references/diagram-types.md` | 用户指定了具体图表类型（ERD、UML 类、时序、C4、架构、ML/DL、流程图、SysML、BPMN、网络拓扑、泳道） |
| `references/shapes.md` + `scripts/shapesearch.py` | 图表需要**特定形状**时 — 云图标（AWS/Azure/GCP）、Cisco/Kubernetes/网络符号、UML/BPMN/ER/电气/P&ID 元素 — 或任何你可能去猜 `style=` 字符串的情况。`shapesearch.py "<keywords>"` 返回 10k+ 形状的官方精确样式 |
| `scripts/aiicons.py` | 图表涉及 **AI/LLM 品牌**（OpenAI、Claude、Gemini、Mistral、Llama、HuggingFace、Ollama、LangChain 等）— `aiicons.py "<brand>"` 返回品牌 logo 的 draw.io `image` 样式（lobe-icons 经 CDN；`--embed` 可内联）。draw.io 没有内置 AI logo。见 `references/shapes.md` → "AI / LLM 品牌 logo" |
| `references/style-presets.md` | 用户要求学习 / 保存 / 列出 / 设为默认 / 删除样式预设，或你已解析出活动预设并需要应用规则时 |
| `references/style-extraction.md` | 你在学习流程中，需要提取步骤时（由 `style-presets.md` 调用） |
| `references/troubleshooting.md` | 导出失败、视觉审查拒绝 PNG、或渲染看起来不对时 |
| `scripts/repair_png.py` | 每次 `-e` PNG 导出之后 — 修复 draw.io 截断的 IEND 块（issue #8） |
| `scripts/encode_drawio_url.py` | CLI 不可用，需要浏览器回退的 diagrams.net URL 时（`--edit` 生成可编辑的编辑器 URL） |
| `references/autolayout.md` | 图表很大或布局密集（依赖/调用图、代码结构、>~15 个节点）时，希望 Graphviz 自动放置节点 + 布线，而不是手放坐标 |
| `scripts/pyimports.py` · `jsimports.py` · `goimports.py` · `rustimports.py` | 用户想可视化 **Python、JS/TS、Go 或 Rust 项目**结构时 — 提取导入图（传递缩减、可选 `--group` 容器、按子包嵌套）供自动布局使用 |
| `scripts/pyclasses.py` | 用户想要 **Python 类层级 / 类图**时 — 提取类 + 继承边（用 `--group` 按模块装箱）供自动布局使用 |
| `scripts/tfimports.py` · `k8simports.py` · `composeimports.py` | 用户想可视化**声明式**基础设施（**Terraform** `.tf`、**Kubernetes** 清单或 **docker-compose**）时 — 提取资源/服务引用图（tf/k8s 自动用官方 AWS/Azure/GCP/K8s 图标；compose 用服务框 + 存储圆柱体）供自动布局使用 |
| `scripts/tfstate.py` · `dockerimports.py` (+ `k8simports.py`) | 用户想画出**实际正在运行 / 已部署**的内容时 — 将 `terraform show -json`（已部署状态）、`docker inspect $(docker ps -q)`（运行中的容器）或 `kubectl get all,ing,cm,secret,pvc -o json`（实时集群，经 k8simports）输入，得到使用相同官方图标的真实拓扑。见 `references/live-infra.md` |
| `scripts/drawiodiff.py` | 用户想**比较 / 对比两个图表或两个快照**（"什么变了"、基础设施漂移）— `drawiodiff.py old.drawio new.drawio -o diff.json` 输出颜色编码的图（新增=绿、删除=红、变更=橙、相同=灰）供自动布局使用。按单元格 id 匹配（导入器/实时快照输出）或用 `--by-label`（手绘） |
| `scripts/timelapse.py` | 用户想要**架构延时摄影 / 看代码库结构在 git 历史中如何演化** — `timelapse.py <dir> --importer pyimports` 在每次抽样的提交上重跑导入器，并组装成自包含的 HTML 播放器（内嵌帧、播放/步进控制）。最适合有真实导入边的包（将 `<dir>` 指向模块根目录） |
| `scripts/explain.py` | 用户想用文字**描述 / 记录 / 总结现有 `.drawio`**（生成的反向操作）— `explain.py diagram.drawio` 输出结构化 Markdown：按容器/层级分组的组件、关系（`A —label→ B`）、多页/C4 的分页小节。适合 README/PR 摘要或纯文本阅读输出 |
| `scripts/drawio2pptx.py` | 用户想要**从图表生成 PowerPoint 演示 / 幻灯片** — `drawio2pptx.py diagram.drawio -o deck.pptx` 将每一页放到独立的 16:9 幻灯片上（页名作标题），多页 **C4 模型**就变成可上台的演示。需要 `python-pptx`（`pip install python-pptx`）+ draw.io CLI |
| `scripts/drawiohtml.py` | 用户想要**可分享的交互式查看器**（平移 / 缩放 / 搜索，无需 draw.io）— `drawiohtml.py diagram.drawio -o viewer.html` 将每页的 SVG 内联进 ONE 个自包含 HTML，带页签、拖拽平移、滚轮缩放、节点搜索（Enter 循环切换 + 居中匹配）和**可用的下钻链接**（C4 模型的 `data:page/id` 链接切换页签）。无服务器、无外部请求 — 可直接发给任何人 |
| `scripts/svgflow.py` | 用户想要**动画 / "流动"图表**（数据流、移动的连线）— `svgflow.py diagram.drawio -o flow.svg` 导出 SVG 并让每条连线成为行军蚁动画（虚线沿箭头移动）。自包含循环 `.svg`，可在 GitHub / 任何浏览器渲染；`--speed` / `--dash` / `--reverse` |
| `scripts/drawio2mermaid.py` | 用户想把 **`.drawio` 转换为 Mermaid 文本**（供 GitHub 渲染的 Markdown 文件的图即代码）— `drawio2mermaid.py diagram.drawio` 输出 `flowchart`（容器 → `subgraph`、保留连线标签、圆柱/菱形形状映射）；`--fenced` 用 ```mermaid 包裹，多页 → 每页一个图。仅结构（样式/图标不保留） |
| `scripts/sqlerd.py` | 用户想要**从 SQL DDL 生成 ER 图** — 将 `CREATE TABLE` 语句解析为每表节点（带 PK/FK 标记的列）和乌鸦脚 FK 连线，供自动布局使用 |
| `scripts/ciimports.py` | 用户想要 **CI 流水线图**（GitHub Actions 工作流或 GitLab CI）— `ciimports.py <repo-root>` 读取 `.github/workflows/*.yml` + `.gitlab-ci.yml`，输出作业（runner、矩阵大小、可复用工作流调用）、`needs:` 依赖边、每工作流触发器节点，以及 stage/工作流容器，供自动布局使用。需要 PyYAML |
| `scripts/openapiimports.py` | 用户想要**从 OpenAPI / Swagger 规范生成 API 图** — `openapiimports.py spec.yaml` 将每个操作映射为一个节点，**按 HTTP 方法着色**（GET 蓝、POST 绿、PUT/PATCH 橙、DELETE 红），外加每个组件 schema 一个节点，连线从操作指向其使用的 schema 及嵌套 schema 之间。`--group` 按 tag 装箱，`--no-schemas` 只显示端点表面；供自动布局使用 |
| `scripts/heatmap.py` | 用户想按数据**给现有 `.drawio` 上色**（成本 / 延迟 / 流量 / 错误率热力图）— `heatmap.py diagram.drawio -m metrics.csv` 将每个指标（CSV `key,value` 或 JSON `{key:value}`）按 id 或标签匹配到节点，沿渐变重新着色（`--palette heat\|cool\|warm`、`--reverse`），可选按数值缩放节点大小（`--size`）并添加图例。可后处理任何图表；照常导出 |
| `scripts/seqlayout.py` | 用户想要**时序图**时 — 用 JSON 描述参与者 + 消息，脚本以确定性方式计算所有生命线/激活/箭头几何（无需手放坐标、无需 Graphviz） |
| `scripts/c4.py` | 用户想要 **C4 模型**（系统上下文 / 容器 / 组件）— 输入层级 JSON，输出多页 `.drawio`，带官方 C4 形状/颜色和层级间**点击下钻**链接 |
| `scripts/relabel.py` | 用户想要现有 `.drawio` 的**语言变体或批量文本替换**（例如英文图表改为中文标签用于双语 README）— `relabel.py diagram.drawio --extract -o labels.json` 导出每个标签为恒等 JSON 映射；翻译值（保留键），然后 `relabel.py diagram.drawio --map labels.json -o diagram_cn.drawio` 替换，布局/样式/id 不变 |
| `scripts/restyle.py` | 用户想**给现有 `.drawio` 重新换主题**（"改成深色"、"给我的图表应用公司风格"）— `restyle.py diagram.drawio --preset <name>` 按色相将每个顶点的填充/描边重映射到预设调色板，应用字体/附加项（深色 fontColor、连线颜色、背景），布局、形状和连线路由保持不变。预设解析同步骤 0（用户目录优先，其次内置） |
| `scripts/edgeports.py` | 连线在汇入形状时**叠在一起** — 常见的泳道/跨职能抱怨，以及任何节点同侧多根连线的情况。`edgeports.py diagram.drawio` 固定 `exitX/exitY`+`entryX/entryY`：为每个节点挑选朝向另一端点的边，然后按**远端端点位置**排序，将该侧连线均匀分配到等距槽位，从而保持相对顺序而不交叉。通过泳道父级解析绝对坐标、跳过你已固定的端点、且幂等。它是**端口分配器，不是路由器** — 它把线在形状边界分开，但不会阻止连线中途穿过无关形状（那需要加路点） |
| `scripts/validate.py` | 你生成了 `.drawio`（尤其是通过自动布局或大型手放图表），想在视觉自检前做一次快速确定性的结构 lint（悬空连线、重复/保留 id、坏父级、重叠）。`--score` 打印可读性评分，用于比较布局变体 |
| `scripts/raster2drawio.py` | 用户有**图表的图片**（白板照片、遗留 PNG、Visio 截图），想要**可编辑的 `.drawio`** — 用自己的视觉读取图片，将节点/连线提取为 JSON（schema 与完整工作流在 `references/derasterize.md`），然后 `raster2drawio.py graph.json -o out.drawio` 遵循这些坐标/标签/形状；缺少 `x`/`y` 的节点回退到 `autolayout.py` 放置 |
| `scripts/buildup.py` | 用户想要图表**逐个节点地自我构建**成视频/GIF（单个静态图表的构建延时摄影 — 与 `timelapse.py` 的 git 历史动画不同）— `buildup.py diagram.drawio` 按拓扑（依赖）顺序揭示单元格，进入自包含 HTML 播放器（播放/暂停/步进/拖拽）；`--gif` 还能导出动画 GIF（需要 Pillow）。需要 draw.io CLI |
| `scripts/compress.py` | 用户想要大图的**高管/董事会摘要** — 将簇折叠（纯 Python 标签传播，无需 networkx）为每个簇一个带标签的节点，并聚合簇间连线，输出 2 页 `.drawio`（高管视图 + 点击下钻到完整原图）。之后 Claude 可语义化重命名簇。需要 Graphviz `dot` |
| `scripts/runbook.py` | 用户想把流程图/决策树 `.drawio` 变成**点击式分诊应用**（值班 runbook）— `runbook.py flow.drawio` 读取 XML（无需 draw.io CLI），输出自包含 HTML runbook：当前步骤文本、每条连线的选择按钮、面包屑轨迹、返回/重启、终态节点结束态 |
| `scripts/prdiff.py` | 你正在 CI 中搭建**自动化 PR 图审查** — 对两个 git ref 之间变更的每个 `.drawio`，渲染 base/head/diff PNG 并输出 Markdown 报告；附带复合 GitHub Action（`.github/actions/drawio-diff/`），发布置顶 PR 评论。见 `references/pr-bot.md` |
| `scripts/tubemap.py` | 用户想要**地铁 / 城市轨道交通图** — 将系统、流水线或旅程画成彩色公交线，带八向（H/V/45°）路由、白色换乘圆圈和站点。编写地铁 JSON（线路 = 整数网格上的有序站点，共享站点 = 换乘），然后 `tubemap.py metro.json -o metro.drawio`。仅标准库；schema 与唯一网格规则在 `references/tubemap.md` |

## 前置条件

The draw.io desktop app must be installed and the CLI accessible:

**macOS 沙箱 / 沙箱隔离说明（例如 codex.app）：** 在某些沙箱化的 macOS 环境中，调用 draw.io 桌面 CLI（甚至 `drawio --version`）可能使 draw.io 进程崩溃或无输出。如果发生这种情况，请将该 CLI 视为**在此沙箱隔离中不可用** — 不要在沙箱内反复重试。任何 CLI 导出工作请优先使用**非沙箱宿主环境**（沙箱隔离之外），或使用浏览器回退 / 仅 XML 输出。

```bash
# macOS（Homebrew — 推荐；CLI 二进制名为 `drawio`，不是 `draw.io`）
brew install --cask drawio
drawio --version

# macOS（若不在 PATH 中则用完整路径）
/Applications/draw.io.app/Contents/MacOS/draw.io --version

# Windows
"C:\Program Files\draw.io\draw.io.exe" --version

# Linux
drawio --version
```

如缺少 draw.io 桌面版请安装：

- macOS：`brew install --cask drawio` 或从 <https://github.com/jgraph/drawio-desktop/releases> 下载
- Windows：从 <https://github.com/jgraph/drawio-desktop/releases> 下载安装包
- Linux：从 <https://github.com/jgraph/drawio-desktop/releases> 下载 `.deb`/`.rpm` — **不要使用 snap**（AppArmor 沙箱在服务器上拒绝 secrets/keyring，会导致崩溃）

## 工作流

开始工作流之前，先评估用户的请求是否足够具体。如果缺少关键细节，提出 1-3 个聚焦问题：

- **图表类型** — 哪个预设？（ERD、UML、时序、架构、ML/DL、流程图、SysML、BPMN、网络、泳道或通用）
- **输出格式** — PNG（默认）、SVG、PDF 还是 JPG？
- **输出位置** — 默认是用户的工作目录；尊重用户给出的任何显式路径（例如"放到 `./artifacts/`"）。用户没提就不要问。
- **范围/保真度** — 多少个组件？有无特定技术或标签？

如果请求已明确这些细节或明显很简单（例如"画一个 X 的流程图"），跳过澄清。

**步骤 0 — 解析活动预设。** 判断本次生成应用了哪个（如果有）用户定义的样式预设。

- 扫描用户消息中是否有明确命名样式预设的措辞："用我的 `<name>` 风格"、"以我的 `<name>` 风格"、"用 `<name>` 模式"、"以 `<name>` 的风格"。裸的 `with <name>` **不算** — "draw a diagram with redis"（用 redis 画图）命名的是组件，不是样式。若有明确匹配 → 活动预设 = `<name>`。
- 否则，检查 `~/.drawio-skill/styles/` 中是否有 `"default": true` 的文件。若有 → 活动预设 = 该文件。
- 否则 → 无活动预设；工作流其余部分回退到内置颜色/形状/连线约定。

从 `~/.drawio-skill/styles/<name>.json` 加载预设 JSON，回退到 `<this-skill-dir>/styles/built-in/<name>.json`。如果命名预设两个位置都不存在，告诉用户该名称未知，列出可用预设（用户目录 + 内置），然后停止 — **不要**静默回退到默认值。

预设加载成功后，在回复的第一行提及：*"Using preset `<name>` (confidence: `<level>`)."*（正在使用预设 `<name>`（置信度：`<level>`））。关于预设如何改变颜色/形状/连线/字体决策，见 `references/style-presets.md` → "应用预设"。

1. **检查依赖** — **先解析本系统上二进制实际叫什么**，并在本工作流的后续每条命令中原样使用该名称。依次尝试：(a) `drawio --version`（Homebrew cask、jgraph `.deb`/`.rpm`、Arch AUR 的规范名称），(b) `draw.io --version`（旧版本构建、部分自定义符号链接、部分发行版包），(c) macOS `.app` 直接调用：`/Applications/draw.io.app/Contents/MacOS/draw.io --version`，(d) Windows：`"C:\Program Files\draw.io\draw.io.exe" --version`。第一个打印出版本的即为你的二进制；记住确切路径/名称，并在下方每条导出命令中用它替换 `drawio`。**如果二进制名不同，不要原样复制示例命令** — 示例用 `drawio` 只是因为最常见。在 macOS-Homebrew 上，`drawio` 只是一个薄封装脚本，exec 到 `/Applications/draw.io.app/Contents/MacOS/draw.io` — 二者运行同一引擎，所以候选 (c) 仅在 `drawio` 封装缺失时需要（例如应用是拖拽安装而非 cask）。**同时记下命令打印的主版本号**：**≥ 30** 解锁 Mermaid→`.drawio` 转换和 ELK `--layout` 传递（见 `references/mermaid-authoring.md`）；在 **≤ 29** 上两者都不可用 — `.mmd` 输入会失败、`--layout` 会破坏参数解析 — 所以绝不要在这些版本上输出这些标志。
2. **规划** — 识别形状、关系、布局（LR 或 TB），按层级/层分组
3. **生成** — 产出 `.drawio` 文件，选择创作模式：**(a) Mermaid → CLI 转换**，当图表是标准类型、无自定义样式/图标需求**且** CLI ≥ v30 时 — 写一个 `.mmd` 并运行 `drawio -x -f xml -o <name>.drawio <name>.mmd`，见 `references/mermaid-authoring.md`（仅结构；布局免费；之后**不要**再 `--layout`）。**(b) 手写 XML**，用于自定义样式、厂商图标、泳道、精确几何 — **先读 `references/xml-authoring.md`**（骨架、单元格形式、调色板、间距规则）。**(c) 内置生成器**，用于下面数据驱动的情况。**对于大型或布局密集的图表（依赖/调用图、代码结构、>~15 个节点），不要手放位置** — 将图描述为 JSON，运行 `python3 <this-skill-dir>/scripts/autolayout.py graph.json -o <name>.drawio`，通过 Graphviz 计算节点位置 + 正交连线路由（见 `references/autolayout.md`；加 `--tune` 可自动挑选更可读的方向）。对于 **Python / JS-TS / Go / Rust 项目**，对应导入器（`scripts/pyimports.py`、`jsimports.py`、`goimports.py` 或 `rustimports.py`）提取导入图（传递缩减；加 `--group` 可按子包装箱模块，深层树嵌套），供自动布局使用；对于 **Python 类层级**，`scripts/pyclasses.py` 改为提取类 + 继承；对于 **Terraform / Kubernetes / docker-compose**（`scripts/tfimports.py`、`k8simports.py`、`composeimports.py`），导入器提取资源/服务引用图 — tf/k8s 节点自动解析为官方云图标；要画**实际正在运行**的内容而非声明式配置，将 `terraform show -json` 管道给 `scripts/tfstate.py`，或 `docker inspect $(docker ps -q)` 管道给 `scripts/dockerimports.py`（`k8simports.py` 已接受实时 `kubectl get ... -o json`）— 见 `references/live-infra.md`；对于 **SQL DDL 生成 ER 图**，`scripts/sqlerd.py` 将 `CREATE TABLE` 解析为表节点 + 乌鸦脚 FK 连线；对于 **OpenAPI / Swagger 规范生成 API 图**，`scripts/openapiimports.py` 将操作（按 HTTP 方法着色）+ 组件 schema 映射为图，供自动布局使用；对于 **CI 流水线图**（GitHub Actions / GitLab CI），`scripts/ciimports.py` 提取作业、`needs:` 连线、触发器以及 stage/工作流容器。要把任何生成的 `.drawio` 变成**指标热力图** — 按成本/延迟/流量/错误的 CSV/JSON 重新着色节点 — 运行 `python3 <this-skill-dir>/scripts/heatmap.py <name>.drawio -m metrics.csv`（按单元格 id 或标签匹配；`--palette`、`--size`、图例）。对于**时序图**，完全跳过自动布局 — 用 JSON 描述参与者 + 消息，运行 `python3 <this-skill-dir>/scripts/seqlayout.py seq.json -o <name>.drawio`（确定性生命线/激活/箭头几何；JSON schema 见脚本 docstring）。对于 **C4 模型**，`python3 <this-skill-dir>/scripts/c4.py c4.json -o <name>.drawio` 输出完整的 Context→Container→Component 多页集合，带下钻链接（schema 在脚本 docstring）。对于可见连线标签很多的复杂架构图，给标签 `labelBackgroundColor=#ffffff;fontSize=11`，并使用连线几何 `x`/`y` 偏移加 `<mxPoint as="offset" />` 把长标签移到附近空白处，而不是依赖 draw.io 默认的中点放置。对于连线穿过形状的手放图表（架构、网络拓扑、部署、UML），在 XML 中修复路由 — 运行 `python3 <this-skill-dir>/scripts/edgeports.py <name>.drawio` 自动将堆叠连线分布到每个形状的周边，然后为仍在中途穿过形状的连线添加 `<Array as="points">` 路点或加大节点间距（见 `references/xml-authoring.md`）。**没有任何 CLI 标志能在不移动节点的情况下重新布线**：每个 `--layout` 预设都是 ELK *节点*布局，会重新放置顶点，而无法识别的值会打开模态错误对话框、挂起无头运行。draw.io 的避障路由器只在编辑器侧。生成任何 `.drawio` 后，在导出前运行 `python3 <this-skill-dir>/scripts/validate.py <name>.drawio` 做快速结构 lint（悬空连线、重复 id、重叠）。默认输出目录是用户的工作目录；如果用户指定了输出路径或目录（如 `./artifacts/`、`docs/images/`），使用它 — 先 `mkdir -p` 目标目录。同样的目录选择也应用于步骤 4 和 7 的 PNG/SVG/PDF 导出。
4. **导出草稿** — 运行 CLI 生成预览 PNG。此步骤**不要传 `-e`** — 它添加的内嵌 `zTXt mxGraphModel` 块会导致视觉 API（含 Claude）在步骤 5 返回 400 "Could not process image"。**用 `--width 2000`（不是 `-s 2`）限制预览宽度** — Claude 的视觉 API 会拒绝大于 2576×2576px 的图片并报 "Unable to resize image — dimensions exceed the 2576x2576px limit"，而对中等或更大的图表，`-s 2` 很容易超过该上限。将干净的预览保存为 `<name>.png`（单扩展名）。内嵌和全分辨率缩放只用于最终导出（步骤 7）。
5. **自检** — 使用 agent 内置视觉能力读取导出的 PNG，捕捉明显问题，在展示给用户前自动修复（需要支持视觉的模型，如 Claude Sonnet/Opus）。如果读取 PNG 返回 400 / "Could not process image" 错误，你几乎肯定是误用了 `-e` 导出 — 不带 `-e` 重新导出并重试一次。仍失败则跳过自检，继续步骤 6。
6. **评审循环** — 将图片展示给用户，收集反馈，应用有针对性的 XML 编辑，重新导出，重复直到通过。
7. **最终导出** — 将已批准的版本重新导出为所有请求的格式。这里使用 `-e`（PNG/SVG/PDF），让交付物在 draw.io 中保持可编辑；保存为 `<name>.drawio.png` 表示内嵌 XML。**对带 `-e` 的 PNG，导出后立即运行 `python3 <this-skill-dir>/scripts/repair_png.py <name>.drawio.png`** — draw.io 的 CLI 会在 `-e` PNG 输出中截断 IEND 块（缺失 8 字节），产生视觉 API 和严格 PNG 解码器都拒绝的损坏文件（issue #8）。报告文件路径。

**如果 `drawio --version` 崩溃或什么都不打印（在受限的 macOS 沙箱隔离中常见，如 codex.app）：**

- 不要在沙箱内反复重试 CLI 调用。
- 跳过步骤 4、5、6 和 7（CLI 导出 + 基于 PNG 的评审），改用**浏览器回退**（`scripts/encode_drawio_url.py`）或只交付 `.drawio` XML。
- 如果用户需要 PNG/SVG/PDF 输出，请让他在**非沙箱宿主环境**（沙箱隔离之外）运行导出命令，并分享生成的文件。

升级规则：

- 如果二进制存在于 PATH（或已知应用路径存在），但执行以异常退出、空输出、Electron 启动失败、显示/会话错误或疑似沙箱限制失败，在回退前优先升级重试一次。
- 如果二进制完全缺失，不要为了更激进地搜索而升级；直接走安装指引或回退。

### 步骤 5：自检

导出草稿 PNG 后，在展示给用户之前，使用 agent 的视觉能力（例如 Claude 的图像输入）读取图片并检查以下问题。如果 agent 不支持视觉，跳过自检，直接展示 PNG。

**重要：** 这里读取的草稿 PNG 必须是**不带** `-e` 导出的。Draw.io 的 `-e` 标志会生成 IEND 块被截断（类型 + CRC 共 8 字节缺失）的 PNG，Anthropic 视觉 API 会以 400 "Could not process image" 拒绝（issue #8）。预览步骤最简单的修复是完全跳过 `-e`；步骤 7 的最终导出保留 `-e` 并运行修复脚本。如果在此处看到 400 错误，不带 `-e` 重新导出并重试一次；仍失败（其他任何原因）则跳过自检，继续步骤 6。

| 检查项 | 查看什么 | 自动修复动作 |
| ------- | ----------------- | ----------------- |
| 形状重叠 | 两个或多个形状堆叠在一起 | 将形状分开 ≥200px |
| 标签被裁切 | 文本在形状边界处被截断 | 增大形状宽度/高度以容纳标签 |
| 缺失连接 | 箭头未视觉连接到形状 | 验证 `source`/`target` id 与现有单元格匹配 |
| 画布外形状 | 形状在负坐标或远离主群组 | 移动到簇附近的正坐标 |
| 连线-形状重叠 | 连线/箭头视觉上穿过无关形状 | 添加路点（`<Array as="points">`）绕开形状，或增大形状间距 |
| 堆叠连线 | 多条连线在同一条路径上重叠 | 将入口/出口点分布到形状周边（使用不同的 exitX/entryX 值） |
| 连线标签重叠 | 连线文本与导出 PNG 中的其他标签、线或节点重叠 | 将标签保留在连线上，加白色标签背景，并用连线几何 `x`/`y` 偏移把标签移到相邻空白处 |

- 最多 **2 轮自检** — 如果 2 次修复后仍有问题，照常展示给用户
- 每次修复后重新导出并重新读取新的 PNG

### 步骤 6：评审循环

自检后，展示导出的图片并征求用户反馈。

**定向编辑规则** — 针对每类反馈，应用最小的 XML 变更：

| 用户请求 | XML 编辑动作 |
| ------------- | ---------------- |
| 改变 X 的颜色 | 按 `value` 匹配 X 找到 `mxCell`，更新 `style` 中的 `fillColor`/`strokeColor` |
| 添加新节点 | 追加新的 `mxCell` 顶点，使用下一个可用 `id`，放在相关节点附近 |
| 删除节点 | 删除 `mxCell` 顶点及所有 `source`/`target` 匹配的连线 |
| 移动形状 X | 更新匹配 `mxCell` 的 `mxGeometry` 中的 `x`/`y` |
| 调整形状 X 大小 | 更新匹配 `mxCell` 的 `mxGeometry` 中的 `width`/`height` |
| 从 A 到 B 添加箭头 | 追加新的 `mxCell` 连线，`source`/`target` 匹配 A 和 B 的 id |
| 更改标签文本 | 更新匹配 `mxCell` 的 `value` 属性 |
| 更改布局方向 | **完全重新生成** — 用新方向重建 XML |

**规则：**

- 单元素变更：就地编辑现有 XML — 保留之前迭代的布局调优
- 布局级变更（例如 LR↔TB 互换、"重来"）：重新生成完整 XML
- 每轮覆盖同一个 `{name}.png`（不带 `-e`）— 不要创建 `v1`、`v2`、`v3` 文件。`-e` 只留给步骤 7 的最终导出
- 应用编辑后重新导出并展示更新后的图片
- 循环持续到用户说通过 / 完成 / LGTM
- **安全阀：** 5 轮迭代后，建议用户直接在 draw.io 桌面中打开 `.drawio` 文件做精细调整

### 步骤 7：最终导出

用户批准后：

- 导出为所有请求的格式（PNG、SVG、PDF、JPG）— 未指定时默认 PNG
- 报告 `.drawio` 源文件和导出图片的文件路径
- **自动启动：** 主动提出在 draw.io 桌面中打开 `.drawio` 文件做微调 — `open diagram.drawio`（macOS）、`xdg-open`（Linux）、`start`（Windows）
- 确认文件已保存并可正常使用

## 样式预设

**样式预设**是捕获用户视觉偏好（调色板、形状、字体、连线）的命名 JSON 文件。激活后，它完全替换本技能的内置颜色/形状约定。

**查找顺序**（当 SKILL.md 的步骤 0 解析出预设名时）：

1. `~/.drawio-skill/styles/<name>.json` — 用户预设（`git pull` 后仍在）
2. `<this-skill-dir>/styles/built-in/<name>.json` — 随附内置（`default`、`corporate`、`handdrawn`、`colorblind-safe`、`dark`）

在任何文件操作前始终将用户提供的名称小写 — schema 强制小写。

**其他一切 — 学习流程（从文件提取预设）、管理操作（list/default/delete/rename）、应用规则（颜色查找、形状关键字、连线、字体、附加项、与图表类型预设的交互）以及校验 — 读取 `references/style-presets.md`。** 仅当用户调用这些流程，或活动预设必须应用到本次生成时，才需要读取。

## 编写 .drawio XML

**手写任何 `.drawio` XML（步骤 3）之前，读取 `references/xml-authoring.md`** — 文件骨架、形状/连线单元格形式、容器、连接点分布、调色板和间距/网格规则都在那里。只有内置生成器替你写 XML 时（`autolayout.py` + 导入器、`seqlayout.py`）才可跳过。

即使在这里也有两条规则值得说明：绝不复用 id `0`/`1`（保留根单元格），且每条连线 `mxCell` 都需要 `<mxGeometry relative="1" as="geometry" />` 子元素 — 自闭合的连线单元格不会渲染。

## 导出

### 命令

有**两种**导出模式：

- **预览 / 自检**（工作流步骤 4）— 不带 `-e`。输出 `diagram.png`。视觉自检必需；在这里用 `-e` 会触发视觉 API 的 400 "Could not process image" 错误（issue #8）。
- **最终 / 交付物**（步骤 7）— 传 `-e`。输出 `diagram.drawio.png`。内嵌 XML 让文件在 draw.io 中保持可编辑。

> 下面所有命令都将 `drawio` 作为你在步骤 1 解析出的二进制的占位符。如果你的二进制在 PATH 中叫 `draw.io`（带点 — 部分旧版或发行版打包安装），请全文替换为 `draw.io`。如果只有 macOS `.app` 或 Windows `.exe` 可用，使用下方几行所示的完整路径变体。

```bash
# 预览 PNG（步骤 4 使用，自检之前）— 无 -e，限制宽度以保持在视觉 API 的 2576px 上限之下
drawio -x -f png --width 2000 -o diagram.png input.drawio

# 最终 PNG（步骤 7，用户批准后）— 带 -e，双扩展名
drawio -x -f png -e -s 2 -o diagram.drawio.png input.drawio

# macOS — 完整路径（若不在 PATH）；预览 / 最终变体
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png --width 2000 -o diagram.png input.drawio
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png -e -s 2 -o diagram.drawio.png input.drawio

# Windows
"C:\Program Files\draw.io\draw.io.exe" -x -f png -e -s 2 -o diagram.drawio.png input.drawio

# Linux（无头 — 需要 xvfb-run；在服务器上添加 HOME 和 --disable-gpu）
export HOME=${HOME:-/tmp}
xvfb-run -a --server-args="-screen 0 1280x1024x24" \
  drawio -x -f png -e -s 2 -o diagram.drawio.png input.drawio --disable-gpu
# 以 root 运行（CI / Docker）？在最后追加 --no-sandbox（放前面会让 drawio 把它当作输入文件名）

# SVG 导出（最终 — -e 安全；SVG 是文本）
drawio -x -f svg -e -o diagram.svg input.drawio

# PDF 导出（最终）
drawio -x -f pdf -e -o diagram.pdf input.drawio

# 自定义输出目录（例如 CI 产物目录）— 先创建再导出
mkdir -p ./artifacts && drawio -x -f png -e -s 2 -o ./artifacts/diagram.drawio.png input.drawio
```

### 导出后 PNG 修复（`-e` PNG 导出后必需）

draw.io CLI 在生成 `-e` PNG 时会截断 IEND 块 — 文件以 4 字节的 IEND 长度字段结束，但 `IEND` 类型 + CRC（8 字节）缺失。结果是：视觉 API 返回 400 "Could not process image"，严格的 PNG 解码器报错。SVG/PDF 不受影响。

每次 `-e` PNG 导出后立即运行：

```bash
python3 <this-skill-dir>/scripts/repair_png.py diagram.drawio.png
```

脚本的 `endswith(IEND)` 守卫使它在 draw.io 上游修复此 bug 后变为空操作 — 无条件运行是安全的。

**关键标志：**

- `-x` — 导出模式（必需）
- `-f` — 格式：`png`、`svg`、`pdf`、`jpg`
- `-e` — 在输出中内嵌图表 XML（PNG、SVG、PDF）— 导出文件在 draw.io 中保持可编辑。**步骤 5 自检所用的预览 PNG 跳过它** — `-e` PNG 的 IEND 块被截断，视觉 API 会拒绝（issue #8）。最终 PNG 导出保留 `-e` 并运行 `scripts/repair_png.py`（见"导出后 PNG 修复"）。SVG/PDF 不受影响。
- `-s` — 缩放：`1`、`2`、`3`（最终 PNG 推荐 2；不要用于步骤 4 的预览 — 见 `--width`）
- `--width <px>` — 目标宽度（像素）（无短形式；`-w` **不存在**，会静默破坏输入文件解析器）。步骤 4 预览用 `--width 2000`，让 PNG 保持在 Claude 的 2576×2576 视觉上限内。对高窄图表还有一个 `--height <px>` 标志。不要把 `--width` 与 `-s` 组合。
- `-o` — 输出文件路径；接受任何目录（例如 `./artifacts/diagram.drawio.png`）— 先 `mkdir -p` 目标目录。内嵌时用 `.drawio.png` 双扩展名。
- `--layout <preset|json>` — **仅 CLI ≥ v30** — 对 XML 输入做生成后布局传递。**只接受** ELK 预设 `verticalFlow`、`horizontalFlow`、`verticalTree`、`horizontalTree`、`radialTree`、`organic`，或 JSON 布局数组 — 它们都会重新放置节点并路由连线；是缺少 Graphviz 时 `autolayout.py` 的替代方案。**任何其他值都会打开模态 `Unknown layout:` 对话框，挂起无头运行** — CLI 上没有仅连线路由模式。绝不与 Mermaid 转换的文件组合（已布局）。在 ≤ 29 上该标志会破坏参数解析 — 不要输出它。见 `references/mermaid-authoring.md`
- `-b` — 图表周围边框宽度（默认：0，建议 10）
- `-t` — 透明背景（仅 PNG）
- `--page-index <n>` — 导出多页文件的某一页。在当前 drawio-desktop 中是 **1 起始**（在 29.7.8 上验证：`--page-index 2` 导出第二页；旧文档声称 0 起始）。默认：第一页。`--page-range 2..3` 也可用

### 浏览器回退（无需 CLI）

当 draw.io 桌面 CLI 不可用时，生成客户端 URL：

```bash
python3 <this-skill-dir>/scripts/encode_drawio_url.py input.drawio          # 只读查看器
python3 <this-skill-dir>/scripts/encode_drawio_url.py --edit input.drawio    # 在编辑器中打开
```

默认打印 `https://viewer.diagrams.net/...#R…` 查看器 URL；`--edit` 打印 `https://app.diagrams.net/...#create=…` URL，直接打开到可编辑编辑器。无论哪种方式，图表 XML 都会 `encodeURIComponent` 编码、deflate 压缩并 base64 进 URL 片段 — 片段（`#` 之后）永远不会发给服务器，所以不会上传任何内容。`encodeURIComponent` 步骤是强制的：没有它，任何包含字面 `%` 或非 ASCII（如 CJK）标签的图表都会让浏览器抛 "URI malformed"，图表永远打不开。

用 `open "$URL"`（macOS）/ `xdg-open "$URL"`（Linux）打开 URL。在 **WSL2 / Windows** 上，`cmd.exe` 会丢弃 `#fragment` — 写一个 `.url` 快捷方式文件并打开它（见 `references/troubleshooting.md` → "WSL2 / Windows specifics"）。

### 回退链

工具不可用时优雅降级：

| 场景 | 行为 |
| ---------- | ---------- |
| draw.io CLI 缺失，Python 可用 | 使用浏览器回退（diagrams.net URL） |
| draw.io CLI 缺失，Python 也缺失 | 只生成 `.drawio` XML；指导用户手动在 draw.io 桌面或 diagrams.net 中打开 |
| draw.io CLI 在 macOS 沙箱隔离中崩溃 / 无输出 | 将 CLI 视为沙箱内不可用；用浏览器回退 / 仅 XML；请用户在非沙箱宿主环境运行 CLI 导出 |
| 自检无视觉能力 | 跳过自检（步骤 5）；直接向用户展示导出的 PNG |
| 导出失败（Chromium/显示问题） | 在 Linux 上重试 `xvfb-run -a`；仍失败则交付 `.drawio` XML 并建议手动导出 |
| Linux 服务器导出失败（无头） | 依次尝试：(1) `xvfb-run -a`，(2) root 时在最后追加 `--no-sandbox`，(3) 加 `--disable-gpu`，(4) `export HOME=/tmp`，(5) 安装 apt 依赖（`libgtk-3-0 libnotify4 libnss3 libgbm1 libasound2t64` 等），(6) 回退到 [tomkludy/drawio-renderer](https://hub.docker.com/r/tomkludy/drawio-renderer) Docker（无头导出的 REST API） |

### 检查 drawio 是否在 PATH 中

```bash
# 优先用 Homebrew / Linux 包二进制名（无点）
if command -v drawio &>/dev/null; then
  DRAWIO="drawio"
# 回退到带点名的二进制（旧安装、手动符号链接）
elif command -v draw.io &>/dev/null; then
  DRAWIO="draw.io"
# macOS .app 包（包内二进制保留点）
elif [ -f "/Applications/draw.io.app/Contents/MacOS/draw.io" ]; then
  DRAWIO="/Applications/draw.io.app/Contents/MacOS/draw.io"
# WSL2: CLI 是 Windows 桌面 exe，经 /mnt/c 访问（注意空格）
elif grep -qi microsoft /proc/version 2>/dev/null && [ -f "/mnt/c/Program Files/draw.io/draw.io.exe" ]; then
  DRAWIO="/mnt/c/Program Files/draw.io/draw.io.exe"
else
  echo "drawio not found — install from https://github.com/jgraph/drawio-desktop/releases (Homebrew: brew install --cask drawio)"
fi
```

在 **WSL2 / 原生 Windows** 上，打开导出文件和浏览器回退 URL 需要路径转换 + `.url` 文件变通（`cmd.exe` 会丢弃 URL `#fragment`）— 见 `references/troubleshooting.md` 中的 "WSL2 / Windows specifics" 小节。

## 常见错误

当某些看起来不对时（导出失败、视觉拒绝 PNG、布局损坏、连线路由错误），见 `references/troubleshooting.md` 中逐行对应的“错误 → 修复”表。

## 图表类型预设

当用户请求特定图表类型时，读取 `references/diagram-types.md` 获取匹配的预设（形状、连线、布局方向）。按用户的措辞选择：

| 用户说 | `references/diagram-types.md` 中的小节 |
| --- | --- |
| "ER 图"、"schema 图"、"数据模型" | ERD |
| "UML 类图"、"类图" | UML Class |
| "时序图"、"交互图"、"生命线" | Sequence |
| "架构"、"系统图"、"服务图" | Architecture |
| "神经网络"、"模型架构"、"ML 图"、"深度学习" | ML / Deep Learning Model |
| "流程图"、"决策树"、"流程" | Flowchart |
| "C4"、"系统上下文图"、"容器图"、"组件图" | C4 Model |
| "SysML"、"MBSE"、"块定义图"、"内部块图"、"需求图"、"参数化图" | SysML |
| "BPMN"、"业务流程"、"流程模型"、"池和泳道"、"工作流图" | BPMN |
| "网络拓扑"、"网络图"、"LAN/WAN"、"子网"、"防火墙图" | Network Topology |
| "泳道图"、"跨职能流程图"、"谁做什么"、"交接图" | Cross-Functional Flowchart |

图表类型预设设置**结构**样式关键字。如果用户样式预设也已激活（见 `## 样式预设`），保留结构关键字，并在其上叠加颜色/字体/连线/附加项 — 合并规则见 `references/style-presets.md` → "与图表类型预设的交互"。
