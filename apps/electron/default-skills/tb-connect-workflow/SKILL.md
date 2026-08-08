---
skill_id: "scenarios/connect_TB_workflow"
name: "connect_TB_workflow"
description: "通过teambition-mcp接入TB系统处理问题单：定位问题单 → 按意图执行【分析模式】（下载日志/分析/输出报告/生成评论草稿，写回由用户确认）或【流转模式】（状态机校验/授权判断/写回流转/巡检）。当用户提到分析TB问题单、下载TB日志、排查TB问题、流转/认领/关闭TB缺陷、TB缺陷单处理、问题单id、teambition问题等场景时调用。若本地任务是从TB看板「加入本地任务」创建的（task.yaml 含 teambitionTaskId），自动识别并直接查询该 TB 问题详情，无需用户再提供编号。"
version: "2.8.0"
optimized-from: "2.4.0"
triggers: "TB问题单, teambition, 日志下载, 问题单分析, 问题单排查, 缺陷流转, 认领缺陷, 缺陷状态, 关闭缺陷, 巡检缺陷, shortId, taskId, 加入本地任务"
argument-hint: "[shortId 或 taskId 或问题描述，或本地 TB 同步任务上下文] + [目标状态（流转模式时）]"
user-invocable: true
disable-model-invocation: false
allowed-tools: "run_mcp, RunCommand, Read, Write, Grep, Glob"

inputs:
  shortId:
    type: "string"
    required: false
    description: "TB 问题单 shortId（如 S87750AA1-12247），对应 QueryTaskV3 的 shortIds 参数"
  taskId:
    type: "string"
    required: false
    description: "TB 系统内部 taskId（如 6a55e310e310a4230f019b12），对应 QueryTaskV3 的 taskId 参数"
  problem_desc:
    type: "string"
    required: false
    description: "可定位问题单的自然语言描述，用于 TQL 或项目内搜索"
  projectId:
    type: "string"
    required: false
    default: ""
    description: "项目 id，用于项目内搜索（SearchProjectTasksV3）"
  local_task:
    type: "object"
    required: false
    description: "本地 Agent 任务（TB 看板「加入本地任务」创建）。从当前任务 task.yaml 读取 teambitionTaskId / title / type，自动作为查询参数，无需用户再提供 shortId 或 taskId"
  mode:
    type: "string"
    required: false
    default: "analyze"
    description: "执行模式：analyze=分析模式（下载日志/分析/输出报告/生成评论草稿，默认）；transition=流转模式（状态机校验/授权/写回流转/巡检）。未指定时按用户意图推断：要求流转/认领/关闭/巡检 → transition；要求分析/日志/排查/报告 → analyze"
  target_status:
    type: "string"
    required: false
    description: "流转模式目标状态（状态名如 Fixed / 状态语义如 已修复/关闭/认领）；缺省时先查状态机列合法目标请示用户"
  inspect_only:
    type: "boolean"
    required: false
    default: false
    description: "流转模式仅巡检：true 则只输出巡检清单，任何写操作（流转/认领/评论）都被禁止"
  force_redownload:
    type: "boolean"
    required: false
    default: false
    description: "分析模式：是否强制重新下载日志，true 则跳过缓存检查"

outputs:
  html_report:
    description: "（分析模式）HTML 展示报告路径 log/{shortId}/分析报告.html（四段式展示版）"
  md_report:
    description: "（分析模式）四段式 Markdown 报告路径 log/{shortId}/分析报告.md（与 html 同源，AI 分析预览优先读取此文件）"
  tb_comment:
    description: "（分析模式）生成四段式评论草稿（默认不自动写回；用户确认后才可由 TB 看板「更新评论」写回）"
  log_dir:
    description: "（分析模式）日志文件目录 log/{shortId}/"
  transition_summary:
    description: "（流转模式）流转结果摘要：如 #349 已从 Open → Fixed，后续该谁处理"
---

# Connect TB Workflow

