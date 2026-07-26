# LuxCoder 使用指南

最后更新：2026 年 7 月

---

## 1. LuxCoder 是什么

<video src="https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/luxcoder-promo-30s.mp4" controls poster="https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/promo-thumbnail.png" style="max-width:100%;border-radius:12px;margin:1rem 0;"></video>

LuxCoder 是一个本地优先的 AI Agent 桌面工作台，面向研发、产品、测试、研究和知识工作场景。

顶部只有两种工作模式：

| 模式 | 适合做什么 |
|------|------------|
| **Chat** | 问答、分析、写作、文档阅读、多模型比较，不需要直接操作本地环境 |
| **Code** | 读写文件、执行命令、修改代码、深度研究、项目管理、任务编排和自动化 |

**一个简单判断**：只需要回答时用 Chat；需要行动并交付结果时用 Code。

![Code 模式界面](https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/code-mode-empty-state.png)

Projects & Kanban 不再是独立顶层模式，而是 Code 内的工作视图。进入 Code 后，可以在"会话"和"看板"之间切换。

---

## 2. 五分钟快速开始

### 第一步：配置模型渠道

打开 **设置 → 模型配置**，添加至少一个渠道。

你可以使用：

- API Key 渠道：Anthropic、OpenAI、Google、DeepSeek、Kimi、智谱、通义、豆包、OpenRouter、自定义兼容端点等；
- **ChatGPT 订阅登录**：通过 Codex OAuth 使用 ChatGPT 订阅；
- **Claude Pro / Max 订阅登录**：通过浏览器授权使用 Claude 订阅。

API Key 渠道的可用范围取决于协议和模型能力；ChatGPT 订阅与 Claude Pro / Max 订阅当前仅用于 Code 模式，请勿在 Chat 中选择订阅登录渠道。

### 第二步：选择 Chat 或 Code

- 想讨论方案、阅读文档、比较模型回答：选择 **Chat**；
- 想修改文件、运行命令、处理项目或执行多步骤任务：选择 **Code**。

### 第三步：创建或选择 Workspace

在 Code 左侧栏顶部使用 Workspace 切换器。Workspace 是 LuxCoder 的隔离与能力容器，用于管理会话、Skills、MCP、Memory、Projects 和共享资料。

Workspace 不等于某个代码仓库。一个 Workspace 可以包含多个 Project，也可以附加多个外部目录。

### 第四步：为工程创建 Project

在 Code 左侧栏的会话筛选菜单中，将“分组方式”设为“项目”，然后点击项目标题旁的 `+` 创建 Project，并设置：

- Project 名称和颜色；
- 实际工程目录 `workingDirectory`；
- 描述、参考资料和项目记忆；
- 可选的默认 Agent 专家。

随后从该 Project 新建会话，Agent 会收到明确的工程目录与项目上下文。

### 第五步：发起第一个任务

推荐写清目标、范围、限制和验收标准。例如：

> 请检查当前项目的登录流程，先定位根因并给出方案。不要修改数据库结构；实现后运行相关测试，并说明改动文件和风险。

---

## 3. 模型渠道与 Agent Runtime

### 渠道、模型、Runtime 的区别

| 概念 | 含义 |
|------|------|
| **渠道** | 模型供应商、订阅账号或企业 API 端点 |
| **模型** | 渠道下可用的具体模型 |
| **Agent Runtime** | 负责工具调用、文件操作、会话恢复和流式执行的运行内核 |

Code 当前默认使用 **Pi Agent Runtime**。Pi 可以使用已启用的多种模型渠道，不要求渠道必须采用 Anthropic 协议。

Claude Pro / Max 订阅渠道是特殊情况：应用会透明使用与订阅凭据兼容的 Claude Runtime。一般用户不需要手动管理 Runtime，只需选择可用渠道和模型。

### 两种订阅登录

#### ChatGPT 订阅（Codex OAuth）

在模型配置中选择 ChatGPT 订阅渠道，按引导完成登录。登录后可在 Code 中使用支持的 Codex 模型；会话标题也会自动生成和随主题更新。

#### Claude Pro / Max 订阅

