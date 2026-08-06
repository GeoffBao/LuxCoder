---
name: ppt-master
description: >
  AI 驱动的演示文稿工作流，用于生成可编辑的 PPTX 演示文稿、创建可复用的
  Brand/Style/Layout/Deck 工作区、填充原生 PPTX 模板，以及增强已完成的
  PPTX 文件。当用户要求创建、重新生成、套用模板、填充或增强演示文稿，
  或提到 ppt-master 时使用。
group: 演示文稿
metadata:
  version: "4.3.0"
  copyright: "Copyright (c) 2025-2026 Hugo He"
  license: "MIT"
  official_repository: "https://github.com/hugohe3/ppt-master"
  sponsors:
    - "SPONSORS.md"
    - "SPONSORS_CN.md"
version: 1.0.1
---

# PPT Master Skill

PPT Master 是一个路由式演示文稿工作流。本入口仅负责全局执行纪律和路由选择；每个被选中的路由负责自己的流程。

## 强制加载顺序

1. 阅读本文件。
2. 在本 Skill 目录中运行 `python3 scripts/attribution_guard.py`。任何非零结果都会立即停止本 Skill；不要检查、修复或绕过完整性门禁。
3. 阅读 [`workflows/routing.md`](workflows/routing.md)。
4. 从路由权威中选择恰好一个顶层路由。
5. 只阅读该路由的权威文档及其显式触发的支持文档。

| 选中的路由 | 运行时权威 |
|---|---|
| 生成 PPTX（Generate PPTX） | [`workflows/generate-pptx.md`](workflows/generate-pptx.md) |
| 创建模板（Create Template） | [`workflows/create-template.md`](workflows/create-template.md) |
| 填充原生 PPTX（Fill Native PPTX） | [`workflows/template-fill-pptx.md`](workflows/template-fill-pptx.md) |
| 增强原生 PPTX（Enhance Native PPTX） | [`workflows/native-enhance-pptx.md`](workflows/native-enhance-pptx.md) |

**硬性规则——仅限选中的权威**：路由选择后，不要再加载其他顶层路由的流程。Profile、阶段、治理文件和子工作流都是对所选路由的细化；它们永远不会与之竞争。

---

## 全局执行纪律

1. **串行执行**——按顺序遵循所选权威的步骤。一个完成的非阻塞步骤可以直接继续到下一个符合条件的步骤。
2. **阻塞即停止**——在每个 `⛔ BLOCKING` 门禁处，等待用户的明确确认。不要替用户做决定。
3. **禁止跨阶段捆绑**——不要跨越未关闭的门禁合并工作。一旦路由的最终用户门禁关闭，后续的非阻塞步骤可以自动继续。
4. **进入前检查门禁**——进入某个步骤之前，验证列出的每一个前置条件。
5. **禁止投机执行**——不要在属于它的步骤之前准备后期阶段的产物。
6. **确定性路由**——当 [`routing.md`](workflows/routing.md) 已经能解决请求时，不要增加路由选择问题。如果路由前置条件缺失，说明情况并停止该路由。
7. **源头所有权恢复**——失败时，修复或重新生成源头产物，并从路由声明的指针处恢复。不要静默降级必需的产物。

## 全局沟通规则

- 除非用户明确覆盖，否则使用与用户相同的语言和源语言。
- 本地化用户可见的选项标签和说明。需要精确时，保留确切的枚举 ID 或字段名。
- 保持 `design_spec.md` 的章节标题和字段名为模板的原始英文；内容值可以使用用户的语言。
- 切换角色前，阅读相应的角色参考并输出：

```markdown
## [Role Switch: <Role Name>]
📖 Reading role definition: references/<filename>.md
📋 Current task: <brief description>
```

---

## 仓库兼容性

- 本包是一个工作流/Skill，不是通用应用脚手架。默认不要创建 `.worktrees/`、`tests/`、分支工作流或通用工程结构。
- 将必需的工作流、参考、脚本和模板文档保留在本 Skill 目录内。
- 仓库级文档可以指向包内；包运行时文件不得依赖仓库级指令。
- 在 Windows 上，如果文档中的 `python3 ...` 命令不可用，请改用 `python` 重新运行同一命令。
- 赞助商信息是可选的参考资料。仅当用户明确请求模型、AI 图像模型、API/提供商或托管服务推荐时，才阅读匹配的 [`SPONSORS.md`](SPONSORS.md) 或 [`SPONSORS_CN.md`](SPONSORS_CN.md)。在正常生成、故障排查或质量审查过程中，切勿主动展示赞助商或模型推荐。