通过 `teambition-mcp` 接入 Teambition (TB) 系统，根据问题单标识定位对应问题单，下载日志，调用其他 skills 进行分析，输出 HTML 报告并更新问题单评论。

## 引导词

执行过程中必须贯彻以下引导词：

- **"缓存优先"**：下载前检查本地缓存，分析前检查已有输出，状态机/项目/类型元数据能复用不重复拉
- **"根因优先"**：分析模式报告先定位根因，再列表面现象
- **"状态机锁死"**：流转模式目标状态必须来自 MCP 状态机合法推导（kind/pos/rejectStatusIds），不猜、不跳过非法态
- **"写前确认"**：流转模式涉及企业数据变更，写回前必须展示影响清单（谁/什么状态/什么时间）并等待用户确认
- **"精简输出"**：报告与评论聚焦核心信息，去除冗余元数据；流转摘要聚焦「#349 已从 Open → Fixed」+ 后续该谁处理
- **"边界锁死"**：查询参数、下载范围、文件格式、写回边界必须明确，不交给 AI 猜测

## 触发条件

满足以下任一条件时触发：

- 提及关键词组合：`分析` + (`TB系统` | `问题单` | `teambition`) → 分析模式
- 提及关键词：`缺陷` +（`流转` | `认领` | `关闭` | `状态` | `处理`）+（`TB` | `teambition`）→ 流转模式
- 提供了**问题单 shortId**（如 S87750AA1-12247）或完整 taskId
- 提供了**问题描述**且语义上明确指向"在 TB 系统上查找并分析/处理对应问题单"
- 明确要求"下载 TB 日志进行分析" → 分析模式
- 明确要求"流转/认领/关闭/巡检 TB 缺陷单" → 流转模式
- **本地任务上下文识别**：当前执行的任务 task.yaml 含 `teambitionTaskId`（从 TB 看板「加入本地任务」创建）——执行该任务时自动进入本工作流，直接查询对应 TB 问题详情并按任务 goal 意图选择模式（含目标状态/巡检标记时走流转，否则走分析）

## 输入要求

- **必需**（任一即可）：
  - 问题单 shortId、taskId、或可定位问题单的自然语言描述（用户直接提供）
  - **本地任务上下文**（task.yaml 含 `teambitionTaskId`，无需用户再输入）
- **可选**：项目 id、问题类型、执行模式（分析/流转）、目标状态（流转模式）、是否仅巡检（流转模式）、是否强制重新下载（分析模式）

## 输出物

按执行模式输出：

- **分析模式**：
  - **四段式 Markdown 报告**：`log/{shortId}/分析报告.md`（书面四段式：结论先行 / 根因 / 证据日志 / 下一步动作 / 修复建议）——**AI 分析预览优先读取此文件**，路径必须固定，不要写偏
  - **HTML 展示报告**：`log/{shortId}/分析报告.html`（同内容四段式展示版，供人工查看）
  - **TB 问题单评论草稿**：与报告同源的四段式 Markdown（结论先行 / 根因 / 证据日志 / 下一步动作 / 修复建议），**不自动写回**，供 TB 看板详情页用户确认后手动更新评论
  - 日志文件路径：`log/{shortId}/`
- **流转模式**：
  - **流转结果摘要**：谁从哪到哪 + 后续该谁处理 + 下一步建议
  - （巡检模式）巡检清单，零写回

## 关键概念：shortId vs taskId

> 本节为唯一事实来源，全文其他位置引用此处，不再重复说明。

- **shortId** = 用户可见编号（如 `S87750AA1-12247`），对应 `QueryTaskV3` 的 `shortIds` 参数
- **taskId** = 系统内部 id（如 `6a55e310e310a4230f019b12`），对应 `QueryTaskV3` 的 `taskId` 参数
- **禁止混用**：用户提供的 "S87750AA1-12247" 格式是 shortId，必须用 `shortIds` 参数查询，用 `taskId` 参数会报错

## 执行步骤

### 步骤 1：解析输入（含本地任务自动识别）与确定执行模式

