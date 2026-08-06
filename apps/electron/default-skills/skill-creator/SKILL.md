---
name: skill-creator
description: 创建新技能、修改并改进现有技能、衡量技能表现。当用户想从零创建技能、编辑或优化已有技能、运行 eval 测试技能、用方差分析基准测试技能表现，或优化技能的 description 以提高触发准确性时使用。创建技能、写 skill、评估技能、基准测试、优化触发词时使用。
version: "1.1.2"
---

# Skill Creator（技能创建器）

一个用于创建新技能并迭代改进它们的技能。

从高层来看，创建技能的过程大致如下：

- 决定你希望技能做什么，以及大致如何做
- 编写技能草稿
- 创建几个测试提示词，让能访问该技能的 claude 运行它们
- 帮助用户定性和定量地评估结果
  - 在后台运行的同时，如果还没有定量评估就起草一些（如果有，可以直接使用，或在你觉得需要修改时进行修改）。然后向用户解释它们（如果已存在，就解释已有的那些）
  - 使用 `eval-viewer/generate_review.py` 脚本向用户展示结果供其查看，同时让他们查看定量指标
- 根据用户对结果的评估反馈重写技能（以及定量基准暴露出的任何明显缺陷）
- 重复直到满意
- 扩大测试集，在更大规模上再试一次

使用本技能时，你的工作是判断用户处于这个流程的哪个阶段，然后介入并帮助他们推进这些阶段。例如，他们可能会说"我想为 X 做一个技能"。你可以帮助缩小他们的意思、编写草稿、编写测试用例、弄清他们想如何评估、运行所有提示词并重复。

另一方面，也许他们已经有了技能草稿。这种情况下你可以直接进入评估/迭代环节。

当然，你应该始终保持灵活，如果用户说"我不需要跑一堆评估，只要跟我一起凭感觉来"，你也可以这么做。

技能完成后（同样，顺序是灵活的），你还可以运行技能描述优化器——我们有专门的独立脚本——来优化技能的触发效果。

明白了吗？好。

## 与用户沟通

技能创建器可能被编程术语熟悉程度差异很大的人使用。如果你还没听说过（你怎么会听说呢，这只是最近才兴起的趋势），现在有个趋势是 Claude 的力量激励水管工打开他们的终端，父母和祖父母去谷歌搜"how to install npm"。另一方面，大部分用户可能相当熟悉计算机。

所以请注意上下文线索，决定如何措辞你的沟通！在默认情况下，给你一些参考：

- "evaluation" 和 "benchmark" 处于临界点，但可以用
- 对于 "JSON" 和 "assertion"，你需要看到用户明显熟悉这些概念的线索，才能不解释地使用它们

如果不确定，简要解释一下术语是可以的；如果你不确定用户是否能理解，可以自由地用简短定义澄清术语。

---

## 创建技能

### 捕捉意图

首先理解用户的意图。当前对话可能已经包含用户想要固化的工作流（例如，他们说"把这个变成技能"）。如果是这样，先从对话历史中提取答案——使用过的工具、步骤顺序、用户做的修正、观察到的输入/输出格式。用户可能需要补充空缺，并且应该确认后再进入下一步。

1. 这个技能应该让 Claude 能做什么？
2. 这个技能应该在什么时候触发？（哪些用户短语/上下文）
3. 预期的输出格式是什么？
4. 我们是否应该设置测试用例来验证技能是否有效？输出可客观验证的技能（文件转换、数据提取、代码生成、固定工作流步骤）适合有测试用例。输出主观的技能（写作风格、艺术）通常不需要。根据技能类型建议合适的默认值，但让用户决定。

### 访谈与研究

主动询问边界情况、输入/输出格式、示例文件、成功标准和依赖。在把这块敲定之前，先不要写测试提示词。

检查可用的 MCP——如果对研究有用（搜索文档、查找类似技能、查阅最佳实践），有子代理时并行研究，否则内联研究。带着上下文来，减轻用户的负担。

### 编写 SKILL.md

根据用户访谈，填充以下组成部分：

