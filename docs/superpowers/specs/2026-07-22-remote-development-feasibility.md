# Remote 开发模式可行性评估与方案设计

日期：2026-07-22  
状态：**调研报告**（可行性分析 + 方案设计草案）  
前置：`2026-07-21-mobile-remote-and-repo-wiki-roadmap.md`（占位文档）  
背景：公司研发在 Windows 跳板机通过 PuTTY 连接远程 Ubuntu 计算云开发系统

---

## 目录

1. [行业方案调研](#1-行业方案调研)
2. [公司开发模式分析](#2-公司开发模式分析)
3. [LuxAgents 现状评估](#3-luxagents-现状评估)
4. [可行性结论](#4-可行性结论)
5. [方案设计](#5-方案设计)
6. [分阶段实施路径](#6-分阶段实施路径)
7. [风险与约束](#7-风险与约束)
8. [附录：技术参考](#8-附录技术参考)

---

## 1. 行业方案调研

### 1.1 Cursor 的 Remote 技术栈

Cursor 基于 VS Code fork，继承了 VS Code 的 Remote Development 架构，并在此基础上叠加了 AI Agent 能力。

#### Remote-SSH 架构（继承自 VS Code）

```
┌─────────────────────────┐           SSH 隧道            ┌─────────────────────────┐
│   本地 Cursor 客户端     │ ◄────────────────────────────► │   远程 VS Code Server    │
│   (UI 渲染 / 主题 / UX)  │                                │   (语言服务 / 终端 / 调试) │
│                         │                                │                         │
│  UI Extensions (本地)    │                                │  Workspace Extensions   │
│  - 主题、快捷键、代码片段 │                                │  - Language Server       │
│                         │                                │  - Debugger              │
│  AI 推理 (云端)          │                                │  - Linter / Formatter    │
│  - Chat / Agent 请求     │                                │  - 文件系统访问           │
└─────────────────────────┘                                └─────────────────────────┘
```

**核心要点：**
- 首次 SSH 连接时自动在远程主机安装轻量级 VS Code Server
- Extension 分两类：UI Extensions 本地运行，Workspace Extensions 远程运行
- 所有文件 I/O、终端、调试在远程主机执行
- 全部通信经过认证的 SSH 隧道
- 远程主机需求：`max_user_processes >= 4096`，`ulimit` 足够

#### Cloud Agent 架构（Cursor 自研）

```
┌──────────────────┐     HTTPS      ┌──────────────────┐     Tool Calls    ┌──────────────┐
│  用户客户端       │ ◄────────────► │  Cursor Cloud     │ ◄───────────────► │  执行环境     │
│  (Desktop/iOS/Web)│                │  (Temporal 编排)   │                   │  (隔离 VM)    │
│                  │                │  - Agent Loop      │                   │  - 终端       │
│  查看/审批/指导   │                │  - 推理 / 规划     │                   │  - 浏览器     │
│                  │                │  - 会话状态管理     │                   │  - 文件系统   │
└──────────────────┘                └──────────────────┘                    └──────────────┘
```

**核心要点：**
- Agent Loop 在 Cursor 云端 Temporal 中运行（非本地、非 VM 内部）
- VM 只负责执行 tool calls（终端命令、文件编辑等）
- 三者解耦：用户 UI / Agent 推理 / 执行环境
- Self-Hosted Agent：Worker 进程在客户基础设施运行，仅需出站 HTTPS，无需入站端口

#### Cursor iOS 移动端

```
┌──────────────────┐
│  iPhone App       │  ← 瘦客户端，非 IDE
│                  │
│  • 启动 Cloud Agent
│  • Remote Control 桌面 Agent
│  • 查看 Diff / 截图 / 日志
│  • 语音输入
│  • 审批 PR / 合并
│  • Live Activities 推送
└──────────────────┘
```

**设计哲学：** 手机不是编辑器，是 Agent 的遥控器。

---

### 1.2 Codex (OpenAI) 的 Remote 技术栈

#### App Server 架构

```
┌────────────────────┐    JSON-RPC / JSONL    ┌─────────────────────────┐
│   客户端 Surface    │ ◄──────────────────── │   Codex App Server       │
│                    │                        │   (长生命周期进程)        │
│  - CLI TUI         │    stdio / WebSocket   │                         │
│  - Desktop App     │                        │  ┌─────────────────┐    │
│  - VS Code 扩展    │                        │  │  Thread Manager  │    │
│  - JetBrains 插件  │                        │  │  ┌───────────┐  │    │
│  - Web Interface   │                        │  │  │ Core Thread│  │    │
│                    │                        │  │  │ (Agent 核心)│  │    │
└────────────────────┘                        │  │  └───────────┘  │    │
                                              │  └─────────────────┘    │
                                              └─────────────────────────┘
```

**核心要点：**
- **单 Agent、多入口**：CLI/Desktop/IDE 扩展/Web 共享同一 App Server 协议
- **双向 JSON-RPC 2.0**：`stdio`（本地）或 `WebSocket`（远程）传输
- **远程开发模式**：App Server 运行在远程主机，本地 TUI 通过 SSH 隧道 + WebSocket 连接

```bash
# 远程主机启动 App Server
codex app-server --listen ws://0.0.0.0:4500 --ws-auth signed-bearer-token

# 本地连接（经 SSH 隧道）
codex --remote wss://localhost:4500 --remote-auth-token-env CODEX_REMOTE_TOKEN
```

- **Remote Control**：类似 Cursor，手机/浏览器可远程指挥运行中的 Agent
- **exec-server 分离**：App Server（本地，低延迟交互）+ exec-server（远程，代码执行），两端分离

---

### 1.3 Claude Code 的 Remote 方案

```
┌────────────────────┐      SSH        ┌──────────────────────────┐
│  本地终端 / 手机     │ ◄────────────► │  远程主机 (VPS / 云)      │
│                    │                  │                          │
│  SSH 连接           │                  │  tmux 会话中运行 Claude    │
│  或 Remote Control  │                  │  claude -p '...'  (headless) │
│                    │                  │  claude remote-control    │
└────────────────────┘                  └──────────────────────────┘
```

**核心要点：**
- **Headless 模式** (`claude -p`)：无 TTY，适合脚本/SSH 调用
- **Remote Control**：持久会话，手机/浏览器远程指挥
- 无需自建 Server——Agent 直接在远程跑，SSH 提供通道
- `tmux`/`screen` 保持会话存活
- 认证：`ANTHROPIC_API_KEY` 环境变量

---

### 1.4 方案对比总结

| 维度 | Cursor Remote-SSH | Cursor Cloud Agent | Codex App Server | Claude Code SSH |
|------|---------------------|-------------------|--------------------|------------------|
| **架构模式** | 客户端/服务器分离 | 云编排 + 隔离 VM | 协议层 + 多 Surface | SSH + 原生 CLI |
| **执行位置** | 远程主机 | 隔离 VM / Self-Hosted | 远程 exec-server | 远程主机 |
| **传输协议** | SSH 隧道 | HTTPS + Temporal | JSON-RPC (stdio/WS) | SSH + HTTP |
| **远程部署** | VS Code Server 自动安装 | Worker 进程 / VM | App Server + exec-server | Node.js + CLI 包 |
| **移动端** | 无（桌面功能） | iOS App + Web | Web / 计划中 | Remote Control |
| **复杂度** | 中（继承 VS Code） | 高（完整云基础设施） | 中（协议设计精巧） | 低（SSH 原生） |
| **适合场景** | IDE 级远程开发 | 自主 Agent 并行 | 多 Surface 统一 | 开发者直接使用 |

---

## 2. 公司开发模式分析

### 2.1 现有工作流

```
┌───────────────┐    RDP/远程桌面    ┌──────────────────┐    SSH (PuTTY)    ┌──────────────────┐
│  开发者本机     │ ──────────────► │  Windows 跳板机    │ ──────────────► │  Ubuntu 计算云     │
│  (任意设备)     │                  │  (虚拟桌面)        │                  │  (开发系统)        │
│                │                  │                    │                  │                    │
│                │                  │  PuTTY SSH 客户端   │                  │  • 源码仓库         │
│                │                  │  可能有 IDE        │                  │  • 编译工具链       │
│                │                  │                    │                  │  • 调试环境         │
└───────────────┘                  └──────────────────┘                  └──────────────────┘
```

### 2.2 关键约束

| 约束 | 说明 |
|------|------|
| **双重跳转** | 本机 → Windows 跳板机 → Ubuntu 计算云，两层网络隔离 |
| **Windows 跳板机** | 虚拟桌面环境，可能有软件安装限制 |
| **计算云** | 真正的开发环境，代码和编译都在这里 |
| **网络策略** | 可能有入站端口限制、防火墙规则 |
| **安全合规** | 企业环境，可能不允许随意安装软件、开放端口 |

### 2.3 LuxAgents 的价值定位

在此开发模式下，LuxAgents 可以提供的核心价值：

1. **AI Agent 直接在计算云上工作**：Agent 访问源码、运行编译、执行测试，无需来回传输
2. **减少跳板机依赖**：通过 Web/移动端直接管理 Agent 任务
3. **并行任务**：多个 Agent 同时在计算云上处理不同模块
4. **异步工作**：下发任务后无需盯着 PuTTY 窗口

---

## 3. LuxAgents 现状评估

### 3.1 架构有利因素

| 因素 | 说明 |
|------|------|
| **IPC 解耦** | 4 层 IPC 模式（Types → Main → Preload → Renderer），UI 与执行逻辑分离 |
| **事件流模型** | AgentEventBus + push channels，天然适配远程推送 |
| **Session 管理** | JSON + JSONL 持久化，可在远程主机存储 |
| **Agent 适配器** | `RuntimeRoutingAgentAdapter` 可扩展新的远程执行后端 |
| **CLI 已存在** | `@luxagents/cli` 提供 headless 会话操作能力 |
| **session-core** | Headless 核心库，浏览器安全（纯函数入口），可复用于 Web 端 |
| **IM 桥接** | 飞书/钉钉/微信 Bot 已证明「远程触发 Agent」的可行性 |

### 3.2 架构瓶颈

| 瓶颈 | 当前状态 | 所需改造 |
|------|---------|---------|
| **执行绑定本地** | SDK binary 必须在 Electron 主机上 | 需要远程 Agent 执行后端 |
| **文件系统** | 全部 `node:fs` 直接操作 | 需要远程文件访问抽象层 |
| **路径模型** | 绝对本地路径，authorized roots 校验 | 需要本地/远程路径映射 |
| **IPC 不可网络化** | Electron `ipcMain/ipcRenderer` 进程内通信 | 需要 WebSocket/gRPC 协议层 |
| **MCP Server** | 本地 `stdio` 子进程 | 远程 MCP 或 SSH tunnel stdio |
| **文件监听** | `chokidar` 本地目录 | 远程文件变更通知 |
| **无 Web/API Server** | 无 HTTP/WebSocket 服务端 | 需要新建服务端 |
| **无认证体系** | 单用户桌面应用 | 远程访问需要 auth/token |

---

## 4. 可行性结论

### 4.1 总体判断：**可行，推荐分阶段实施**

基于 LuxAgents 现有架构的解耦程度，在计算云上实现 Remote Agent 执行是可行的。关键判断依据：

1. **Agent 适配器边界清晰**：`claude-agent-adapter.ts` 封装了 SDK 进程管理，可在此层面引入远程执行
2. **session-core 浏览器安全**：纯函数核心已独立，可直接用于 Web 控制面板
3. **事件流天然远程化**：`AgentEventBus` → `webContents.send()` 的推送模式，换成 WebSocket 推送等价
4. **CLI 基础设施就绪**：`@luxagents/cli` 证明了不依赖 Electron 的 headless 操作路径
5. **IM 桥接已验证**：飞书/钉钉 Bot 模式证明了「远程触发、本地执行」链路

### 4.2 推荐方案：Codex App Server 模式 × Cursor Self-Hosted Worker 模式

不推荐完整复刻 Cursor Remote-SSH（需要 VS Code Server 整套架构），推荐结合 Codex 和 Cursor 的优势：

```
推荐架构：                                     
                                               
┌──────────────────┐    WebSocket    ┌───────────────────────────────┐
│  控制面板          │ ◄────────────► │  LuxAgents Remote Daemon       │
│  (Desktop/Web/手机)│                │  (运行在 Ubuntu 计算云)         │
│                  │                │                                │
│  • 查看会话列表   │                │  ┌─────────────────────────┐   │
│  • 下发任务      │                │  │  Agent 编排层             │   │
│  • 批准权限      │                │  │  (SDK binary + 环境)     │   │
│  • 查看流式输出   │                │  │                         │   │
│  • 审查 Diff     │                │  │  本地文件/编译/Git 操作   │   │
│                  │                │  └─────────────────────────┘   │
└──────────────────┘                │                                │
                                    │  ┌─────────────────────────┐   │
                                    │  │  MCP Servers / Skills    │   │
                                    │  └─────────────────────────┘   │
                                    └───────────────────────────────┘
```

**核心思路：Agent 跑在代码所在的地方（计算云），用户通过任意 Surface 控制。**

---

## 5. 方案设计

### 5.1 架构总览

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           用户 Surface 层                                │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Electron App  │  │ Web 控制面板  │  │ 手机 PWA/App │  │ IM Bot 桥接  │ │
│  │ (完整桌面版)   │  │ (轻量 React)  │  │ (响应式 Web)  │  │ (飞书/钉钉)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │         │
│         ▼                 ▼                 ▼                 ▼         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    统一 API 协议层                               │    │
│  │           JSON-RPC / WebSocket / REST Hybrid                    │    │
│  │           + Token 认证 + 会话订阅                                │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │
                   SSH 隧道 / 直连 / 反向代理
                              │
┌─────────────────────────────┼──────────────────────────────────────────┐
│                     Ubuntu 计算云                                      │
│                              │                                        │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │               LuxAgents Remote Daemon                           │  │
│  │                                                                 │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │  │
│  │  │ API Server     │  │ Session Mgr   │  │ Agent Orchestrator │   │  │
│  │  │ (WebSocket +   │  │ (JSON/JSONL   │  │ (SDK binary +     │   │  │
│  │  │  HTTP)         │  │  持久化)       │  │  适配器)           │   │  │
│  │  └───────────────┘  └───────────────┘  └───────────────────┘   │  │
│  │                                                                 │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │  │
│  │  │ Workspace Mgr  │  │ MCP Runtime   │  │ File Watcher      │   │  │
│  │  │ (项目/技能/专家)│  │ (本地 stdio)   │  │ (chokidar)        │   │  │
│  │  └───────────────┘  └───────────────┘  └───────────────────┘   │  │
│  │                                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  本地文件系统 · Git 仓库 · 编译工具链 · 调试环境                        │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心组件设计

#### 5.2.1 LuxAgents Remote Daemon（`@luxagents/daemon`）

新增包，运行在计算云上，无 Electron 依赖。

```
packages/daemon/     或  apps/daemon/
├── src/
│   ├── index.ts              # 入口，启动 API Server
│   ├── api-server.ts         # WebSocket + HTTP 服务
│   ├── auth.ts               # Token 认证（Bearer / API Key）
│   ├── rpc-handlers.ts       # JSON-RPC 方法注册
│   ├── session-bridge.ts     # 会话订阅 / 流式推送
│   └── health.ts             # 健康检查端点
├── package.json
└── tsconfig.json
```

**关键设计：**
- 依赖 `@luxagents/shared`、`@luxagents/session-core`、`@luxagents/core`
- **复用** 现有 `main/lib/` 服务层代码（agent-orchestrator、workspace-manager、session-manager 等）
- 不依赖 Electron API（`safeStorage` 替换为标准 AES-256-GCM + 文件密钥）
- 通过 `Bun.serve()` 提供 WebSocket + HTTP

**API 协议（JSON-RPC 2.0）：**

```typescript
// 请求方向：客户端 → Daemon
interface DaemonMethods {
  // 会话管理
  'session.list': (params: { workspaceId?: string }) => SessionMeta[]
  'session.create': (params: { workspaceId: string; projectId?: string }) => SessionMeta
  'session.send': (params: { sessionId: string; message: string; attachments?: string[] }) => void
  'session.stop': (params: { sessionId: string }) => void
  'session.resume': (params: { sessionId: string }) => void

  // 权限 / AskUser
  'permission.respond': (params: { sessionId: string; requestId: string; allowed: boolean }) => void
  'askUser.respond': (params: { sessionId: string; requestId: string; answer: string }) => void

  // 工作区
  'workspace.list': () => AgentWorkspace[]
  'workspace.capabilities': (params: { workspaceId: string }) => WorkspaceCapabilities

  // 项目
  'project.list': (params: { workspaceId: string }) => LoadedProject[]

  // 文件浏览（沙箱内）
  'file.list': (params: { path: string; sessionId: string }) => FileEntry[]
  'file.read': (params: { path: string; sessionId: string }) => string
}

// 推送方向：Daemon → 客户端（notification）
interface DaemonNotifications {
  'stream.event': { sessionId: string; event: AgentEvent }
  'stream.complete': { sessionId: string }
  'stream.error': { sessionId: string; error: string }
  'permission.request': { sessionId: string; request: PermissionRequest }
  'askUser.request': { sessionId: string; request: AskUserRequest }
  'title.updated': { sessionId: string; title: string }
  'capabilities.changed': { workspaceId: string }
}
```

#### 5.2.2 连接策略（适配公司网络拓扑）

针对 `本机 → Windows 跳板机 → Ubuntu 计算云` 的双重跳转：

**方案 A：SSH 隧道（推荐，最安全）**

```bash
# 在 Windows 跳板机上建立 SSH 端口转发
# 计算云上 Daemon 监听 127.0.0.1:7890
ssh -L 7890:localhost:7890 user@ubuntu-compute-cloud

# 本地浏览器/App 访问 跳板机:7890（如跳板机允许）
# 或者在本机再建一层隧道
ssh -L 7890:localhost:7890 user@windows-jumpbox
```

**方案 B：反向隧道（Worker 模式，无需入站端口）**

类似 Cursor Self-Hosted Agent 思路：

```bash
# 计算云上 Daemon 主动出站连接到中继服务
luxagents-daemon --relay wss://relay.company.internal --token $DAEMON_TOKEN
```

中继服务可以部署在公司内网可达的位置，Daemon 只需出站 HTTPS/WSS。

**方案 C：直接 Web 访问（最简单，但需要网络策略配合）**

```bash
# 计算云上 Daemon 监听
luxagents-daemon --listen 0.0.0.0:7890 --auth-token $SECRET

# 开发者直接通过公司内网访问（如果网络策略允许）
# 或者通过跳板机的浏览器访问 http://compute-cloud:7890
```

#### 5.2.3 Web 控制面板（`@luxagents/web`）

轻量级 React SPA，可独立于 Electron 部署：

```
apps/web/    或  packages/web-panel/
├── src/
│   ├── App.tsx               # 主布局（响应式，支持手机）
│   ├── components/
│   │   ├── SessionList.tsx    # 会话列表
│   │   ├── SessionView.tsx    # 会话详情 + 流式输出
│   │   ├── PermissionBar.tsx  # 权限批准 UI
│   │   ├── AskUserBar.tsx     # AskUser 响应 UI
│   │   ├── WorkspaceNav.tsx   # 工作区导航
│   │   └── DiffViewer.tsx     # 变更审查
│   ├── hooks/
│   │   └── useWebSocket.ts    # WebSocket 连接 + 重连
│   ├── atoms/                 # Jotai 状态（复用类型）
│   └── lib/
│       └── rpc-client.ts      # JSON-RPC 客户端
├── index.html
├── vite.config.ts
└── package.json
```

**关键设计：**
- 复用 `@luxagents/shared` 类型和 `@luxagents/session-core` 转录逻辑
- 复用 `@luxagents/ui` 的 Markdown/CodeBlock 组件
- 响应式设计，手机浏览器直接使用（PWA 可选）
- Jotai 状态管理与 Electron 版保持一致的 atom 结构

#### 5.2.4 服务层复用策略

现有 `main/lib/` 服务代码的复用路径：

```
当前：                              目标：
main/lib/                          packages/agent-runtime/
├── agent-orchestrator.ts    ──►   ├── orchestrator.ts      (去 Electron 依赖)
├── agent-session-manager.ts ──►   ├── session-manager.ts   (直接复用)
├── agent-workspace-manager.ts──►  ├── workspace-manager.ts (直接复用)
├── agent-prompt-builder.ts  ──►   ├── prompt-builder.ts    (直接复用)
├── agent-permission-service.ts──► ├── permission-service.ts(直接复用)
├── channel-manager.ts       ──►   ├── channel-manager.ts   (safeStorage → 文件密钥)
├── config-paths.ts          ──►   ├── config-paths.ts      (直接复用)
├── project-repository.ts   ──►   ├── project-repository.ts(直接复用)
└── adapters/                ──►   └── adapters/             (直接复用)
```

**需要抽象的 Electron 依赖：**

| Electron API | 替代方案 |
|-------------|---------|
| `safeStorage.encryptString()` | AES-256-GCM + 文件系统密钥 (`~/.luxagents/keyfile`) |
| `app.getPath('home')` | `os.homedir()` (Node.js 标准) |
| `app.isPackaged` | 环境变量 `LUXAGENTS_PACKAGED` |
| `webContents.send()` | WebSocket `ws.send()` |
| `ipcMain.handle()` | JSON-RPC handler 注册 |
| `dialog.showOpenDialog()` | CLI 参数 / Web 文件上传 |
| `nativeTheme` | CSS 变量（Web 端自适应） |

### 5.3 公司场景专项适配

#### 5.3.1 适配 Windows 跳板机 + PuTTY 工作流

| 场景 | 方案 |
|------|------|
| **开发者在跳板机上使用** | 跳板机浏览器直接访问计算云 Web 面板 |
| **开发者想在本机使用** | SSH 隧道穿透（跳板机 → 计算云） |
| **开发者想用手机** | 公司 VPN + Web 面板（响应式） |
| **计算云无法暴露端口** | 反向隧道模式（Daemon 出站连接内网 relay） |

#### 5.3.2 Daemon 在计算云上的部署

```bash
# 1. 安装（计算云上）
curl -fsSL https://bun.sh/install | bash
git clone <luxagents-repo> ~/luxagents
cd ~/luxagents && bun install

# 2. 配置
cat > ~/.luxagents/daemon.json << 'EOF'
{
  "listen": "127.0.0.1:7890",
  "authToken": "<随机生成>",
  "workingDirectory": "/home/user/projects",
  "sdkApiKey": "<anthropic-api-key>"
}
EOF

# 3. 启动（systemd 或 tmux）
# systemd service
cat > ~/.config/systemd/user/luxagents-daemon.service << 'EOF'
[Unit]
Description=LuxAgents Remote Daemon
After=network.target

[Service]
ExecStart=/home/user/.bun/bin/bun /home/user/luxagents/apps/daemon/src/index.ts
Restart=on-failure
Environment=LUXAGENTS_DEV=1

[Install]
WantedBy=default.target
EOF

systemctl --user enable --now luxagents-daemon

# 4. 健康检查
curl http://localhost:7890/health
```

#### 5.3.3 Agent SDK 在计算云上的运行

Claude Agent SDK binary 需在计算云架构上可用：

```bash
# 计算云通常是 Linux x64
# SDK 平台子包 @anthropic-ai/claude-agent-sdk-linux-x64 需安装

# 验证
ls node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude
# 应存在且可执行
```

如果计算云是 ARM 架构（如华为鲲鹏），需确认 SDK 是否提供 `linux-arm64` 子包。

---

## 6. 分阶段实施路径

### Phase 0：验证（最小可行验证）

**目标：** 证明 Agent 可以在计算云上运行并通过网络控制

**改动范围：**
- 仅使用现有 `@luxagents/cli` + tmux
- 不写新代码

**操作：**
```bash
# 在计算云上
tmux new -s agent
export ANTHROPIC_API_KEY=...
cd /path/to/project

# 使用 CLI 查看会话
bun apps/cli/src/index.ts session list

# 通过 SSH 从跳板机远程发命令
ssh compute-cloud "cd ~/project && claude -p '分析项目结构并列出主要模块'"
```

**验证结果：** Agent SDK 在计算云 Ubuntu 上正常运行 ✓/✗

---

### Phase 1：Remote Daemon MVP

**目标：** 最小可用的远程 Agent 控制面板

**新增包：** `apps/daemon/`

**核心功能：**
- [ ] Bun WebSocket Server（`Bun.serve()`）
- [ ] Token 认证
- [ ] 会话 CRUD（复用 `agent-session-manager`）
- [ ] 发送消息 → Agent 编排（复用 `agent-orchestrator`，去 Electron 依赖）
- [ ] 流式事件推送（WebSocket notification）
- [ ] 权限请求/响应
- [ ] 健康检查端点

**涉及的改造：**
- 从 `agent-orchestrator.ts` 提取核心逻辑到共享包（去除 `webContents.send` → 抽象 EventEmitter）
- `channel-manager.ts` 的 `safeStorage` 替换为文件密钥
- `config-paths.ts` 无需改动（已纯 Node.js）

**不做：**
- 不做 Web UI（先用 `wscat` / Postman 验证 RPC）
- 不做 Electron 客户端集成
- 不做认证体系（简单 Bearer token）

---

### Phase 2：Web 控制面板

**目标：** 浏览器可用的 Agent 管理界面

**新增包：** `apps/web/`

**核心功能：**
- [ ] 会话列表 + 新建会话
- [ ] 流式输出显示（复用 `@luxagents/ui` Markdown 渲染）
- [ ] 权限批准/AskUser 响应
- [ ] 工作区/项目选择
- [ ] 响应式布局（手机浏览器可用）

**技术栈：**
- React + Vite + Tailwind（与 Electron renderer 一致）
- Jotai 状态管理
- `@luxagents/session-core` 转录渲染
- `@luxagents/ui` 共享组件

---

### Phase 3：Electron 客户端集成

**目标：** 桌面版可连接远程 Daemon

**改动：**
- Agent 设置新增「远程执行」选项
- Workspace 支持「Remote」类型（指向远程 Daemon URL）
- IPC 层透明切换：本地 SDK 执行 ↔ 远程 Daemon RPC
- 会话列表合并显示本地 + 远程

---

### Phase 4：移动端 + 高级功能

**目标：** 接近 Cursor iOS 的体验

**可选功能：**
- [ ] PWA 推送通知（Agent 完成/需要权限）
- [ ] 语音输入
- [ ] Diff 审查
- [ ] 多 Daemon 管理（多台计算云）
- [ ] 原生 iOS/Android App（如有需要）

---

## 7. 风险与约束

### 7.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **Agent SDK 无 Linux x64 binary** | 无法在计算云运行 Agent | Phase 0 先验证；必要时用 Claude Code CLI 替代 |
| **公司网络不允许 WebSocket** | 控制面板无法连接 | 降级为 HTTP 长轮询；或使用 SSH 端口转发 |
| **Electron 服务层深度耦合** | 提取复用工作量大 | 逐步抽象，不追求一次解耦；先 fork 再渐进合并 |
| **Anthropic API Key 安全** | 密钥存储在计算云 | 使用文件权限 `600` + 可选加密；对接公司密钥管理系统 |
| **tmux/systemd 权限** | 计算云用户可能无 systemd 权限 | 提供 tmux 和 nohup 备选方案 |

### 7.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **与本地优先原则冲突** | 架构假设被打破 | Daemon 仍是「本地文件优先」，只是「本地」变成了计算云 |
| **Web 端体验远不如桌面** | 用户期望过高 | 明确定位：控制面板而非 IDE |
| **安全合规** | 企业审批流程 | 提供安全设计文档；支持在公司可控网络内部署 |

### 7.3 约束清单

| 约束 | 处理 |
|------|------|
| **不做完整 Web IDE** | Web 面板定位为 Agent 控制器，非代码编辑器 |
| **不做云账号体系** | Token 认证足够；企业 SSO 后续再议 |
| **不做文件编辑** | 查看 Diff / 审查变更，不在线编辑源码 |
| **不改 Electron 核心 IPC** | 新增网络协议层，不替换现有 IPC |
| **不破坏本地开发体验** | 所有远程功能为增量叠加 |

---

## 8. 附录：技术参考

### 8.1 Cursor 关键架构决策

| 决策 | 说明 | 来源 |
|------|------|------|
| Agent Loop 在云端 | Temporal 编排，非 VM 内部 | cursor.com/blog/cloud-agent-lessons |
| 解耦三组件 | 用户 UI / Agent Loop / VM 执行环境 | 同上 |
| Self-Hosted Worker | 仅出站 HTTPS，无入站端口 | cursor.com/docs/cloud-agent/self-hosted-pool |
| iOS 是遥控器 | 不是编辑器，是 Agent 控制器 | cursor.com/changelog/ios-mobile-app |
| Remote Control | Agent Loop 移到云端，工具调用留在本地 | cursor.com/docs/cloud-agent/mobile |

### 8.2 Codex 关键架构决策

| 决策 | 说明 | 来源 |
|------|------|------|
| App Server 协议层 | 单 Agent，多入口 Surface | openai.com/index/unlocking-the-codex-harness |
| JSON-RPC 2.0 双向 | Items / Turns / Threads 三原语 | codex.danielvaughan.com |
| 远程 exec-server | 本地交互 + 远程执行分离 | 同上 |
| WebSocket 远程连接 | SSH 隧道 + WS，alpha 阶段 | developers.openai.com/codex/cli/reference |

### 8.3 相关开源项目

| 项目 | 技术栈 | 参考价值 |
|------|--------|---------|
| **Tessera** | Electron + React + xterm.js + ssh2 | SSH 终端 + 工作区管理 |
| **Shellway** | Electron + React + ssh2 + Zustand | SSH 连接管理 + AES 加密 |
| **Netcatty** | Electron + React + node-pty | 多进程架构 + 安全模型 |
| **remoteCommander** | Electron 39 + React 19 + ssh2 | 多协议 (SSH/VNC/RDP) |

### 8.4 LuxAgents 可复用资产评估

| 资产 | 复用度 | 改造量 |
|------|--------|--------|
| `@luxagents/shared` 类型 + 常量 | **100%** | 无 |
| `@luxagents/session-core` 纯函数 | **100%** | 无 |
| `@luxagents/core` Provider 适配器 | **100%** | 无 |
| `@luxagents/ui` Markdown/CodeBlock | **90%** | 去除少量 Electron 特定样式 |
| `@luxagents/cli` | **100%** | 无（独立可用） |
| `main/lib/agent-orchestrator.ts` | **70%** | 抽象 `webContents.send` → EventEmitter |
| `main/lib/agent-session-manager.ts` | **95%** | 几乎无 Electron 依赖 |
| `main/lib/agent-workspace-manager.ts` | **95%** | 同上 |
| `main/lib/channel-manager.ts` | **80%** | `safeStorage` → 文件密钥 |
| `main/lib/config-paths.ts` | **100%** | 纯 Node.js |
| `main/lib/adapters/` | **90%** | 去除 Electron `app` 引用 |

---

## 修订关系

- 承接：`2026-07-21-mobile-remote-and-repo-wiki-roadmap.md`（占位文档的「手机远程编程」部分）
- 本文性质：可行性调研 + 方案设计草案；实施前须经团队评审确认
- 后续：每个 Phase 开始前新建对应的 design + plan 文档