**优先检查本地任务上下文**：若当前执行的是从 TB 看板「加入本地任务」创建的本地 Agent 任务（task.yaml 含 `teambitionTaskId`），自动提取：

- `task.yaml` 的 `teambitionTaskId` → 作为 `taskId` 查询参数（对应 QueryTaskV3 的 taskId）
- `task.yaml` 的 `title` → 作为问题标题参考（用于二次核对命中）
- `task.yaml` 的 `type` / `source` → 辅助问题类型判定
- 若 task.yaml 另有 `shortId` 或 `uniqueId` 字段 → 优先使用 shortId 查询

> **本地任务识别后，用户无需再提供任何编号**：直接进入步骤 2 查询该 TB 问题详情。

否则从用户消息中提取字段：shortId（优先）、taskId、问题描述关键字、可选 projectId、执行模式、目标状态、是否仅巡检、是否强制重新下载。

**确定执行模式**（`mode`）：

- 显式指定 `mode`（analyze/transition）→ 按指定
- 用户意图含「流转/认领/关闭/巡检/改状态」→ `transition`
- 用户意图含「分析/日志/排查/报告」或本地任务 goal 为「分析该缺陷定位根因」→ `analyze`
- 无法判断 → 默认 `analyze`，并在输出首行说明模式选择依据，用户可中途切换

若用户输入模糊（既无 id 也无明确描述，且无本地任务上下文），按"异常情况"处理。

### 步骤 2：查询问题单（含附件提取）

#### 2.1 查询任务

按优先级依次尝试，命中即停止：

1. **本地任务上下文（首选）**：若步骤 1 识别出本地任务的 `teambitionTaskId`，调用 `QueryTaskV3`，参数 `{"taskId": "<teambitionTaskId>"}`（taskId 为顶层参数）；如返回包含 uniqueId/shortId 再二次核对标题是否匹配 task.yaml title
2. **shortId 查询**：`QueryTaskV3`，参数 `{"shortIds": "S87750AA1-12247"}`（shortIds 为顶层参数）
3. **taskId 查询**：`QueryTaskV3`，参数 `{"taskId": "6a55e310e310a4230f019b12"}`（taskId 为顶层参数）
4. **TQL 全局搜索**：`SearchTasksByTQLV2`，构造 `title contains "关键字"` 语句
5. **项目内搜索**：`SearchProjectTasksV3`，参数 `projectId` + `q`

> **MCP 参数规范**：路径参数（如 shortIds、taskId、projectId）放在顶层；请求体参数（如 BatchGetFileDetails 的 resourceIds/needSign、CreateTaskCommentV3 的 content/renderMode）**必须包裹在 `requestBody` 字段中**。若不确定参数格式，先调用 `tools/list` 获取工具 inputSchema。

**命中判定**：返回非空且唯一确定一条任务。多条命中列出候选让用户确认；零命中进入异常处理。

#### 2.2 从查询结果提取附件

QueryTaskV3 返回的 `customfields` 数组通常直接包含附件信息，**无需额外调用 ListTaskActivitiesV3**：

1. 遍历 `result[0].customfields`
2. 筛选 `type == "work"` 字段，解析 `value[0].metaString`（JSON），提取 `resourceId` 和 `title`
3. 解析 `type == "rtf"` 字段，提取问题描述全文

**兜底方案**（customfields 无附件时）：调用 `ListTaskActivitiesV3`（参数 taskId、language=zh_CN、orderBy=created_desc），过滤含附件上传的动态，构造 resourceId：
- 评论附件：`task:{taskId}/activity:{activityId}/file:{fileId}`
- 文件字段附件：`task:{taskId}/cf:{cfId}/file:{fileId}`

#### 2.3 提取问题单关键信息

从查询结果提取：taskId、uniqueId/shortId、content（标题）、created、dueDate、priority、progress、isDone、executorId、creatorId、customfields 分类信息与问题描述全文。