- **name**：技能标识符
- **description**：何时触发、做什么。这是主要的触发机制——既要包含技能做什么，也要包含何时使用的具体上下文。所有"何时使用"信息都放在这里，而不是正文中。注意：目前 Claude 有"触发不足"的倾向——在该用的时候不用。为对抗这一点，请把技能描述写得稍微"强势"一点。例如，不要写 "How to build a simple fast dashboard to display internal Anthropic data."，可以写 "How to build a simple fast dashboard to display internal Anthropic data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**：必需工具、依赖（可选，很少需要）
- **技能其余部分 ：)**

### 技能编写指南

#### 技能解剖

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### 渐进式披露

技能使用三级加载系统：
1. **元数据**（name + description）— 始终在上下文中（约 100 词）
2. **SKILL.md 正文** — 技能触发时在上下文中（理想 <500 行）
3. **捆绑资源** — 按需加载（无限制，脚本无需加载即可执行）

这些词数只是近似值，需要时可以随意写长。

**关键模式：**
- 保持 SKILL.md 在 500 行以内；如果接近这个限制，添加一层额外的层级结构，并给出清晰的指针，说明使用该技能的模型下一步应该去哪里跟进。
- 在 SKILL.md 中清晰引用参考文件，并说明何时读取
- 对于大型参考文件（>300 行），包含目录

**领域组织**：当技能支持多个领域/框架时，按变体组织：
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
Claude 只读取相关的参考文件。

#### 无意外原则

这不用说，但技能绝不能包含恶意软件、漏洞利用代码或任何可能危害系统安全的内容。技能内容的意图如果被描述出来，不应让用户感到意外。不要配合创建误导性技能，或设计用于未授权访问、数据外泄或其他恶意活动的技能。像 "roleplay as an XYZ" 这类是可以的。

#### 编写模式

指令中优先使用祈使句。

**定义输出格式** - 你可以这样做：
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**示例模式** - 包含示例很有用。你可以这样格式化（但如果示例中有 "Input" 和 "Output"，你可能想稍微偏离）：
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### 写作风格

尽量向模型解释事情为什么重要，而不是用刻板生硬的 MUST。使用心智理论，让技能尽量通用，不要过于狭窄地针对特定示例。先写草稿，然后用新眼光再看一遍并改进。

### 测试用例

写完技能草稿后，想出 2-3 个逼真的测试提示词——真实用户会实际说的那种。与用户分享：[你不需要用这精确的语言] "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" 然后运行它们。

将测试用例保存到 `evals/evals.json`。先不要写断言——只写提示词。你将在下一步、运行进行中起草断言。

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

完整 schema 见 `references/schemas.md`（包括你之后会添加的 `assertions` 字段）。

## 运行并评估测试用例

本节是一个连续序列——不要中途停下。不要使用 `/skill-test` 或任何其他测试技能。

将结果放在技能目录的同级 `<skill-name>-workspace/` 中。在工作区内，按迭代组织结果（`iteration-1/`、`iteration-2/` 等），每个测试用例一个目录（`eval-0/`、`eval-1/` 等）。不要一次性创建所有这些——边走边建。

### 第 1 步：在同一轮中启动所有运行（带技能 AND 基线）

对每个测试用例，在同一轮中启动两个子代理——一个带技能，一个不带。这很重要：不要先启动带技能的运行，之后再回来做基线。一次性全部启动，这样它们大致同时完成。