在模型配置中选择 Claude 订阅渠道，通过浏览器完成授权并粘贴授权结果。凭据支持自动刷新；如果授权失效，模型配置页会提示重新登录。

### 模型选择建议

- 编程、架构和复杂执行：优先选择工具调用稳定、上下文充足的模型；
- 快速分析和文档任务：可选择成本更低、响应更快的模型；
- 看板 Task：先选择主任务的编排模型，再按需给子任务覆盖模型或渠道；
- 自动任务：优先选择稳定模型，并设置合理运行频率和最大运行次数。

---

## 4. Workspace、Project 与目录模型

这是使用 Code 时最重要的心智模型。

### Workspace

Workspace 是 LuxCoder 的顶层隔离容器。每个 Workspace 独立管理：

- Code 会话；
- Skills、MCP 和 Memory；
- Projects；
- `workspace-files/` 跨会话资料；
- 默认工作目录和附加目录。

### Project

Project 是 Workspace 内的工程或业务上下文，主要包含：

- `workingDirectory`：真实代码仓库或工程目录；
- Project 描述和颜色；
- `assets/`：项目参考资料；
- `MEMORY.md`：项目长期上下文；
- 关联会话和 Kanban 看板。

### 会话 cwd

每个 Code 会话都有自己的隔离目录，作为临时工作台和会话 cwd。它不是你的代码仓库。

当会话绑定 Project 时，LuxCoder 会把 Project 的 `workingDirectory` 明确注入上下文，告诉 Agent 应在该工程目录读代码、改代码和运行命令，同时保留会话隔离目录存放 `.context/` 等临时资料。

### 目录示意

```text
~/.luxcoder/agent-workspaces/{workspace}/
├── {session-id}/
│   └── .context/              # 当前会话的临时计划、笔记和交接
├── workspace-files/
│   └── .context/              # 跨会话共享的持久资料
├── mcp.json                    # 当前 Workspace 的 MCP 配置
├── skills/                     # 当前 Workspace 的 Skills
└── projects/
    └── {project}/
        ├── config.json
        ├── assets/
        └── MEMORY.md

你的真实工程目录/                 # 通常位于 Workspace 之外
└── src/ ...                     # 由 Project workingDirectory 指向
```

### 应该把文件放在哪里

| 内容 | 推荐位置 |
|------|----------|
| 当前任务的临时计划、调试记录 | 会话目录 `.context/` |
| 多个会话都会使用的资料 | `workspace-files/` |
| 某个 Project 的长期约定 | Project `MEMORY.md` |
| Project 的参考规范、样例和必要设计资料 | Project `assets/` |
| 真实代码和工程文件 | Project `workingDirectory` |

---

## 5. Chat 模式

![Chat 模式界面](https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/chat-mode-empty-state.png)

Chat 适合不需要直接操作本地环境的任务。

### 主要能力

- 多模型渠道与模型切换；
- 同一问题并排比较多个模型；
- 图片、PDF、Office、代码和文本附件；
- Markdown、Mermaid、KaTeX 和代码高亮；
- 思考模式与上下文长度控制；
- 系统提示词；
- Chat Tools；
- 清空上下文或插入上下文分割；
- 将对话迁移到 Code 继续执行。

### 使用建议

- 一个对话尽量聚焦一个主题；
- 需要模型读取附件时，说明文件用途和期望输出；
- 一旦任务需要修改文件、运行命令或长时间执行，迁移到 Code；
- 比较模型时使用并排模式，不必手动复制问题。

---

## 6. Code 会话

Code 是可执行的 Agent 工作台，支持：

- 读取、创建和修改本地文件；
- Shell、Git 和项目命令；
- Skills、MCP 和浏览器工具；
- Project 上下文和附加目录；
- 文件树、Diff，以及 Markdown、Office、PDF、图片等文件预览；
- 通过浏览器 MCP 打开、检查和调试真实网页；
- 多标签页和后台会话；
- 计划模式、可见进度和协作子会话。

### 绑定 Project

从 Project 下新建会话最稳妥。这样会话会自动获得项目描述、真实工程目录、参考资料和项目记忆。

如果 Agent 去错误目录找代码，请先检查：

1. 会话是否绑定正确 Project；
2. Project 的 `workingDirectory` 是否有效；
3. 是否把会话 cwd 误认为工程目录。