> **步骤 1-2 为两种模式共用**（定位问题单 + 提取关键信息）。此后按执行模式分岔：
> - `mode=analyze` → 步骤 3-6（下载日志 → 分析 → 报告 → 评论）
> - `mode=transition` → 步骤 T1-T5（状态机校验 → 授权 → 补信息 → 写回确认 → 流转/巡检）

### 步骤 3：下载日志到本地（含缓存检查）

> **仅分析模式（mode=analyze）执行**；流转模式跳过本步骤。

**缓存优先**——下载前必须检查：

1. 检查 `log/{shortId}/` 目录是否存在
2. 检查附件文件是否已存在且大小 > 0
3. 比对本地文件大小与 TB 返回的 `fileSize`

**缓存命中**：本地完整且未要求"强制重新下载" → 跳过下载，直接进入步骤 4。
**缓存未命中**：继续下载流程。

#### 下载流程

1. 调用 `BatchGetFileDetails` 获取下载链接，参数格式：`{"requestBody": {"resourceIds": ["work:xxx"], "needSign": true, "expireAfterSeconds": 1800}}`（resourceIds/needSign/expireAfterSeconds 必须包裹在 requestBody 中）
2. 创建目录 `log/{shortId}/`
3. **脏缓存检测**：若本地文件存在但大小 < fileSize × 0.95，视为不完整下载，先删除再重下；删除失败（文件被占用）则改用临时文件名（如 `{fileName}.tmp`）下载，下载完成后重命名替换
4. 使用 PowerShell 下载：`Invoke-WebRequest -Uri "<url>" -OutFile "log/{shortId}/{fileName}" -UseBasicParsing -TimeoutSec 300`
5. **重试机制**：单文件失败自动重试 2 次，间隔 5 秒，3 次都失败才进入异常处理；重试时**重新获取下载链接**（链接有 30 分钟时效）
6. **校验**：文件存在且大小 > 0，与 TB 返回 fileSize 误差 < 5%
7. zip 文件自动解压：`Expand-Archive -Path "..." -DestinationPath "log/{shortId}/" -Force`
8. **进度反馈**：下载开始时输出文件名和预期大小，完成后输出实际大小和耗时

### 步骤 T1：读取状态机 + 授权判断（仅流转模式）

> **仅流转模式（mode=transition）执行**。

- `SearchTaskflowStatusesV3`（projectId + tfIds=任务所在工作流）或 `QueryTaskTfs`（taskId）拿当前状态机
- 计算合法目标集：
  - 排除当前状态自身
  - **终态（kind=end）不再流转**
  - 正向推进：pos 大于当前 pos 且非 end
  - 回跳/驳回：当前状态的 `rejectStatusIds`
- 授权：任务 `executorId == 当前用户` 且当前状态非 end → 可流转；`executorId` 为空且我在 `involveMembers` → 可认领；否则 → NO_PERMISSION
- 目标状态不在合法集 → ILLEGAL_TARGET，列出合法项请示
- **巡检模式（inspect_only=true）**：跳过写回，只输出巡检清单（当前状态/合法目标/待办人/逾期），零写回

### 步骤 T2：判断需补充信息（仅流转模式）

- 目标状态对应 sfc 是否有必填 customfields 未填（`GetScenarioFieldsMCP` 的 required）
- 有缺口 → 询问用户补填；不阻塞可跳过并注明

### 步骤 T3：写前确认（仅流转模式，巡检模式跳过）

展示影响清单：

```
将执行：{#349 相机黑屏}  Open → Fixed
执行人：我 · 流转说明：{用户提供或 AI 起草}
影响：状态变更为 Fixed（进入测试验证），看板联动刷新
确认执行？(是/否)
```

等待用户明确确认 → 否则中止（USER_CANCELLED）。

### 步骤 T4：写回流转（仅流转模式，巡检模式禁止）

