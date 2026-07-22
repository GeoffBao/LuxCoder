# LuxCoder

LuxCoder 是面向企业研发团队的 AI Agent 桌面工作台，将 **Chat**（AI 对话助理）、**Code**（AI 编程工作台）、**Work**（协作看板，即将上线）三种工作模式整合在同一个桌面应用中。

它不是单纯的聊天框，也不是命令行工具的 GUI 包装，而是为研发工程师、架构师、产品经理和测试工程师设计的 AI 协作平台：简单问题用 Chat，复杂执行任务交给 Code Agent，团队协作通过 Work 模式联动 Teambition 研发流。

## 核心功能

- **Chat 模式**：多模型对话、附件解析（PDF / Office / 图片）、Markdown / Mermaid / KaTeX / 代码高亮、并排对比、系统提示词、上下文管理。
- **Code 模式**：基于 `@anthropic-ai/claude-agent-sdk` 的通用 Agent，支持工作区隔离、权限模式、文件读写、Shell 执行、长任务流式输出、工具调用展示。
- **Skills 系统**：将团队最佳实践固化为可复用的工作流提示词，按工作区管理，支持团队分发（`.luxcoder-share`）。
- **MCP 集成**：每个工作区独立配置 MCP Server（文件系统、数据库、API 网关等），按需扩展 Agent 工具能力。
- **飞书集成**：通过飞书机器人桥接，在手机端触发和查看 Agent 任务，支持流式卡片响应。
- **本地优先**：会话、工作区、附件、配置、Skills 全部存储在 `~/.luxcoder/`，使用 JSON / JSONL 文件组织，不依赖本地数据库，配置可移植。

## 快速开始

### 安装