### 权限模式

普通 Code 会话当前提供两种模式：

| 模式 | 行为 |
|------|------|
| **完全自动** | Agent 可连续调用工具和修改文件，适合目标明确且环境可信的任务 |
| **计划模式** | Agent 先调研并提交计划，等待批准后再执行写操作 |

涉及不可逆删除、外部发布、发送消息、付费消耗或安全权限变更时，即使在完全自动模式下，也应明确确认边界。

### 输入框引用

| 输入 | 用途 |
|------|------|
| `@` | 引用文件、目录或上下文 |
| `/` | 选择或触发 Skill |
| `#` | 引用 MCP 能力 |
| `&` | 引用其他会话 |

这些引用会随消息一起发送给 Agent，适合提供精准上下文。

## 7. Projects & Kanban

Code 的看板用于按 Project 整理会话和编排任务。

### 默认三列

| 列 | 含义 |
|----|------|
| **待办** | 尚未开始，或等待安排 |
| **进行中** | 正在推进的工作 |
| **已完成** | 已完成或等待最终验收 |

新会话和轻量任务默认进入“待办”。历史版本中的“收件箱”会自动回退到待办，不需要手动迁移。

### 列与运行状态不是一回事

- **看板列**是用户整理工作的维度；
- **运行状态**是 Agent 或 TaskRunner 的机器生命周期；
- 二者可以暂时不同。

例如，运行中的任务被拖到其他列时，LuxCoder 不会随意把机器运行状态降级；已放入“已完成”列但仍需要验收的任务，会继续显示注意提示。

### 卡片操作

看板卡片支持：

- 打开会话；
- 编辑任务；
- 重命名；
- 归档；
- 删除；
- 在不同列之间拖动。

对单张卡片执行归档或删除时，只处理该卡片本身，不自动级联删除展开的子任务或子会话。

---

## 8. 从轻量任务到正式 Task

### 轻量创建

在看板列中可以直接输入一句目标，快速创建普通会话。适合尚未明确拆解方式的工作。

如果任务后来变复杂，可以通过“编辑任务”升级为正式 Task，不需要重新创建入口。

### TaskEditor

正式 Task 支持：

- 手动编辑任务计划；
- 根据目标“生成初始计划”；
- 将工作拆成有依赖关系的子任务 DAG；
- 设置主任务的编排模型与渠道；
- 为单个子任务覆盖模型和渠道；
- 在 Task 级别统一设置 Agent 专家和工作目录；
- 设置验收标准和最大修复次数；
- 创建、创建并运行、保存并运行；
- 查看各个子任务的真实执行会话。

“生成初始计划”会使用你在编辑器里选择的编排模型、渠道、权限和工作目录，而不是静默回退到全局默认模型。

### 编排模型与子任务模型

- **编排模型**负责理解总目标、生成或维护任务计划；
- 子任务默认继承主任务配置；
- 对特殊子任务可单独覆盖模型和渠道；
- Agent 专家和工作目录由 Task 级配置统一提供。

### Task 执行策略

TaskEditor 中的“自动执行 / 需要确认 / 安全模式”会转换为 Task 会话的执行权限；它们与普通 Code 会话输入栏的“完全自动 / 计划模式”不是同一入口。

---

## 9. 三种容易混淆的 Task

| 名称 | 用途 | 是否创建真实子会话 |
|------|------|--------------------|
| **Kanban Task** | TaskEditor 定义的多节点任务，由 TaskRunner 调度 | 是，每个节点有可追溯会话 |
| **可见进度任务** | Agent 用 TaskCreate / TaskUpdate 展示当前复杂任务进度 | 否，只是进度清单 |
| **collaboration 子会话** | Agent 将独立子问题委派给另一个真实 Agent 会话 | 是，可在侧边栏查看和继续 |

### 侧边栏会话树

Task 子任务和 collaboration 子会话都会跟随父会话显示为层级树。日期、Project、状态、自定义分组和置顶视图都会保留这种父子关系。

Task 节点重跑时，进度按最新节点会话计算，避免把历史重跑重复计数。

---

## 10. collaboration 协作子 Agent