- **认领**：`UpdateTaskExecutorV3`，参数 `{"taskId": "xxx", "requestBody": {"executorId": "<当前用户id>"}}`（executorId 放 requestBody）
- **流转**：`UpdateTaskStatusV3`，参数 `{"taskId": "xxx", "requestBody": {"taskflowstatusId": "<目标状态id>", "tfsUpdateNote": "<流转说明>"}}`
- **可选评论**：`CreateTaskCommentV3`，参数 `{"taskId": "xxx", "requestBody": {"content": "评论内容", "renderMode": "markdown"}}`
- 写回失败：WRITE_FAILED；token 过期 → REAUTH_NEEDED

### 步骤 T5：通知与结果（仅流转模式）

- 本地看板通过刷新 / `tb:changed` 事件更新
- 输出精简摘要：谁从哪到哪 + 后续该谁处理 + 下一步建议

### 步骤 4：判定问题类型并调用分析 skill（仅分析模式）

#### 4.1 检查已有分析结果（缓存优先）

检查**约定报告路径** `log/{shortId}/分析报告.md`（或 `分析报告.html`）是否已存在。已有且未要求"强制重新分析" → 复用结果，直接进入步骤 5。

> **路径契约（重要）**：报告**必须**写到 `log/{shortId}/分析报告.md`（md，AI 分析预览读取）+ `log/{shortId}/分析报告.html`（html，展示版），**不要**写到其他子目录（如 `diag_logs/output/` 或自定义文件名），否则 AI 分析预览取不到。日志、证据、中间文件可放 `log/{shortId}/` 下任意子目录，但**两个报告文件路径必须固定**。

#### 4.2 判定问题类型并调用 skill

综合 customfields 分类、标题描述、附件文件名、日志目录结构判定问题类型，按映射表调用对应 skill。

**本地任务优先参考**：若为本地任务上下文，task.yaml 的 `type`（缺陷/需求/任务…）与 title 作为判定线索之一，优先与 TB 详情 customfields 交叉核对后判定。

> **问题类型映射表详见** `references/problem-type-mapping.md`

若无可用 skill，使用通用日志分析方法（读取日志、提取关键错误行、归纳异常模式）。

#### 4.3 记录分析结果

记录：skill 名称和版本、输入参数、输出文件路径列表、分析结果摘要（发现数、严重级别分布、核心结论）。

### 步骤 5：输出四段式分析报告（md + html 双文件，路径固定）

生成书面四段式报告，**同时输出两个文件到固定路径**：
- **`log/{shortId}/分析报告.md`** —— Markdown 版（AI 分析预览优先读取）
- **`log/{shortId}/分析报告.html`** —— HTML 展示版（人工查看，结构参考 `references/html-report-style.md`）

> **路径契约（重要）**：两个报告文件路径**必须**为 `log/{shortId}/分析报告.md` 与 `log/{shortId}/分析报告.html`，不要写偏到其他目录/文件名。生成后返回核心摘要（结论 + P0 动作，3-5 行）。

**核心要点（四段式结构，AI 分析预览直接按此提取）**：
- 🔍 **结论**：一句话核心结论（是什么问题 + 根因一句话判定），不重复问题单标题/描述
- 🔬 **根因**：根因定位 + 按可能性排序 1-3 条（含最高嫌疑）
- 📎 **证据日志**：3-5 条关键日志，代码块样式，仅时间戳 + 核心内容
- ➡️ **下一步动作**：P0/P1 动作清单表格（动作/责任方/验证方法）
- 🛠 **修复建议**：短期/长期/验证

保存路径：`log/{shortId}/分析报告.html`，生成后返回核心摘要（结论 + P0 动作，3-5 行）。

### 步骤 6：生成回传评论草稿（**不自动写回**，由 TB 看板用户确认后手动更新）

将分析结果组织为**书面四段式评论草稿**，输出到会话末尾，**不要**调用 `CreateTaskCommentV3` 自动写回。

> **评论模板与调用参数详见** `references/comment-template.md`