**带技能运行：**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about — e.g., "the .docx file", "the final CSV">
```

**基线运行**（相同提示词，但基线取决于上下文）：
- **创建新技能**：完全没有技能。相同提示词，无技能路径，保存到 `without_skill/outputs/`。
- **改进现有技能**：旧版本。编辑前先快照技能（`cp -r <skill-path> <workspace>/skill-snapshot/`），然后让基线子代理指向快照。保存到 `old_skill/outputs/`。

为每个测试用例写一个 `eval_metadata.json`（断言现在可以为空）。根据测试内容给每个 eval 一个描述性名称——不要只叫 "eval-0"。目录也使用这个名称。如果本轮使用了新的或修改过的 eval 提示词，为每个新 eval 目录创建这些文件——不要假设它们会从上一轮延续。

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### 第 2 步：运行进行中，起草断言

不要干等运行结束——这段时间可以高效利用。为每个测试用例起草定量断言并向用户解释。如果 `evals/evals.json` 中已有断言，审查它们并解释各自检查什么。

好的断言是客观可验证的，并且有描述性名称——它们应该在基准查看器中清晰可读，让人一眼就能理解每条检查什么。主观技能（写作风格、设计质量）更适合定性评估——不要强行把需要人类判断的东西做成断言。

起草完成后，用断言更新 `eval_metadata.json` 文件和 `evals/evals.json`。同时向用户解释他们在查看器中会看到什么——既有定性输出，也有定量基准。

### 第 3 步：运行完成时，捕获时间数据

每个子代理任务完成时，你会收到包含 `total_tokens` 和 `duration_ms` 的通知。立即将此数据保存到运行目录的 `timing.json` 中：

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

这是捕获这些数据的唯一机会——它通过任务通知传来，不会持久化到其他地方。每条通知到达时就处理，而不是试图批量处理。

### 第 4 步：评分、汇总并启动查看器

所有运行完成后：

1. **给每次运行评分** — 启动一个评分子代理（或内联评分），读取 `agents/grader.md` 并根据输出评估每条断言。将结果保存到每个运行目录的 `grading.json` 中。grading.json 的 expectations 数组必须使用字段 `text`、`passed` 和 `evidence`（不能用 `name`/`met`/`details` 或其他变体）——查看器依赖这些精确字段名。对于可以程序化检查的断言，编写并运行脚本而不是目测——脚本更快、更可靠，并且可以在迭代间复用。

2. **汇总为基准** — 从 skill-creator 目录运行汇总脚本：
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   这会生成 `benchmark.json` 和 `benchmark.md`，包含每种配置的 pass_rate、时间和 token 数，带 mean ± stddev 和差值。如果手动生成 benchmark.json，参见 `references/schemas.md` 了解查看器期望的确切 schema。
把每个 with_skill 版本放在其基线对应物之前。

3. **做一次分析师通读** — 阅读基准数据，找出汇总统计可能掩盖的模式。参见 `agents/analyzer.md`（"Analyzing Benchmark Results" 部分）了解要关注什么——比如无论技能如何总是通过的断言（无区分度）、高方差 eval（可能不稳定）、时间/token 权衡。

4. **启动查看器**，同时展示定性输出和定量数据：
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```
   第 2 次及以后的迭代，还要传 `--previous-workspace <workspace>/iteration-<N-1>`。

   **Cowork / headless 环境：** 如果 `webbrowser.open()` 不可用或环境没有显示器，使用 `--static <output_path>` 写一个独立 HTML 文件，而不是启动服务器。用户点击 "Submit All Reviews" 时，反馈会作为 `feedback.json` 文件下载。下载后，把 `feedback.json` 复制到工作区目录，供下一次迭代拾取。

注意：请使用 generate_review.py 创建查看器；没有必要写自定义 HTML。

5. **告诉用户**类似这样的话："I've opened the results in your browser. There are two tabs — 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

### 用户在查看器中看到什么

"Outputs" 标签页一次显示一个测试用例：
- **Prompt**：给定的任务
- **Output**：技能产出的文件，尽可能内联渲染
- **Previous Output**（第 2 次+ 迭代）：折叠区块，显示上一轮的输出
- **Formal Grades**（如果运行了评分）：折叠区块，显示断言通过/失败
- **Feedback**：文本框，输入时自动保存
- **Previous Feedback**（第 2 次+ 迭代）：他们上次的评论，显示在文本框下方

"Benchmark" 标签页显示统计摘要：每种配置的通过率、时间和 token 用量，含每个 eval 的明细和分析师观察。

通过 prev/next 按钮或方向键导航。完成后，他们点击 "Submit All Reviews"，所有反馈会保存到 `feedback.json`。

### 第 5 步：读取反馈

当用户告诉你他们完成了，读取 `feedback.json`：

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

空反馈意味着用户认为没问题。把你的改进重点放在用户有具体意见的测试用例上。

完成后杀掉查看器服务器：

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## 改进技能

这是循环的核心。你已经运行了测试用例，用户审查了结果，现在你需要根据他们的反馈让技能变得更好。

### 如何思考改进

