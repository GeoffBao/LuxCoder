# LuxCoder README Redesign

## Goal

将中英文 README 从过时的上游介绍重写为 LuxCoder 当前产品首页，优先服务产品用户，同时保留精炼的开发与贡献入口。

## Brand

- 产品名：LuxCoder
- 品牌心智：**Thinking More, Do More!**
- 核心定位：面向真实研发交付的本地优先 AI Coding 工作台
- 表达重点：深度思考、可靠执行、长任务协作、持续知识沉淀

## Audience

首要受众是希望下载和使用 LuxCoder 的产品用户；其次是准备从源码运行、贡献或研究架构的开发者。

## Information Architecture

1. 品牌首屏、定位、语言切换和下载入口
2. 产品价值与核心能力，其中包含模型渠道与 Agent Runtime
3. 五分钟快速开始
4. Workspace / Project / session cwd 核心心智模型
5. 本地数据与安全边界
6. 开发、测试、构建、架构和贡献
7. 致谢与许可证

中文和英文 README 保持结构及事实同构。

## Content Boundaries

### Include

- Chat / Code 双模式，Projects & Kanban 位于 Code
- Pi-first Agent Runtime
- API Key 渠道、ChatGPT Codex OAuth、Claude Pro / Max OAuth
- Workspace、Project、`workingDirectory`、会话 cwd
- Task DAG、collaboration、Skills、MCP、Memory、Automation
- 当前仓库中真实存在的开发命令和目录
- AGPL-3.0 许可证与必要的上游致谢

### Remove

- Proma Star History、sealed token 和 Proma 下载链接
- README.en 中遗留的 Proma 品牌与商业版文案
- Work“即将上线”等旧导航
- Code 仅支持 Anthropic 协议等旧 runtime 限制
- 隐藏设置入口、旧权限模式和易快速失真的完整供应商矩阵
- 不能代表当前 LuxCoder 的 Proma 截图

## Validation

- 对照 `apps/electron/resources/tutorial.md` 和当前代码核对产品事实
- 对照根 `package.json` 与 `apps/electron/package.json` 核对命令
- 搜索 Proma 品牌残留，仅允许在致谢/来源说明中出现
- 搜索 Work、Anthropic-only、旧下载链接和 Star History
- 执行 `git diff --check`
- 独立只读复审中英文内容是否同构、准确且无夸大