从 [GitHub Releases](https://github.com/GeoffBao/LuxCoder/releases) 下载对应平台的安装包：
- macOS Apple Silicon（arm64）
- macOS Intel（x64）
- Windows x64

### 首次配置

1. 打开 LuxCoder，首次启动会引导完成欢迎流程。
2. 进入 **设置 → 模型配置**，添加至少一个 AI 供应商渠道，填写 API Key 和模型。
3. Chat 模式支持 OpenAI、Anthropic、DeepSeek、Google 等多种协议渠道。
4. Code 模式需要 Anthropic 协议或兼容协议（Anthropic、DeepSeek、Kimi 等）。
5. 进入 **设置 → Agent**，选择默认 Agent 渠道、模型和工作区后即可使用 Code 模式。
6. Windows 用户首次启动时会引导安装 Git Bash / WSL（Code 模式依赖 Shell 环境）。

### 团队配置分发

管理员在 **设置 → 数据迁移** 中导出 `.luxcoder-share` 配置包（凭据自动剥离），分发给团队成员双击导入即可，跳过手动配置。

## 工作模式说明

| 模式 | 定位 | 状态 |
|------|------|------|
| **Chat** | AI 研发助理 · 多模型对话 · 文档问答 | 可用 |
| **Code** | AI 编程工作台 · Agent SDK 驱动 · 文件读写执行 | 可用 |
| **Work** | 协作看板 · Teambition 双向同步 · 六阶段研发流 | 即将上线 |

### Chat 适合

- 日常问答、技术方案分析、文档撰写、需求评审。
- 读取 PDF / Office 附件后做总结、对比、改写。
- 同时对比多个模型回答，或使用不同系统提示词做探索。

### Code 适合

- 修改、创建、整理本地代码文件。
- 调研、编写技术报告、处理多步骤任务。
- 使用 MCP、Skills、Shell、Git、项目文件等外部上下文。
- 需要权限确认、计划模式和后台任务持续跟进的工作。

**一句话**：**只需要回答时用 Chat，需要行动和交付结果时用 Code。**

## 本地数据

LuxCoder 采用本地文件存储，方便备份、迁移和排查问题。

```text
~/.luxcoder/
├── channels.json           # 渠道配置（API Key 经 safeStorage 加密）
├── conversations.json      # 对话索引
├── conversations/
│   └── {uuid}.jsonl        # 每对话消息文件（追加写入）
├── agent-sessions.json     # Agent 会话索引
├── agent-sessions/
│   └── {uuid}.jsonl        # 每会话消息文件
├── agent-workspaces/
│   └── {workspace-slug}/
│       ├── workspace-files/ # 工作区持久文件
│       ├── mcp.json         # MCP Server 配置
│       └── skills/          # Skills 配置
├── attachments/
├── user-profile.json
├── settings.json
└── sdk-config/
```

API Key 通过 Electron `safeStorage` 加密后写入 `channels.json`，不以明文存储。

## 开发

LuxCoder 是 Bun workspace monorepo，基于 [Proma](https://github.com/proma-ai/Proma) 开源版本 fork。

```text
LuxCoder/
├── packages/
│   ├── shared/     # 共享类型、IPC 常量、配置、工具函数
│   ├── core/       # Provider Adapter、SSE 读取器、代码高亮
│   └── ui/         # 共享 React UI 组件
└── apps/
    └── electron/   # Electron 桌面应用主体
```

当前主要包版本：

| 包 | 版本 | 职责 |
|---|---|---|
| `@luxcoder/electron` | `0.9.5` | Electron 桌面应用 |
| `@luxcoder/shared` | `0.1.15` | 共享类型、IPC 常量、配置和工具 |
| `@luxcoder/core` | `0.2.2` | Provider Adapter、SSE、Shiki 高亮 |
| `@luxcoder/ui` | `0.1.3` | 共享 React UI 组件 |

常用命令：

```bash
# 安装依赖
bun install

# 开发模式（Vite + Electron + 热重载）
bun run dev

# 构建 Electron 应用
bun run electron:build

# 构建并运行
bun run electron:start

# 类型检查
bun run typecheck

# 测试
bun test
```

Electron 子应用内更细的脚本：

```bash
cd apps/electron

bun run dev:vite       # 单独启动 Vite dev server
bun run dev:electron   # 单独启动 Electron（需先启动 Vite）
bun run build:main     # 构建主进程
bun run build:preload  # 构建 Preload
bun run build:renderer # 构建渲染进程
bun run dist:fast      # 快速打包当前平台
```

## 技术栈

| 层级 | 技术 |
|---|---|
| 运行时 | Bun 1.2+ |
| 桌面框架 | Electron 39 |
| 前端 | React 18 + TypeScript 5 |
| 状态管理 | Jotai |
| 样式 | Tailwind CSS + Radix UI |
| 富文本输入 | TipTap |
| Markdown / 图表 / 公式 | React Markdown + Beautiful Mermaid + KaTeX |
| 代码高亮 | Shiki |
| 构建 | Vite + esbuild |
| 分发 | electron-builder |
| Agent SDK | `@anthropic-ai/claude-agent-sdk@0.3.185` |

## 架构概览

```text
@luxcoder/shared 类型和 IPC 常量
  → apps/electron/src/main/ipc.ts 注册处理器
  → apps/electron/src/preload/index.ts 暴露 window.electronAPI
  → renderer Jotai atoms 和 React 组件调用
```

主进程服务集中在 `apps/electron/src/main/lib/`：

- `agent-orchestrator.ts`：Agent 编排、环境变量、SDK 调用、事件流、错误处理（71KB 核心）。
- `agent-session-manager.ts`：Agent 会话索引和 JSONL 消息持久化。
- `agent-workspace-manager.ts`：工作区、MCP、Skills 和工作区文件管理。
- `chat-service.ts`：Chat 流式调用、Provider Adapter 集成。
- `conversation-manager.ts`：Chat 会话索引和消息存储。
- `channel-manager.ts`：渠道 CRUD、API Key 加密、连接测试、模型获取。
- `feishu-bridge.ts` / `dingtalk-bridge.ts` / `wechat-bridge.ts`：远程机器人桥接。
- `chat-tool-*`、`document-parser.ts`、`workspace-watcher.ts`：工具、文档解析和文件监听。

渲染进程以 Jotai 管理状态，关键 atoms 位于 `apps/electron/src/renderer/atoms/`。Agent IPC 监听器在应用顶层全局挂载，避免切换页面时丢失流式事件或权限请求。

## 打包注意事项

`@anthropic-ai/claude-agent-sdk` 在 `0.2.113+` 后改为平台 native binary 分发，esbuild 配置将 SDK 标记为 external，`electron-builder.yml` 将 SDK 主包和平台子包一起打进安装包。

修改打包配置时请确认：

- 主进程 esbuild 保持 `--external:@anthropic-ai/claude-agent-sdk`。
- `apps/electron/package.json` 的 `optionalDependencies` 包含目标平台的 SDK 子包。
- `apps/electron/electron-builder.yml` 的 `files` 包含 SDK 主包和平台子包。
- 其它普通 npm 依赖应由 esbuild 打包进 `main.cjs`，不要随意 external。

## 支持的模型渠道

| 供应商 | Chat | Code | 协议 |
|---|---|---|---|
| Anthropic | ✅ | ✅ | Anthropic Messages API |
| DeepSeek | ✅ | ✅ | Anthropic 兼容协议 |
| Kimi | ✅ | ✅ | Anthropic 兼容协议 |
| OpenAI | ✅ | — | Chat Completions |
| Google | ✅ | — | Gemini Generative Language API |
| 智谱 AI | ✅ | ✅ | Anthropic 兼容协议 |
| MiniMax | ✅ | ✅ | Anthropic 兼容协议 |
| 豆包 | ✅ | ✅ | Anthropic 兼容协议 |
| 通义千问 | ✅ | ✅ | Anthropic 兼容协议 |
| 自定义端点 | ✅ | — | OpenAI 兼容协议 |

## 贡献

欢迎提交 Bug 修复、功能补充、文档完善和测试用例。提交 PR 前请确认：

- 使用 Bun 运行脚本，不混用 npm / pnpm lockfile。
- 状态管理使用 Jotai，不引入其他状态库。
- 本地优先原则：优先使用配置文件和 JSON / JSONL，不引入本地数据库。
- TypeScript 不使用 `any`，对象结构优先使用 `interface`。
- 新增 IPC 通道时同步修改 shared 类型、main handler、preload bridge 和 renderer 调用。
- 影响包行为时递增对应 package 的 patch 版本。
- 能用测试覆盖的行为尽量补上测试，尤其是共享逻辑、IPC 契约和持久化格式。


## 致谢

- [Proma](https://github.com/proma-ai/Proma)：本项目 fork 自 Proma 开源版。
- [Shiki](https://shiki.style/)：代码高亮。
- [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid)：Mermaid 图表渲染。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio)：多供应商桌面 AI 产品参考。
- [Craft Agents OSS](https://github.com/lukilabs/craft-agents-oss)：Agent SDK 集成模式参考。

## 许可证

本项目采用 [GNU Affero General Public License v3.0（AGPL-3.0）](./LICENSE) 开源。

**个人 / 非商业使用**：自由使用、修改、分发，遵守 AGPL-3.0 条款即可。

**商业使用**：在完全遵守 AGPL-3.0 条款前提下允许商业使用，通过网络对外提供服务时须公开完整修改源码，衍生作品须以 AGPL-3.0 继续授权。