**核心要点**：
- 书面四段式：**结论先行 → 证据日志 → 下一步动作 → 修复建议**，可直接回传问题单
- 评论总长度控制在 2000 字符以内
- 关键日志最多 5 条，仅 CRITICAL 级别
- 动作清单仅 P0/P1
- 在输出中明确标注：**「评论草稿已就绪，请在 TB 看板详情页确认后点击『更新评论』写回」**
- 若用户明确要求直接写回（且已给出确认），才可调用 `CreateTaskCommentV3`
- **参数格式**（如用户确认写回时）：`{"taskId": "xxx", "requestBody": {"content": "评论内容", "renderMode": "markdown"}}`（content/renderMode 必须包裹在 requestBody 中）

**异常处理**：草稿生成失败不阻塞步骤 5 的 HTML 报告输出，仅输出警告。

## 异常情况处理

当出现以下任一情况，**立即停止流程**，向用户输出异常描述并请示下一步：

1. **输入不足**：用户既未提供问题单 id，也未提供可定位的描述
2. **查询无结果**：所有查询方式均零命中
3. **多条候选无法唯一确定**：列出候选清单（最多 5 条），请用户选择
4. **无日志附件**（分析模式）：customfields 和 activities 中均无附件
5. **下载链接获取失败**（分析模式）：BatchGetFileDetails 返回错误或空链接
6. **下载失败**（分析模式）：3 次重试均失败、文件大小为 0、写入失败
7. **MCP 调用异常**：teambition-mcp 任意工具调用返回错误码或超时
8. **评论创建失败（非阻塞）**：不停止流程，仅输出警告
9. **非法目标状态**（流转模式）：目标状态不在合法集，列出合法项请示
10. **无执行权限**（流转模式）：说明该状态需谁处理
11. **写回失败**（流转模式）：展示错误，保留 pending 可重试
12. **token 过期**：提示重新授权，暂停后续
13. **用户未确认**（流转模式）：不写回，记录中止

**异常输出格式**：
```
⚠ 异常情况：{简短描述}
- 已执行步骤：{步骤编号与名称}
- 失败原因：{具体原因}
- 已获取信息：{已查到的问题单信息摘要，如无则填"无"}
- 请示：{下一步建议}
```

## 使用约束（边界锁死）

- 所有 teambition-mcp 工具调用必须通过 `run_mcp` 工具，参数放入 `args` 字段
- **MCP 参数规范**：路径参数（shortIds/taskId/projectId）放顶层；请求体参数必须包裹在 `requestBody` 字段中。首次调用前可通过 `tools/list` 获取工具 inputSchema 确认参数结构
- **shortId vs taskId**：见"关键概念"章节，两者不可混用
- 下载日志前必须先创建目录 `log/{shortId}/`
- 本地路径使用相对路径（相对当前工作目录），跨平台兼容
- 报告中敏感信息（token、密钥、下载链接签名）需脱敏
- **单次会话最多下载 20 个日志文件**，超出请示用户是否分批处理
- **缓存优先**：下载前检查本地缓存（含脏缓存检测），分析前检查已有输出；状态机/项目/类型元数据能复用不重复拉
- **临时文件管理**：中间文件（查询结果、下载链接等）存放在 `log/{shortId}/.tmp/` 目录，流程结束后自动清理
- **进度反馈**：每个步骤开始时输出步骤编号和预期操作，长耗时操作（下载、分析）输出进度信息
- **Python 兼容**：调用分析 skill 时，若 `python` 不在 PATH，尝试 `py` launcher 兜底
- **流转模式边界（mode=transition）**：
  - **状态机锁死**：目标状态必须是合法推导结果，不猜、不跳过非法态
  - **写前确认**：非巡检模式写回前必须展示影响清单等待确认
  - **巡检模式零写回**：inspect_only=true 时任何写操作（流转/认领/评论）都被禁止
  - 单次会话默认最多处理 20 条缺陷，超出请示分批

## 示例

**用户输入**：
> 帮我分析一下 TB 上的问题单 S87750AA1-12247