1. **从反馈中泛化。** 大局是，我们试图创造可以被使用一百万次（也许字面上，甚至更多谁知道呢）的技能，跨越许多不同的提示词。在这里，你和用户在少数几个例子上反复迭代，因为这有助于更快推进。用户对这些例子了如指掌，评估新输出很快。但如果你和用户共同开发的技能只对这些例子有效，那就没用了。与其加入琐碎的过拟合修改，或压迫性的 MUST，不如在遇到顽固问题时尝试扩展，使用不同的隐喻，或推荐不同的工作模式。尝试的成本相对低廉，也许你会撞上好东西。

2. **保持提示词精简。** 删除没有贡献价值的东西。务必阅读对话记录，而不只是最终输出——如果看起来技能让模型浪费大量时间做无产出的事情，你可以尝试删除导致该行为的技能部分，看看会发生什么。

3. **解释为什么。** 尽最大努力解释你要求模型做的每件事背后的**为什么**。今天的 LLM 很*聪明*。它们有良好的心智理论，在好的 harness 下可以超越机械指令，真正让事情发生。即使用户的反馈简短或沮丧，也要真正理解任务以及用户为什么写他们写的东西、他们实际写了什么，然后把这种理解传递到指令中。如果你发现自己写了大写的 ALWAYS 或 NEVER，或使用了超级僵化的结构，那是个黄旗——如果可能，重新表述并解释推理，让模型理解你要求的事情为什么重要。这是一种更人性化、更有力、更有效的方法。

4. **寻找跨测试用例的重复工作。** 阅读测试运行的对话记录，注意子代理是否都独立编写了类似的辅助脚本，或对某事采用了相同的多步骤方法。如果全部 3 个测试用例都导致子代理写了一个 `create_docx.py` 或 `build_chart.py`，这是强信号：技能应该捆绑那个脚本。写一次，放进 `scripts/`，告诉技能使用它。这能省去未来每次调用重新发明轮子。

这个任务相当重要（我们试图在这里创造每年数十亿的经济价值！），你的思考时间不是瓶颈；慢慢来，真正深思熟虑。我建议写一个修改草稿，然后重新审视并改进。尽最大努力进入用户的头脑，理解他们想要和需要什么。

### 迭代循环

改进技能后：

1. 应用你对技能的改进
2. 把所有测试用例重新运行到新的 `iteration-<N+1>/` 目录，包括基线运行。如果创建新技能，基线总是 `without_skill`（无技能）——它在各迭代间保持不变。如果改进现有技能，用你的判断决定什么作为基线合理：用户最初带来的原始版本，还是上一轮迭代。
3. 用指向上一轮迭代的 `--previous-workspace` 启动查看器
4. 等用户审查并告诉你就绪
5. 读取新反馈，再次改进，重复

持续进行直到：
- 用户表示满意
- 反馈全部为空（一切看起来都好）
- 没有取得有意义的进展

---

## 高级：盲比较

对于想要更严格比较两个技能版本的情况（例如，用户问"新版本真的更好吗？"），有盲比较系统。阅读 `agents/comparator.md` 和 `agents/analyzer.md` 了解细节。基本思路是：给一个独立代理两个输出，不告诉它哪个是哪个，让它评判质量。然后分析赢家为什么赢。

这是可选的，需要子代理，大多数用户用不到。人工审查循环通常就足够了。

---

## 描述优化

SKILL.md frontmatter 中的 description 字段是决定 Claude 是否调用技能的主要机制。创建或改进技能后，主动提议优化 description 以提高触发准确性。

### 第 1 步：生成触发 eval 查询

创建 20 个 eval 查询——混合应触发和不应触发的。保存为 JSON：

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

查询必须真实，是 Claude Code 或 Claude.ai 用户会实际输入的。不是抽象请求，而是具体、明确、有足够细节的请求。例如，文件路径、关于用户工作或处境的个人上下文、列名和值、公司名、URL。一点点背景故事。有些可能是小写或包含缩写、错别字或口语。混合不同长度，重点关注边界情况而不是清晰明确的（用户会有机会签署确认）。

不好：`"Format this data"`、`"Extract text from PDF"`、`"Create a chart"`