当任务包含多个可以并行推进的独立方向时，Agent 可以创建真实可见的 collaboration 子会话，例如：

- 一个子 Agent 调研前端；
- 一个子 Agent 调研后端；
- 一个子 Agent 独立做风险审查；
- 父 Agent 汇总并决策。

与隐藏的临时 SubAgent 不同，LuxCoder collaboration 子会话：

- 在侧边栏中真实可见；
- 保留完整上下文和结果；
- 可以等待、停止、继续和读取结果；
- 适合长耗时并行调研和对抗性审查。

简单搜索、单文件修改或强顺序任务通常不需要创建子会话，父 Agent 直接完成更高效。

---

## 11. Agent 专家

![Agent 专家页面](https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/agent-experts-page.png)

Agent 专家用于为不同领域提供稳定角色设定。内置方向包括通用软件、驱动、应用、系统、通信、交付管理、系统工程、架构、测试和代码审查等。

你也可以创建自定义专家，并配置角色身份、工作原则、Skills 和 MCP。Project 可将某个专家设为默认专家，Task 也可选择专家。

专家用于提供专业工作方式，不等于单独模型渠道，也不等于 collaboration 子会话。专家绑定的 Skills 和 MCP 当前主要用于 Kanban Task 执行；普通会话仍以当前 Workspace 能力和输入引用为准。

---

## 12. Agent 技能中心：Skills、MCP 与 Memory

从 Code 左侧栏进入 **Agent 技能**，可以统一管理当前 Workspace 的三类能力。

### Skills

