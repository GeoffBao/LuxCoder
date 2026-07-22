# TaskEditor Agent 专家与计划生成体验设计

## 背景

LuxCodex 已完成 Project、Kanban、TaskEditor 与任务生成链路的主体迁移，但新建完整任务页面仍存在两个体验缺口：

1. 任务定义只提供一次性的“让 Agent 生成任务计划”按钮，没有复刻 Craft Agents 清晰的“手动 / 生成”双模式流程。
2. 表单暴露了偏底层的 `Orchestrator 模型`，没有面向研发领域的 Agent 专家选择，也没有把领域能力稳定映射到任务 Skills。

本设计在不引入新数据库、不扩展为完整多 Agent 角色编排的前提下，完成 TaskEditor 的专家化与生成体验对齐。

## 目标

- 将 `Orchestrator 模型` 替换为任务级 `Agent 专家` 选择器。
- 为驱动、系统、应用、通信四类专家提供可随桌面应用分发的默认 Skill。
- 专家能力作用于整个任务 DAG，所有子任务统一继承。
- 新增与 Craft Agents 对齐的“手动 / 生成”双模式编辑体验。
- 生成计划后回填为可编辑草稿，用户确认后再创建或创建并运行。
- 保持现有 `task.yaml`、本地文件存储和 Task runner 兼容。

## 非目标

- 不实现每个 DAG 节点独立选择专家。
- 不实现 SDK `options.agents` 原生多角色目录和角色委派。
- 不新增专家数据库、配置服务或独立持久化文件。
- 不在本次改动中增加专家管理后台或用户自定义专家编辑器。
- 未经允许不修改 `README.md` 与 `AGENTS.md`。

## 方案选择

采用“专家预设 = 默认 Skill”的方式。

相比把专家展开为多个通用 Skill，此方式具备稳定、单一的能力边界；相比新增 `expert`/`roles` Schema 并接入 SDK `options.agents`，它能复用现有 `TaskSpec.skills`、默认 Skills 注入和 Task runner，不扩大到完整角色编排。

## 专家目录

新增共享专家目录，包含稳定 ID、显示名称、说明和 Skill slug：

| 专家 | ID | Skill slug | 行为 |
|---|---|---|---|
| 通用专家 | `general` | 无 | 使用工作区默认能力，兼容旧任务 |
| 驱动专家 | `driver` | `work-expert-driver` | 驱动与底层设备相关任务 |
| 系统专家 | `system` | `work-expert-system` | 操作系统、运行时与系统服务任务 |
| 应用专家 | `application` | `work-expert-application` | 产品应用、界面与业务逻辑任务 |
| 通信专家 | `communication` | `work-expert-communication` | 网络、协议与跨进程通信任务 |

领域专家 Skill 放入 `apps/electron/default-skills/`。新 Skill 无需伪造旧版本；现有默认 Skill 升级机制会通过“目标缺失即注入”把它们同步到老工作区。

## 持久化与兼容策略

不新增 `TaskSpec.expert` 字段。专家选择继续通过现有 `task.yaml.skills` 持久化：

- 选择领域专家时，将对应专家 Skill slug 写入 `skills`。
- 选择通用专家时，不写入专家 Skill。
- 切换专家时，只移除专家目录管理的 slug，保留用户手工添加的其他 Skills。
- 编辑已有任务时，从已知专家 Skill slug 反向识别专家。
- 旧任务没有专家 Skill 时显示通用专家。
- 遇到未知或已删除的 Skill slug 时按通用专家展示，但原样保留该 slug，避免破坏手写任务。
- 若异常任务同时包含多个已知专家 Skill，选择器采用目录顺序中的第一个；用户主动切换后归一化为一个专家 Skill。

底层 orchestrator 模型仍使用当前工作区默认模型。编辑器不再暴露模型输入，但继续在 Draft 中保留模型与 connection，以保证旧 TaskSpec 往返保存时不丢失路由信息。

## TaskEditor 交互

任务定义标题下新增 `手动 / 生成` 分段切换，创建和编辑模式均可使用，初始保持手动模式以兼容现有习惯。

左侧表单在两种模式下保持可编辑，包含：

- 标题
- 目标
- 验收标准
- 项目
- Agent 专家
- 权限
- 最大修复次数
- 工作目录

右侧按模式渲染：

### 手动模式

显示现有子任务 DAG，继续支持添加、编辑、删除节点和配置依赖。

### 生成模式

- 空闲态：展示 Sparkles 图标、“生成初始计划”、说明文案、主按钮和“之后可以编辑所有内容”的提示。
- 生成态：展示持续时间提示与三张节点骨架卡片，让长耗时生成明确表现为正在编写 DAG。
- 成功态：读取生成的 TaskSpec，回填标题、目标、验收标准和子任务，自动切换到手动模式。
- 失败或超时：保留所有用户输入和专家选择，停留在生成模式并允许重试。