好：`"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

对于**应触发**查询（8-10 个），考虑覆盖面。你想要同一意图的不同表述——有些正式，有些随意。包括用户没有明确说出技能或文件类型但显然需要的情况。加入一些不常见用例，以及本技能与另一个技能竞争但应该胜出的情况。

对于**不应触发**查询（8-10 个），最有价值的是接近错过的——与技能共享关键词或概念但实际上需要别的东西的查询。考虑相邻领域、天真的关键词匹配会触发但不应触发的模糊措辞，以及查询触及技能能做的事但在另一个工具更合适的上下文中。

关键要避免的：不要做显然无关的不应触发查询。给 PDF 技能做 "write a fibonacci function" 负测试太容易了——它什么都不测。负例应该真正棘手。

### 第 2 步：与用户一起审查

使用 HTML 模板向用户展示 eval 集供审查：

1. 从 `assets/eval_review.html` 读取模板
2. 替换占位符：
   - `__EVAL_DATA_PLACEHOLDER__` → eval 项的 JSON 数组（不要加引号——它是 JS 变量赋值）
   - `__SKILL_NAME_PLACEHOLDER__` → 技能名称
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → 技能当前的 description
3. 写入临时文件（例如 `/tmp/eval_review_<skill-name>.html`）并打开它：`open /tmp/eval_review_<skill-name>.html`
4. 用户可以编辑查询、切换 should-trigger、添加/删除条目，然后点击 "Export Eval Set"
5. 文件下载到 `~/Downloads/eval_set.json` —— 检查 Downloads 文件夹中最近版本，以防有多个（例如 `eval_set (1).json`）

这一步很重要——糟糕的 eval 查询会导致糟糕的 description。

### 第 3 步：运行优化循环

告诉用户："This will take some time — I'll run the optimization loop in the background and check on it periodically."

将 eval 集保存到工作区，然后在后台运行：

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

使用你系统提示词中的模型 ID（驱动当前会话的那个），这样触发测试与用户实际体验一致。

运行期间，定期 tail 输出，向用户更新当前在哪一轮迭代、分数如何。

这会自动处理完整的优化循环。它把 eval 集分成 60% 训练和 40% 留出测试，评估当前 description（每个查询运行 3 次以获得可靠的触发率），然后调用 Claude 根据失败情况提出改进。它在训练和测试上都重新评估每个新 description，最多迭代 5 次。完成后，它会在浏览器中打开 HTML 报告显示每轮迭代的结果，并返回带 `best_description` 的 JSON——按测试分数而非训练分数选择，以避免过拟合。

### 技能触发如何工作

理解触发机制有助于设计更好的 eval 查询。技能出现在 Claude 的 `available_skills` 列表中，带 name + description，Claude 根据该 description 决定是否查阅技能。重要的一点是：Claude 只为它自己不容易处理的任务查阅技能——像 "read this PDF" 这样简单的一步查询即使 description 完美匹配也可能不触发技能，因为 Claude 可以用基本工具直接处理。复杂、多步骤或专业化的查询在 description 匹配时可靠触发技能。

这意味着你的 eval 查询应该足够实质，让 Claude 真正受益于查阅技能。像 "read file X" 这样的简单查询是糟糕的测试用例——无论 description 质量如何它们都不会触发技能。

### 第 4 步：应用结果

从 JSON 输出中取 `best_description` 并更新技能的 SKILL.md frontmatter。向用户展示前后对比并报告分数。

---

### 打包并展示（仅在 `present_files` 工具可用时）

检查你是否能访问 `present_files` 工具。如果没有，跳过此步。如果有，打包技能并向用户展示 .skill 文件：

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

打包后，把生成的 `.skill` 文件路径告诉用户，方便他们安装。

---

## Claude.ai 专属说明

在 Claude.ai 中，核心工作流相同（草稿 → 测试 → 审查 → 改进 → 重复），但因为 Claude.ai 没有子代理，一些机制会改变。以下是如何适配：

**运行测试用例**：没有子代理意味着无法并行执行。对每个测试用例，读取技能的 SKILL.md，然后按照其指令自己完成测试提示词。一次做一个。这不如独立子代理严格（你写了技能也在运行它，所以你有完整上下文），但它是有用的健全性检查——而且人工审查步骤可以弥补。跳过基线运行——直接用技能按要求完成任务即可。

**审查结果**：如果无法打开浏览器（例如 Claude.ai 的虚拟机没有显示器，或你在远程服务器上），完全跳过浏览器查看器。改为直接在对话中展示结果。对每个测试用例，展示提示词和输出。如果输出是需要用户看到的文件（如 .docx 或 .xlsx），保存到文件系统并告诉他们位置，方便下载查看。内联询问反馈："How does this look? Anything you'd change?"

**基准测试**：跳过定量基准——它依赖基线比较，没有子代理就没有意义。专注于用户的定性反馈。

**迭代循环**：和之前一样——改进技能、重新运行测试用例、询问反馈——只是中间没有浏览器查看器。如果你有文件系统，仍然可以把结果组织到文件系统的迭代目录中。

**描述优化**：本节需要 `claude` CLI 工具（特别是 `claude -p`），只在 Claude Code 中可用。在 Claude.ai 上跳过。

**盲比较**：需要子代理。跳过。

**打包**：`package_skill.py` 脚本只要有 Python 和文件系统就能在任何地方运行。在 Claude.ai 上，你可以运行它，用户可以下载生成的 `.skill` 文件。

**更新现有技能**：用户可能要求你更新现有技能，而不是创建新的。这种情况下：
- **保留原始名称。** 注意技能的目录名和 `name` frontmatter 字段——原样使用。例如，如果已安装技能是 `research-helper`，输出 `research-helper.skill`（不是 `research-helper-v2`）。
- **编辑前复制到可写位置。** 已安装技能路径可能是只读的。复制到 `/tmp/skill-name/`，在那里编辑，从副本打包。
- **如果手动打包，先在 `/tmp/` 暂存**，然后复制到输出目录——直接写入可能因权限失败。

---

## Cowork 专属说明

如果你在 Cowork 中，主要要知道的是：

- 你有子代理，所以主工作流（并行启动测试用例、运行基线、评分等）都可用。（不过，如果遇到严重的超时问题，串行运行测试提示词也是可以的。）
- 你没有浏览器或显示器，所以生成 eval 查看器时，用 `--static <output_path>` 写独立 HTML 文件，而不是启动服务器。然后提供一个链接，用户点击即可在浏览器中打开 HTML。
- 不知为何，Cowork 环境似乎让 Claude 在运行测试后不愿生成 eval 查看器，所以再强调一遍：无论你在 Cowork 还是 Claude Code，运行测试后，你都应该总是生成 eval 查看器供人类查看示例，然后再自己修改技能并尝试修正，使用 `generate_review.py`（不要写你自己的定制 html 代码）。提前道歉，但我要全大写：GENERATE THE EVAL VIEWER *BEFORE* evaluating inputs yourself. 你要尽快把它们放到人类面前！
- 反馈方式不同：因为没有运行中的服务器，查看器的 "Submit All Reviews" 按钮会把 `feedback.json` 作为文件下载。你可以从那里读取（你可能需要先请求访问权限）。
- 打包可用——`package_skill.py` 只需要 Python 和文件系统。
- 描述优化（`run_loop.py` / `run_eval.py`）在 Cowork 中应该正常工作，因为它通过 subprocess 使用 `claude -p`，不依赖浏览器，但请等到你完全完成技能制作并且用户同意状态良好后再做。
- **更新现有技能**：用户可能要求你更新现有技能，而不是创建新的。遵循上面 claude.ai 部分中的更新指导。

---

## 参考文件

agents/ 目录包含专门子代理的指令。需要启动相应子代理时读取它们。

- `agents/grader.md` — 如何根据输出评估断言
- `agents/comparator.md` — 如何做两个输出间的盲 A/B 比较
- `agents/analyzer.md` — 如何分析一个版本为何击败另一个

references/ 目录有更多文档：
- `references/schemas.md` — evals.json、grading.json 等的 JSON 结构

---

最后再强调一遍核心循环：

- 弄清楚技能是关于什么的
- 起草或编辑技能
- 在测试提示词上运行能访问技能的 claude
- 与用户一起评估输出：
  - 创建 benchmark.json 并运行 `eval-viewer/generate_review.py` 帮助用户审查
  - 运行定量 eval
- 重复直到你和用户都满意
- 打包最终技能并交还给用户

如果有 TodoList，请把步骤加到其中，确保不会忘记。如果你在 Cowork 中，请特别把 "Create evals JSON and run `eval-viewer/generate_review.py` so human can review test cases" 放进 TodoList 确保执行。

祝你好运！