![Agent 技能页面](https://github.com/GeoffBao/LuxCoder/releases/download/tutorial-assets/agent-skills-page.png)

Skills 是可复用的工作流、决策规则和 SOP。它们适合沉淀"以后遇到类似任务该按什么步骤做",而不是堆放普通事实。

代表性内置 Skills 包括：

- `luxcoder-coach`：优化 LuxCoder 使用方式和知识沉淀；
- `skill-creator`：创建、改进和测试 Skill；
- `find-skills`：发现可安装的 Skill；
- `agent-collaboration`：判断并组织协作子会话；
- `automation`：创建和维护自动任务；
- `docx`、`pptx`、`xlsx`：处理专业文档；
- `writing-plans`、`executing-plans`：规划和执行复杂实现；
- `session-cleaner`：清洗和渐进读取会话记录。

实际列表会随版本和 Workspace 配置变化，以 Agent 技能页面为准。

### MCP

MCP 是 Agent 的外部工具扩展机制。LuxCoder 支持用户 MCP 和内置 MCP，例如：

- 浏览器导航、截图、DOM、网络与性能分析；
- Automation 自动任务；
- collaboration 协作子会话；
- 创建看板 Task；
- 图像生成或其他外部服务。

在 Agent 技能的 MCP 页面可以查看、启用、禁用和配置 MCP。使用 `#` 可以在输入框中精准引用某个 MCP。

### Memory

Memory 用于跨会话保留稳定经验和用户偏好。LuxCoder 将不同知识放到不同位置：

| 知识类型 | 推荐位置 |
|----------|----------|
| 项目硬约束、架构边界、命令和入口 | Workspace `CLAUDE.md` |
| 用户偏好、误判纠正、跨会话经验 | Auto Memory |
| 可复用流程和 SOP | Skills |
| 当前任务计划和临时记录 | 会话 `.context/` |
| 跨会话长文档和调研 | `workspace-files/` 或 Project 文档 |

不要把所有内容都塞进一个 Memory 文件；让 Agent 根据用途分类维护更可靠。

---

## 13. 自动任务 Automation

自动任务适合无人值守、未来还会运行、结果有持续价值的场景，例如：

- 每天生成项目状态摘要；
- 每周检查依赖或 CI 状态；
- 每隔一段时间监控数据源；
- 两小时后执行一次研究任务；
- 连续观察五次后自动停止。

### 支持的调度方式

- 固定间隔；
- 每日；
- 每周；
- 每月；
- 指定时间执行一次；
- 通过 `maxRuns` 限制最大运行次数。

自动任务还支持：

- 选择 Workspace 和模型；
- 自动创建或复用运行会话：默认同一自然日内复用，跨日新建；
- 暂停和恢复；
- 立即运行；
- 查看运行历史与失败记录；
- 在适用配置下发送执行通知。

### 什么时候不该自动化

- 单纯提醒、闹钟或倒计时；
- 每次都需要用户实时判断才能继续；
- 现在就能完成且不会重复的任务；
- 高风险发布、付款或不可逆操作，除非边界已经明确授权。

你可以从侧边栏进入自动任务页面，也可以直接告诉 Code Agent：“把刚才的流程改成每周一上午自动执行”。

---

## 14. 当前设置入口

当前设置页主要包含：

| 分类 | 功能 |
|------|------|
| **通用设置** | 应用和 Agent 通用行为 |
| **外观设置** | 界面主题与显示偏好 |
| **模型配置** | API 渠道、订阅 OAuth、模型管理 |
| **提示词管理** | Chat 系统提示词 |
| **Chat 工具** | Chat 模式可用工具 |
| **代理设置** | 网络代理 |
| **使用指南** | 打开本教程 |
| **关于/更新** | 版本信息和应用更新 |

Workspace、Projects、Agent 专家、Skills、MCP、Memory 和 Automation 主要从 Code 左侧栏进入，不要在设置页中寻找旧版“Agent 工作区”或“Agent 供应商”入口。

---

## 15. 最佳实践

### 给任务明确边界

高质量任务通常包含：

1. 目标；
2. 相关文件或 Project；
3. 不能改变的现有行为；
4. 验收标准；
5. 是否先研究、是否需要计划模式；
6. 需要运行的测试。

### 复杂任务先研究再实现

涉及架构、第三方方案移植或高回归风险时，先要求 Agent：

- 调研当前实现；
- 对比候选方案；
- 列出需要保护的既有行为；
- 给出测试矩阵；
- 等你批准后再 coding。

### 一个会话聚焦一个目标

任务明显换题时新建会话。需要延续上下文时，可以引用旧会话、Project Memory 或 `.context/` 文档，而不是无限堆积历史消息。

### 用 Project 管工程，用 Workspace 管能力

- 一个 Workspace 可以服务一个团队、业务域或工作类型；
- 一个 Project 通常对应一个代码仓库或明确业务上下文；
- 不要把 Workspace 根目录当作真实工程目录；
- Project `workingDirectory` 应指向实际代码位置。

### 修改前保护已有功能

移植第三方方案或新增功能时，推荐逐项执行：

1. 说明功能价值；
2. 对比 LuxCoder 当前能力；
3. 识别冲突和回归风险；
4. 决定移植、改良、暂缓或跳过；
5. 小批量实现；
6. 定向测试、全局 typecheck 和独立复审；
7. 每一笔单独提交。

---

## 16. 常见问题排查

### Code 找不到项目代码

检查会话是否绑定 Project，以及 Project `workingDirectory` 是否正确。会话 cwd 是隔离工作台，不是代码仓库。

### 模型不可用或提示不支持

检查：

- 渠道是否启用；
- 模型是否仍被供应商支持；
- 当前任务是否真的使用了你选择的渠道和模型；
- 订阅 OAuth 是否需要重新登录；
- 网络代理是否正确。

### Agent 工具或 MCP 不可用

在 Agent 技能 → MCP 中确认已启用，并检查外部命令、Node、npx、API Key 或服务地址是否可用。修改后重新发起一轮 Agent 请求；如果外部 MCP 进程或环境仍未刷新，再尝试新建会话或重启应用。

### 自动任务没有运行

检查任务是否启用、触发时间、Workspace、模型配置、最大运行次数和最近运行记录。如果连续失败，先查看失败原因再恢复。

### 看板列和任务状态不一致

这是允许的：列表示用户整理位置，运行状态表示机器生命周期。根据任务实际情况拖动列或处理注意提示即可。

### 标题没有反映当前主题

新会话会自动生成标题；长会话会在若干真实用户消息节点重新生成。工具结果不会被误算为用户消息。你也可以随时手动重命名会话。

---

如有疑问，可以直接在 Code 中问：

> “请根据当前 LuxCoder 功能告诉我应该用 Chat、Code、Kanban Task、collaboration 还是 Automation，并说明原因。”
