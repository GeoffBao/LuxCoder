# Remote 开发模式可行性评估与方案设计（v2）

日期：2026-07-22  
状态：**调研报告**（可行性分析 + 方案设计草案）  
前置：`2026-07-21-mobile-remote-and-repo-wiki-roadmap.md`（占位文档）  
背景：公司研发在 Windows 跳板机通过 PuTTY 连接远程 Ubuntu 计算云开发系统  
修订：v2 — 修正架构方向：LuxAgents 桌面装在 Windows，通过 Remote SSH 连接计算云

---

## 目录

1. [行业方案调研](#1-行业方案调研)
2. [正确的架构方向](#2-正确的架构方向)
3. [公司开发模式适配](#3-公司开发模式适配)
4. [LuxAgents 现状评估](#4-luxagents-现状评估)
5. [方案设计](#5-方案设计)
6. [各端安装清单](#6-各端安装清单)
7. [安全风险评估](#7-安全风险评估)
8. [企业管控措施](#8-企业管控措施)
9. [分阶段实施路径](#9-分阶段实施路径)
10. [部署检查清单](#10-部署检查清单)

---

## 1. 行业方案调研

### 1.1 三大产品的 Remote 架构对比

| 产品 | 架构模式 | 本地端安装 | 远程端安装 | 远程端如何部署 |
|------|---------|-----------|-----------|-------------|
| **Cursor** | VS Code Server 模式 | Cursor Desktop（完整 IDE） | `~/.cursor-server/` 轻量 Server binary (~50MB) | **首次 SSH 连接时自动下载安装** |
| **Codex** | App Server + exec-server 分离 | Desktop App / TUI | App Server + exec-server binary | **自动 bootstrap / 手动 SSH 安装** |
| **Claude Code** | Bridge + Direct Connect | Claude Desktop / CLI | `~/.claude/remote/server` binary | **SSH 连接时自动部署 / 手动安装** |

**共同规律：用户只需在本地装桌面应用，远程端的轻量 Server 自动部署，不需要手动克隆源码。**

### 1.2 Cursor Remote-SSH 详解

```
┌───────────────────────────┐        SSH 隧道        ┌───────────────────────────┐
│ Windows 跳板机              │ ◄────────────────────► │ Ubuntu 计算云               │
│                           │                         │                           │
│  Cursor Desktop (完整 IDE) │     首次连接时自动安装 →   │  ~/.cursor-server/         │
│  • UI 渲染                 │                         │  └── bin/{commit}/         │
│  • 主题/快捷键             │                         │      └── cursor-server     │
│  • AI 推理请求             │                         │                           │
│                           │                         │  运行中：                   │
│  全部展示在本地窗口         │  ← 文件/终端/调试数据     │  • Extension Host          │
│                           │                         │  • Language Server         │
│                           │                         │  • Terminal (PTY)          │
│                           │                         │  • File Watcher            │
│                           │                         │  • Git 操作                │
│                           │                         │  • 编译/测试               │
└───────────────────────────┘                         └───────────────────────────┘
```

**关键特征：**
- 远程端**不装 IDE，不装源码**——只有一个自动下载的轻量 Server binary
- Server binary 版本跟随客户端 commit hash 自动匹配
- Server 安装在 `~/.cursor-server/bin/{commit}/` 下
- 远程端需要出站 HTTPS 到 `cursor.blob.core.windows.net` 下载 Server（或手动上传）
- 连接断开后 Server 进程仍在远程保持运行

### 1.3 Codex Remote 详解

Codex 有两种 Remote 拓扑：

**拓扑 A：App Server 在远程（代码在哪，Server 在哪）**

```
┌──────────────┐    SSH 隧道 + WebSocket    ┌──────────────────────────┐
│ 本地 TUI      │ ◄───────────────────────► │ 远程计算云                 │
│ codex --remote│                            │                          │
│              │                            │ codex app-server          │
│ 纯 UI 渲染    │                            │ └── exec-server (沙箱)    │
│ 权限审批      │                            │ └── 代码/编译/Git          │
└──────────────┘                            └──────────────────────────┘
```

**拓扑 B：Remote Control（手机/浏览器远程操控本地电脑）**

```
┌──────────────┐    云端中继     ┌──────────────┐    本地进程      ┌────────────┐
│ 手机/浏览器    │ ◄────────────► │ OpenAI 中继   │ ◄──────────────► │ 本地电脑    │
│ chatgpt.com  │                │ WebSocket    │                  │            │
│ /codex       │                │              │                  │ App Server  │
│              │                │              │                  │ exec-server │
│ 远程操控 UI   │                │              │                  │ 代码/文件    │
└──────────────┘                └──────────────┘                  └────────────┘
```

**关键设计：**
- `codex remote-control` 一条命令启动 headless App Server + 中继连接
- `codex app-server-daemon bootstrap` 自动安装、自动更新、开机自启
- 通过 `app-server-daemon` 管理生命周期（pidfile、healthcheck、auto-update）

### 1.4 Claude Code Remote 详解

```
┌──────────────┐    SSH       ┌──────────────────────────────┐
│ Claude Desktop│ ──────────► │ 远程 Ubuntu                    │
│ (macOS/Win)  │             │                                │
│              │   自动执行：  │ ~/.claude/remote/              │
│              │   ssh host   │ ├── server         (自动下载)   │
│ 本地 UI      │   '~/.claude│ ├── rpc.sock       (Unix socket)│
│ Bridge 同步  │   /remote/  │ └── ccd-cli/       (Agent CLI)  │
│              │   server    │                                │
│              │   serve'    │ 运行中：                        │
│              │             │ • RPC Server (Unix socket)     │
│              │   ← JSON-RPC│ • Agent 核心循环               │
│              │     over SSH│ • 文件/终端/Git 操作            │
└──────────────┘             └──────────────────────────────┘
```

**关键设计：**
- SSH 连接时自动 `exec` 远程 server binary
- 通过 Unix socket (`rpc.sock`) 进行 JSON-RPC 通信
- **已知问题：** Linux 上 `systemd-logind` 的 `KillUserProcesses=yes` 会杀掉 server daemon
- **解决方案：** 用 `systemd-run --user --scope` 或让 bridge 进程保活 server

---

## 2. 正确的架构方向

### v1 方案的错误（已纠正）

| v1 方案（错误） | v2 方案（正确） |
|-----------------|---------------|
| Ubuntu 计算云装完整 LuxAgents 源码 | Ubuntu 只装一个轻量 **LuxAgents Remote Server** binary |
| 从浏览器/手机访问 Web 控制面板 | **LuxAgents Desktop 装在 Windows 跳板机**，直接 Remote SSH |
| 用户学新的 Web UI | 用户在熟悉的桌面 App 中操作，体验一致 |
| Agent 执行和 UI 都在远程 | UI 在本地，**只有 Agent 执行在远程** |

### v2 正确架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                企业内网                                  │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ Windows 跳板机        │                                               │
│  │                     │                                                │
│  │  安装：              │                                                │
│  │  ✅ LuxAgents Desktop│        SSH 连接                                │
│  │     (Electron App)  │ ──────────────────────────┐                    │
│  │                     │                           ▼                    │
│  │  功能：              │                  ┌────────────────────────┐    │
│  │  • 完整 UI（Chat/    │                  │ Ubuntu 计算云           │    │
│  │    Code/Work）       │                  │                        │    │
│  │  • AI 推理请求       │                  │ 自动安装（首次连接时）：  │    │
│  │  • 权限审批          │                  │ ~/.luxagents-server/   │    │
│  │  • Diff 审查         │  ← 流式事件推送   │ ├── luxagents-server   │    │
│  │  • 会话管理          │  ← 文件/终端数据   │ │   (~250MB, 含 SDK)   │    │
│  │                     │                  │ ├── agent-sessions/    │    │
│  │  不需要：            │                  │ └── agent-workspaces/  │    │
│  │  ❌ 源码             │                  │                        │    │
│  │  ❌ Bun/Node         │                  │ 运行中：                │    │
│  │  ❌ 编译环境          │                  │ • Agent SDK 执行       │    │
│  │                     │                  │ • 文件读写/Git 操作     │    │
│  └─────────────────────┘                  │ • 终端/编译/测试        │    │
│                                            │ • MCP Server           │    │
│                                            └────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 与 Cursor/Codex/Claude Code 的对应关系

| 概念 | Cursor | Codex | Claude Code | LuxAgents（目标） |
|------|--------|-------|-------------|------------------|
| **本地端** | Cursor Desktop | Desktop App / TUI | Claude Desktop | LuxAgents Desktop (Electron) |
| **远程端** | ~/.cursor-server/ | app-server-daemon | ~/.claude/remote/server | **~/.luxagents-server/** |
| **通信协议** | VS Code RPC over SSH | JSON-RPC over WebSocket | JSON-RPC over Unix socket | **JSON-RPC over SSH 隧道** |
| **远程部署** | 自动下载 | bootstrap 命令 | SSH exec 自动 | **首次连接自动 + 手动上传** |
| **远程需要装什么** | 无（自动） | 无（自动） | 无（自动） | **无（自动）或手动一个 binary** |

---

## 3. 公司开发模式适配

### 3.1 当前工作流

```
开发者本机 ──RDP──► Windows 跳板机 ──PuTTY/SSH──► Ubuntu 计算云
                    (虚拟桌面)                      (代码/编译/测试)
```

### 3.2 引入 LuxAgents 后的工作流

```
Windows 跳板机                                     Ubuntu 计算云
┌────────────────────────────────┐                 ┌─────────────────────────────┐
│                                │                 │                             │
│  LuxAgents Desktop             │   SSH 隧道       │  ~/.luxagents-server/       │
│  ┌──────────────────────────┐  │ ◄─────────────► │  (轻量 server, 自动安装)     │
│  │ Chat 模式                 │  │                 │                             │
│  │ • 讨论代码设计/架构        │  │                 │  执行：                      │
│  │ • 多 Provider 切换        │  │                 │  • Agent 读写远程代码        │
│  ├──────────────────────────┤  │                 │  • 运行编译/make/cmake       │
│  │ Code 模式 (Agent)         │  │                 │  • 运行测试/调试             │
│  │ • Agent 自动修改远程代码    │  │                 │  • Git 提交/推送             │
│  │ • 运行远程编译/测试        │  │                 │  • MCP 工具调用              │
│  │ • 权限审批               │  │                 │                             │
│  ├──────────────────────────┤  │                 │  存储：                      │
│  │ Work 模式 (Kanban)        │  │                 │  • Agent 会话日志 (JSONL)    │
│  │ • 任务分配到远程执行       │  │                 │  • 工作区配置               │
│  │ • 多任务并行              │  │                 │  • SDK 配置                 │
│  └──────────────────────────┘  │                 │                             │
│                                │                 │  不需要：                    │
│  PuTTY / 终端 (并行使用)       │                 │  ❌ LuxAgents 源码           │
│  • 传统手动开发              │                 │  ❌ Bun                       │
│  • 与 LuxAgents 互不干扰      │                 │  ❌ Electron                  │
│                                │                 │  ❌ 桌面环境                  │
└────────────────────────────────┘                 └─────────────────────────────┘
```

### 3.3 手机端方案（附加）

```
开发者手机 ──VPN──► Windows 跳板机上的 LuxAgents Desktop
                    (通过远程桌面 RDP 操控)

或

开发者手机 ──VPN──► LuxAgents Web Panel (轻量 PWA，后期实现)
                    ↕ SSH 隧道
                    Ubuntu 计算云
```

手机端最简单的方案：**用手机 RDP 连跳板机，操作已装好的 LuxAgents Desktop。** 不需要单独做手机 App。

---

## 4. LuxAgents 现状评估

### 4.1 实现 Remote SSH 需要的改造

| 层级 | 当前状态 | 需要做什么 |
|------|---------|-----------|
| **Electron 主进程** | 全部服务在本地运行 | 拆分为 Local Service + Remote Server |
| **Agent 编排** | SDK binary 本地执行 | 通过 SSH 在远程执行 SDK binary |
| **文件操作** | `node:fs` 直接读写 | 通过 SSH/SFTP 或远程 Server RPC |
| **终端** | 本地 PTY | 远程 PTY 通过 SSH channel |
| **MCP Server** | 本地 stdio 子进程 | 在远程启动 MCP 进程 |
| **配置存储** | `~/.luxagents/` 本地 | Agent 相关配置存远程 `~/.luxagents-server/` |
| **Git 操作** | 本地 `git` 命令 | 远程 `git` 命令 |
| **文件监听** | `chokidar` 本地 | 远程 Server 推送变更事件 |

### 4.2 三种实现路径对比

| 路径 | 描述 | 工作量 | 体验 |
|------|------|--------|------|
| **路径 A：自建 Remote Server** | 参考 Cursor/Codex，开发 `luxagents-server` binary，SSH 自动部署 | 大 | 最佳 |
| **路径 B：ssh2 + SFTP 代理** | Electron 主进程用 `ssh2` 库建立 SSH 连接，所有远程操作通过 SSH channel 代理 | 中 | 良好 |
| **路径 C：直接 SSH 调用 CLI** | 利用现有 `@luxagents/cli` + `claude` CLI，通过 SSH 命令远程执行 | 小 | 基础 |

**推荐：路径 B 起步，渐进到路径 A。**

路径 B 的核心思路：
```
LuxAgents Desktop (Windows)
  └── Electron 主进程
       └── ssh2 库建立 SSH 连接
            ├── SSH Shell Channel → 远程 Bash（运行 Agent SDK）
            ├── SFTP Channel → 远程文件读写
            ├── SSH Exec → 远程 Git 命令
            └── Port Forwarding → 远程 MCP Server 端口
```

### 4.3 关键技术组件

| 组件 | npm 包 | 用途 |
|------|--------|------|
| **SSH 连接** | `ssh2` | SSH 客户端（建立连接、Shell、Exec、SFTP） |
| **远程终端** | `ssh2` + `xterm.js` | SSH Shell Channel → 终端渲染 |
| **远程文件** | `ssh2` SFTP | 文件浏览/读写/监听 |
| **远程 Agent** | `ssh2` Exec | 通过 SSH 在远程运行 `claude` binary |
| **SSH 配置解析** | `ssh-config` | 解析 `~/.ssh/config` |
| **SSH Key 管理** | `ssh2` + `safeStorage` | 密钥对/密码安全存储 |

同类项目 **Tessera**、**Shellway**、**remoteCommander** 均使用 `ssh2` 在 Electron 中实现 SSH 功能。

---

## 5. 方案设计

### 5.1 路径 B 详细架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│  LuxAgents Desktop (Windows 跳板机)                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Renderer (React + Jotai)                                        │    │
│  │                                                                 │    │
│  │  UI 完全不变：Chat / Code / Work 三模式                           │    │
│  │  新增：连接管理 UI（SSH Host 列表、连接状态）                       │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │ IPC（不变）                           │
│  ┌──────────────────────────────┴──────────────────────────────────┐    │
│  │ Main Process                                                    │    │
│  │                                                                 │    │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐     │    │
│  │  │ RemoteConnectionMgr │  │ 现有服务（不变）               │     │    │
│  │  │                     │  │ • channel-manager             │     │    │
│  │  │ • SSH 连接管理       │  │ • conversation-manager       │     │    │
│  │  │ • 连接池 / 重连      │  │ • settings-service           │     │    │
│  │  │ • SSH Config 解析   │  │ • ...                        │     │    │
│  │  └────────┬────────────┘  └──────────────────────────────┘     │    │
│  │           │                                                     │    │
│  │  ┌────────┴─────────────────────────────────────────────────┐  │    │
│  │  │ RemoteAgentAdapter (新增，实现 AgentAdapter 接口)          │  │    │
│  │  │                                                          │  │    │
│  │  │  当连接模式=Remote 时，替代本地 ClaudeAgentAdapter：       │  │    │
│  │  │  • spawnProcess → ssh.exec('claude ...')                 │  │    │
│  │  │  • readFile    → sftp.readFile()                         │  │    │
│  │  │  • writeFile   → sftp.writeFile()                        │  │    │
│  │  │  • listDir     → sftp.readdir()                          │  │    │
│  │  │  • runBash     → ssh.exec('bash -c ...')                 │  │    │
│  │  │  • gitOps      → ssh.exec('git ...')                     │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │                          │ ssh2 连接                            │    │
│  └──────────────────────────┼──────────────────────────────────────┘    │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │ SSH 隧道
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Ubuntu 计算云                                                           │
│                                                                         │
│  需要存在（无需手动安装，Agent 会自动使用）：                                │
│  • claude binary (Agent SDK)  — 首次由 LuxAgents 自动通过 SFTP 上传      │
│  • git, bash                  — 系统已有                                 │
│  • 项目源代码                  — 开发者已有                               │
│                                                                         │
│  自动创建的工作目录：                                                      │
│  ~/.luxagents-server/                                                    │
│  ├── bin/claude                   # Agent SDK binary (自动上传)           │
│  ├── agent-sessions/              # 会话 JSONL                           │
│  ├── agent-workspaces/{slug}/     # 工作区配置                            │
│  └── sdk-config/                  # SDK 隔离配置                         │
│                                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心新增组件

#### 5.2.1 RemoteConnectionManager

```typescript
// apps/electron/src/main/lib/remote-connection-manager.ts

interface RemoteHost {
  id: string
  name: string           // 显示名称
  host: string           // SSH 主机
  port: number           // SSH 端口，默认 22
  username: string
  authMethod: 'key' | 'password' | 'agent'
  privateKeyPath?: string
  proxyJump?: string     // 跳板机（支持 ProxyJump 链）
  workingDirectory: string  // 远程项目路径
}

interface RemoteConnection {
  hostId: string
  sshClient: Client       // ssh2.Client
  sftpClient: SFTPWrapper  // ssh2.SFTPWrapper
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
}
```

#### 5.2.2 RemoteAgentAdapter

```typescript
// apps/electron/src/main/lib/adapters/remote-agent-adapter.ts
// 实现现有 AgentAdapter 接口，将 Agent 执行转发到远程

class RemoteAgentAdapter implements AgentAdapter {
  constructor(private connection: RemoteConnection) {}

  async query(options: AgentQueryOptions): Promise<AsyncIterable<SDKMessage>> {
    // 1. 确保远程有 claude binary（首次自动上传）
    await this.ensureRemoteSDK()

    // 2. 通过 SSH exec 启动 claude
    const channel = await this.connection.sshClient.exec(
      `cd ${options.cwd} && ~/.luxagents-server/bin/claude ...`
    )

    // 3. 将 stdout 解析为 SDKMessage 流
    yield* this.parseMessageStream(channel.stdout)
  }
}
```

#### 5.2.3 设置界面新增

在 Agent Settings 中新增「远程连接」配置：

```
Agent 设置
├── 渠道配置（现有）
├── 工作区管理（现有）
├── 远程连接（新增）
│   ├── [+ 添加远程主机]
│   │   ├── 名称：计算云-1
│   │   ├── 主机：10.x.x.x
│   │   ├── 端口：22
│   │   ├── 用户名：developer
│   │   ├── 认证方式：SSH 密钥 / 密码
│   │   ├── 密钥路径：~/.ssh/id_rsa
│   │   ├── 跳板机：（可选，ProxyJump）
│   │   └── 工作目录：/home/developer/projects
│   ├── [测试连接]
│   └── [连接状态指示器]
└── MCP 服务器（现有）
```

### 5.3 用户操作流程

```
1. 安装 LuxAgents Desktop 到 Windows 跳板机

2. 打开设置 → 远程连接 → 添加远程主机
   填写：计算云 IP、用户名、SSH 密钥路径

3. 选择工作区 → 切换到「远程」模式
   LuxAgents 自动通过 SSH 连接计算云

4. 首次连接：
   • 自动检查远程 claude binary 是否存在
   • 不存在则自动通过 SFTP 上传 SDK binary (~250MB)
   • 创建 ~/.luxagents-server/ 工作目录

5. 开始使用：
   • Chat 模式：本地 UI，讨论远程代码（通过 SFTP 读取文件上下文）
   • Code 模式：Agent 在远程执行编译/测试/Git（通过 SSH exec）
   • Work 模式：Kanban 任务远程执行
```

---

## 6. 各端安装清单

### 6.1 Windows 跳板机（完整安装）

| 组件 | 版本 | 是否必须 | 安装方式 |
|------|------|---------|---------|
| **LuxAgents Desktop** | 最新 | ✅ 必须 | `.exe` 安装包 |
| **SSH 密钥对** | - | ✅ 必须（如用密钥认证） | `ssh-keygen` 或 PuTTYgen |
| **Git for Windows** | 2.0+ | ⚠️ 推荐 | `winget install Git.Git` |
| **PuTTY** | - | ❌ 可选（已有则保留） | 保持现状 |

**就这些。** 不需要 Bun、不需要 Node.js、不需要编译环境。

Windows 跳板机上 LuxAgents Desktop 的配置：

```
设置 → 渠道配置
  └── 添加 Anthropic / OpenAI / 私有 Provider

设置 → 远程连接
  └── 添加远程主机
      ├── 主机名/IP
      ├── 用户名
      ├── SSH 密钥（调用 Windows 的 OpenSSH agent 或指定 .pem）
      └── 远程工作目录
```

### 6.2 Ubuntu 计算云（零安装 / 最小安装）

**零安装方案（LuxAgents 自动部署）：**

| 要求 | 说明 |
|------|------|
| **SSH Server** | `sshd` 运行中（通常已有） |
| **bash** | 系统 shell（通常已有） |
| **git** | 2.0+（通常已有） |
| **glibc** | 2.31+（Ubuntu 20.04+ 自带） |
| **磁盘** | 500MB 空闲（SDK binary ~250MB + 工作目录） |
| **ulimit** | `max_user_processes >= 4096`（重要，可能需要调整） |

**LuxAgents Desktop 首次 SSH 连接时自动完成：**
1. `sftp.mkdir ~/.luxagents-server/bin/`
2. `sftp.put(local_claude_binary, ~/.luxagents-server/bin/claude)`
3. `ssh.exec('chmod +x ~/.luxagents-server/bin/claude')`
4. `sftp.mkdir ~/.luxagents-server/agent-sessions/`
5. `sftp.mkdir ~/.luxagents-server/sdk-config/`

**手动安装方案（离线环境/首次加速）：**

```bash
# 在计算云上执行（仅需一次）
mkdir -p ~/.luxagents-server/bin

# 方式 A：从网络下载 SDK binary
curl -L "https://github.com/anthropics/claude-code/releases/latest/download/claude-linux-x64" \
  -o ~/.luxagents-server/bin/claude
chmod +x ~/.luxagents-server/bin/claude

# 方式 B：从跳板机 SCP 上传
# 在跳板机执行：
scp /path/to/claude-linux-x64 user@compute-cloud:~/.luxagents-server/bin/claude

# 验证
~/.luxagents-server/bin/claude --version
```

### 6.3 开发者本机（可选）

| 场景 | 做法 |
|------|------|
| **手机查看 Agent 进度** | 手机 RDP 连跳板机 → 看 LuxAgents Desktop |
| **家里电脑操作** | VPN + RDP 连跳板机 → 用 LuxAgents Desktop |
| **本地也装 LuxAgents** | 安装 Desktop → 配置远程连接 → 直接 SSH 到计算云（双跳 ProxyJump） |

---

## 7. 安全风险评估

### 7.1 风险矩阵（v2 修正）

v2 架构下的安全边界更清晰：**API Key 在 Windows 跳板机上（有 safeStorage），远程只有 SDK binary + 会话数据。**

| 风险ID | 风险描述 | 等级 | v2 架构影响 |
|--------|---------|------|------------|
| **R01** | API Key 泄露 | **中** | ✅ 改善：Key 存在 Windows 跳板机（有 DPAPI 加密），不存远程 |
| **R02** | 源代码发送到 AI Provider | **高** | 不变：Agent 仍需读代码作为 context |
| **R03** | Agent 执行危险命令 | **极高** | 不变：远程 SSH exec 同样能执行危险命令 |
| **R04** | Prompt 注入/投毒仓库 | **高** | 不变 |
| **R05** | SSH 连接安全 | **中** | 新增：需确保 SSH 配置安全 |
| **R06** | 远程 SDK binary 被篡改 | **低** | 新增：需验证 binary 完整性 |
| **R07** | SSH 密钥管理 | **中** | 新增：密钥保护和轮换 |
| **R08** | 会话 JSONL 在远程未加密 | **中** | 新增：远程磁盘上的会话日志 |
| **R09** | Agent 通过 SSH 横向移动 | **中** | 新增：Agent 可能尝试 SSH 到其他主机 |
| **R10** | SFTP 文件传输被截获 | **低** | SSH 加密保护 |

### 7.2 v2 架构的安全优势（对比 v1）

| 方面 | v1（Daemon 方案） | v2（Remote SSH 方案） |
|------|-------------------|---------------------|
| **API Key 存储** | 远程计算云明文 ⚠️ | Windows DPAPI 加密 ✅ |
| **Web 攻击面** | 暴露 WebSocket 端口 ⚠️ | 无 Web 端口，纯 SSH ✅ |
| **认证** | 自建 Token 认证 ⚠️ | SSH 密钥/证书（成熟体系）✅ |
| **网络暴露** | Daemon 端口 ⚠️ | 仅 SSH 22 端口 ✅ |
| **传输加密** | 需自建 TLS | SSH 自带加密 ✅ |

### 7.3 关键风险详解

#### R01：API Key 保护（已改善）

v2 架构下 API Key **不需要存储在计算云上**：

```
Windows 跳板机 (LuxAgents Desktop)
  └── ~/.luxagents/channels.json  (safeStorage/DPAPI 加密)
       └── API Key 解密后通过 SSH env 传递给远程 claude 进程
           ssh.exec('ANTHROPIC_API_KEY=sk-ant-xxx claude ...')
```

**注意：** API Key 会通过 SSH 会话的环境变量传递到远程，SSH 加密保护传输安全，但在远程进程的 `/proc/{pid}/environ` 中可被同机器用户看到。

**缓解：** 远程使用独立用户 + `chmod 700 /proc/{pid}`（Linux hidepid 挂载选项）。

#### R03：Agent 执行危险命令

**企业必须措施：**

```json
// LuxAgents Desktop 设置
{
  "agentSettings": {
    "permissionMode": "ask",           // 每个命令都需确认
    "blockedCommands": [
      "rm -rf", "sudo", "ssh", "curl", "wget",
      "nc", "netcat", "docker", "kubectl"
    ],
    "allowedDirectories": [
      "/home/developer/projects/module-a"
    ]
  }
}
```

#### R05：SSH 连接安全

```bash
# 计算云 SSH 加固
# /etc/ssh/sshd_config

PermitRootLogin no
PasswordAuthentication no          # 仅密钥认证
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers developer luxagent      # 白名单用户
ClientAliveInterval 300
ClientAliveCountMax 2
```

#### R09：Agent SSH 横向移动

**已有保护：** LuxAgents `permission-rules.ts` 已将 `ssh`、`scp` 标记为 `DANGEROUS_COMMANDS`。

**增强：** 在远程计算云上，限制 Agent 用户的 SSH 访问权限。

```bash
# 为 Agent 创建受限用户（可选）
sudo useradd -m -s /bin/bash luxagent
# 禁止 luxagent 用户发起 SSH 外连
echo "DenyUsers luxagent" >> /etc/ssh/ssh_config  # 客户端限制
```

---

## 8. 企业管控措施

### 8.1 三级管控架构

```
┌────────────────────────────────────────────────────────┐
│ L1：网络层管控                                          │
│ • SSH 连接仅限跳板机 → 计算云                            │
│ • 计算云出站仅允许 AI Provider API                       │
│ • 不暴露任何额外端口                                     │
├────────────────────────────────────────────────────────┤
│ L2：应用层管控                                          │
│ • Agent 权限模式：ask / plan（禁止 auto）                │
│ • 命令黑名单：sudo/ssh/curl/docker/...                  │
│ • 目录白名单：仅允许访问项目代码目录                       │
│ • MCP Server 白名单：仅允许审批过的 MCP                  │
│ • Token 用量限制：每日/每月上限                           │
├────────────────────────────────────────────────────────┤
│ L3：审计层管控                                          │
│ • 所有 Agent 工具调用记录                                │
│ • 所有 Bash 命令执行记录                                 │
│ • API 用量统计和异常告警                                  │
│ • 定期安全审查（每周/每月）                               │
└────────────────────────────────────────────────────────┘
```

### 8.2 网络策略

```
Ubuntu 计算云防火墙：

出站白名单：
  ✅ api.anthropic.com:443           (或其他 Provider API)
  ✅ <内部 Git Server>:22/443         (代码仓库)
  ✅ <企业代理>:8080                  (如使用代理出站)
  ❌ 其他全部阻止

入站白名单：
  ✅ <跳板机 IP>:22                   (SSH 管理)
  ❌ 其他全部阻止
```

### 8.3 API Key 管理

| 方案 | 适用场景 | API Key 位置 |
|------|---------|-------------|
| **默认方案** | 一般企业 | Windows 跳板机 LuxAgents Desktop（DPAPI 加密） |
| **统一管控** | 安全要求高 | 企业密钥管理系统 → Desktop 启动时获取 |
| **个人 Key** | 开发者自带 | 各自 Desktop 中配置，个人承担费用 |
| **团队共享** | 成本控制 | IT 分发 Key → 统一配置 → 用量监控 |

### 8.4 审计日志

LuxAgents 已有 JSONL 会话日志，v2 Remote 模式下日志分布：

| 日志类型 | 存储位置 | 内容 |
|----------|---------|------|
| **UI 操作日志** | Windows 跳板机 `~/.luxagents/` | 用户操作、设置变更 |
| **Agent 会话日志** | 远程计算云 `~/.luxagents-server/agent-sessions/` | 完整对话、工具调用、命令输出 |
| **SSH 连接日志** | Windows 跳板机 LuxAgents Desktop 日志 | 连接/断开时间、认证方式 |
| **API 用量** | Provider 控制台 | Token 消耗、费用 |

### 8.5 合规注意事项

| 场景 | 做法 |
|------|------|
| **代码不能出内网** | 使用私有部署 LLM（Custom Provider），或 AWS Bedrock / Azure OpenAI |
| **Agent 不能访问生产环境** | 网络隔离：计算云 ≠ 生产服务器 |
| **需要审批流程** | Agent 权限模式设为 `ask`，所有操作需人工确认 |
| **多人共用计算云** | 各自独立 Linux 用户 + 独立 `~/.luxagents-server/` |

---

## 9. 分阶段实施路径

### Phase 0：零开发验证（1-2 天）

**目标：** 验证 Agent SDK 在计算云上正常工作

**做法：** 不写任何代码
1. 在计算云安装 Claude Code CLI：`curl -fsSL https://claude.ai/install.sh | bash`
2. 在跳板机通过 PuTTY SSH 连计算云
3. 在 tmux 中运行：`claude -p "分析当前项目结构"`
4. 验证：Agent 可以读代码、执行命令、Git 操作 ✓/✗

### Phase 1：SSH 连接基础

**目标：** LuxAgents Desktop 能通过 SSH 连接计算云

**新增组件：**
- `RemoteConnectionManager`（ssh2 连接管理）
- 远程连接设置 UI
- SSH 密钥管理（safeStorage 加密）
- 连接状态指示器

**不做：** 不改 Agent 执行逻辑

### Phase 2：远程 Agent 执行

**目标：** Agent 在远程计算云上执行

**新增组件：**
- `RemoteAgentAdapter`（通过 SSH exec 运行远程 claude）
- 远程 SDK binary 自动部署（SFTP 上传）
- API Key 通过 SSH env 安全传递
- 远程会话 JSONL 存储

### Phase 3：远程文件 + 终端

**目标：** 完整的远程开发体验

**新增组件：**
- SFTP 文件浏览器
- 远程终端（SSH Shell → xterm.js）
- 远程 Git 操作
- 远程文件监听（polling / inotifywait）

### Phase 4：高级功能

- ProxyJump 多级跳板
- SSH Agent Forwarding
- 远程 MCP Server
- 多远程主机管理
- 连接断线自动重连 + 会话恢复

---

## 10. 部署检查清单

### Windows 跳板机

- [ ] LuxAgents Desktop 安装完成
- [ ] SSH 密钥对已生成或已有
- [ ] 能通过 SSH 连接计算云（PuTTY 已验证）
- [ ] LuxAgents 渠道配置（API Key）完成
- [ ] LuxAgents 远程连接配置完成

### Ubuntu 计算云

- [ ] SSH Server 运行中
- [ ] 目标用户可 SSH 登录
- [ ] `ldd --version` 确认 glibc 2.31+
- [ ] `ulimit -u` ≥ 4096
- [ ] 500MB+ 磁盘空闲
- [ ] Git 2.0+ 已安装
- [ ] 出站网络可达 AI Provider API（或企业代理）
- [ ] 项目源码已就位

### 安全配置

- [ ] SSH 已禁用 root 登录
- [ ] SSH 已禁用密码认证（仅密钥）
- [ ] 出站防火墙规则已配置
- [ ] Agent 权限模式设为 `ask` 或 `plan`
- [ ] 审计日志机制确认

---

## 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | 2026-07-22 | 初版：Daemon + Web 面板方案 |
| v2 | 2026-07-22 | **架构修正**：Desktop 在 Windows + Remote SSH 到计算云；Ubuntu 不需要装源码 |

## 关联文档

- `2026-07-22-remote-deployment-and-security.md`（v1 部署指南，安全风险分析仍有参考价值）
- `2026-07-21-mobile-remote-and-repo-wiki-roadmap.md`（占位文档）