**执行流程（分析模式）**：
1. 解析：`shortId=S87750AA1-12247`，意图=分析 → mode=analyze
2. 调用 `QueryTaskV3`（shortIds="S87750AA1-12247"）→ 命中任务，从 customfields 提取附件 resourceId 与 taskId
3. 检查本地缓存 `log/S87750AA1-12247/` → 命中则跳过下载，未命中则下载解压
4. 检查已有分析结果 → 命中则复用，未命中则判定问题类型并调用对应 skill
5. 生成 `log/S87750AA1-12247/分析报告.html` 并返回摘要
6. 调用 `CreateTaskCommentV3`（taskId）将分析结论更新到问题单评论

**用户输入**：
> 帮我把 TB 缺陷 S87750AA1-12247 流转到 Fixed

**执行流程（流转模式）**：
1. 解析：`shortId=S87750AA1-12247`，目标状态=Fixed，意图=流转 → mode=transition
2. `QueryTaskV3`（shortIds="S87750AA1-12247"）→ 命中缺陷，拿到 taskId/tfsId/projectId
3. `QueryTaskTfs`（taskId）→ 确认 Fixed 在合法目标集，executor==我 → 授权通过
4. 检查必填字段无缺口
5. 展示影响清单等待确认 → 用户确认
6. `UpdateTaskStatusV3`（taskId + requestBody.taskflowstatusId=Fixed + tfsUpdateNote）
7. 输出摘要：「#12247 已从 Open → Fixed，交测试验证」

**本地任务上下文（从 TB 看板加入的本地任务）**：
> 用户执行本地任务「手机正常插入SIM卡后无法识别SIM卡并注网」（该任务由 TB 看板「加入本地任务」创建）

**执行流程**：
1. 读取当前任务 `task.yaml` → 自动识别 `teambitionTaskId=6a55e310e310a4230f019b12`，`title` 与 type 作为判定参考（无需用户提供编号）
2. 调用 `QueryTaskV3`（taskId=6a55e310...）→ 命中任务，从 customfields 提取附件 resourceId（如 signal.zip）与完整描述
3. 检查本地缓存 → 未命中则按日志下载流程连接 TB 下载到 `log/{shortId}/`（缓存/脏缓存/重试/校验机制照常）
4. 按 TB 详情（分类 SIM 卡 + 标题+附件）判定问题类型，调用 `qxdm-qcom-modem-sim-v1` 分析
5. 生成 `log/{shortId}/分析报告.html` 并返回摘要
6. 调用 `CreateTaskCommentV3`（taskId）将分析结论更新到问题单评论

---

**产品兼容性**：手机(true) 平板(true) AI玩具(false)
**版本历史**：v1.0.0（原版，见 `SKILL_v1.0.0_original.md`）→ v2.0.0（四维框架优化，见 `SKILL_v2.0.0.md`）→ v2.1.0（补全 frontmatter 结构化字段 + 新增 test_expected.json）→ v2.2.0（修复 MCP 参数规范、下载健壮性、临时文件管理、进度反馈）→ v2.3.0（本地任务上下文自动识别：从 TB 看板加入的本地任务自动提取 teambitionTaskId 查询 TB 详情）→ v2.4.0（合并 tb-defect-flow：新增流转模式 mode=transition，含状态机校验/授权/补信息/写前确认/写回流转/巡检；分析/流转共用步骤 1-2，按模式分岔）→ v2.5.0（评论升级为书面四段式：结论先行/证据日志/下一步动作/修复建议，见 references/comment-template.md）→ v2.6.0（分析模式不再自动写回 TB 评论：会话只生成四段式评论草稿并输出到 AI 分析预览，由 TB 看板详情页用户确认后手动点击「更新评论」写回）→ v2.7.0（HTML 分析报告统一为书面四段式：结论先行/根因/证据日志/下一步动作/修复建议，AI 分析预览直接按此结构从报告提取，见 references/html-report-style.md）→ v2.8.0（当前，**报告输出路径契约**：四段式报告必须写到 `log/{shortId}/分析报告.md`（AI 预览读取）+ `log/{shortId}/分析报告.html`（展示版），路径固定避免写偏导致预览取不到）