生成完成只形成可编辑草稿，不自动创建或运行。顶部的“创建”和“创建并运行”仍是最终提交入口。

## 数据流

```text
TaskEditor 选择专家
  -> 专家目录解析 Skill slug
  -> TaskGenerateRequest.skillSlugs
  -> Preload / IPC
  -> task-handlers 生成会话
  -> ConductorSessionHost.sendMessage(..., mentionedSkills)
  -> Agent 加载专家 Skill 并生成 task.yaml
  -> tasks:generated 事件
  -> TaskEditor 读取 TaskSpec
  -> 合并专家 Skill 与用户手工 Skills
  -> 切换到手动模式供用户编辑
  -> 创建 / 创建并运行
  -> task.yaml.skills
  -> Task runner 为全部子会话注入专家 Skill
```

`TaskGenerateRequest` 增加可选 `skillSlugs`。Conductor 的发送接口增加可选消息能力参数，并把专家 Skills 传入现有 `AgentSendInput.mentionedSkills`。未传该字段的现有调用保持原行为。

生成提示词同时声明最终 TaskSpec 需要保留这些 Skills，确保生成草稿和正式运行使用同一专家能力。生成结果回填时，以用户当前选择作为下限，防止生成器遗漏 `skills` 后清空专家选择。

## 组件与代码边界

- 共享层：专家目录、Skill 合并与反向识别纯函数；生成请求类型与生成提示词。
- 默认 Skills：四个领域专家目录，各自提供清晰的工作边界、检查清单和输出要求。
- 主进程：Task 生成 handler 接收专家 Skills，Conductor 把它们注入生成会话。
- Renderer model：Draft 与 TaskSpec 的专家 Skills 往返、保留手工 Skills。
- TaskEditor：模式状态、专家选择器、生成空闲态和加载态。

不新增依赖。状态保持在 TaskEditor 局部 React state；已有跨组件 Kanban 状态继续由 Jotai 管理。

## 错误处理

- 没有标题或目标时不发起生成，并给出明确提示。
- 生成 IPC 失败、Agent 错误、无效 TaskSpec 和超时分别复用现有错误提示与草稿清理逻辑。
- 重新生成前清理上一次未采用的隐藏 orchestrator session。
- 关闭编辑器时清理未采用的生成会话。
- 专家 Skill 缺失不阻塞 TaskEditor 打开；以通用专家降级并保留原始 Skill 数据。
- 生成成功但读取 TaskSpec 失败时不清空当前 Draft，允许用户重试。

## BDD 验收场景

### 场景一：选择领域专家并手动创建

给定用户正在新建完整任务，当选择“驱动专家”并创建任务，则生成的 `task.yaml.skills` 包含 `work-expert-driver`，Task runner 为全部子任务注入该 Skill。

### 场景二：切换专家保留手工 Skills

给定任务已有 `custom-review` 和 `work-expert-driver`，当用户切换为“系统专家”，则保存结果包含 `custom-review` 和 `work-expert-system`，且不再包含 `work-expert-driver`。

### 场景三：生成初始计划

给定用户填写目标并选择“通信专家”，当点击“生成初始计划”，则生成会话加载 `work-expert-communication`；生成成功后编辑器切回手动模式，DAG 可继续编辑，最终 TaskSpec 保留通信专家 Skill。

### 场景四：生成失败

给定生成正在执行，当 IPC 报错、TaskSpec 无效或客户端超时，则编辑器停止加载态、保留表单和专家选择，并允许重新生成。

### 场景五：编辑旧任务

给定旧 TaskSpec 没有专家 Skill，当打开编辑器时显示“通用专家”；保存后不凭空增加领域 Skill，原有模型、connection 与其他 Skills 均保持不变。

## 验证计划

1. 共享层单元测试：专家查找、Skill 合并、未知 slug 与多专家异常输入。
2. TaskEditor model 测试：新建、编辑、生成结果回填和旧 TaskSpec 往返。
3. Generator prompt 测试：专家 Skill 被声明并保留在输出约束中。
4. Task handler / Conductor 测试：`skillSlugs` 被传递为 `mentionedSkills`。
5. TaskEditor 交互测试：模式切换、生成 loading、成功回填、失败保留输入。
6. 运行相关 Bun 测试、全仓类型检查和 Electron renderer 构建。
7. 启动 `bun run dev`，实际验证手动创建、专家切换、生成空闲态与生成 loading 态。

## 版本与文档

按仓库约定递增受影响包的 patch 版本。默认 Skill 为新增目录，无需递增不存在的旧版本；每个 Skill 从明确的初始版本开始。

`README.md` 与 `AGENTS.md` 的功能描述需要同步，但仓库规则要求先获得用户许可，因此本次实现默认不修改这两个文件。
