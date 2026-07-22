# Remote 部署指南与安全风险评估

日期：2026-07-22  
状态：**部署规划**（安装清单 + 安全评估 + 企业管控方案）  
前置：`2026-07-22-remote-development-feasibility.md`（可行性评估）  
背景：公司研发在 Windows 跳板机通过 PuTTY 连接远程 Ubuntu 计算云

---

## 目录

1. [部署架构总览](#1-部署架构总览)
2. [Ubuntu 计算云安装清单](#2-ubuntu-计算云安装清单)
3. [Windows 跳板机安装清单](#3-windows-跳板机安装清单)
4. [开发者本机（可选）](#4-开发者本机可选)
5. [安全风险评估](#5-安全风险评估)
6. [企业管控措施](#6-企业管控措施)
7. [网络策略设计](#7-网络策略设计)
8. [审计与合规](#8-审计与合规)
9. [应急响应预案](#9-应急响应预案)
10. [部署检查清单](#10-部署检查清单)

---

## 1. 部署架构总览

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              企业内网                                         │
│                                                                              │
│  ┌──────────────┐                                                            │
│  │ 开发者本机     │  RDP / 远程桌面                                            │
│  │ (家/办公)     │ ─────────────────┐                                         │
│  └──────────────┘                  ▼                                         │
│                          ┌──────────────────┐    SSH (PuTTY/OpenSSH)         │
│                          │ Windows 跳板机    │ ──────────────────┐             │
│                          │                  │                   ▼            │
│                          │ 安装：            │          ┌────────────────────┐ │
│                          │ • 现代浏览器      │          │ Ubuntu 计算云       │ │
│                          │ • OpenSSH 客户端  │          │                    │ │
│                          │ • (可选)Electron  │          │ 安装：              │ │
│                          │                  │          │ • Bun 1.2.5+       │ │
│                          │ 可通过浏览器访问   │ ◄─────── │ • Node.js 18+      │ │
│                          │ 计算云 Web 面板    │ SSH 隧道  │ • Git 2.0+         │ │
│                          └──────────────────┘          │ • Agent SDK binary │ │
│                                                        │ • LuxAgents Daemon │ │
│                                                        │ • tmux             │ │
│                                                        └────────────────────┘ │
│                                                                 │            │
│                                                                 │ 出站 HTTPS │
│                                                                 ▼            │
│                                                        ┌────────────────┐    │
│                                                        │ AI Provider API │    │
│                                                        │ (经企业代理出站)  │    │
│                                                        └────────────────┘    │
└───────────────────────────────────────────────────────────────────────────────┘
```

**核心原则：Agent SDK 和代码执行都在 Ubuntu 计算云上，其他节点只做控制面。**

---

## 2. Ubuntu 计算云安装清单

### 2.1 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| **OS** | Ubuntu 20.04+ / Debian 10+ / 任何 glibc 2.31+ 发行版 | Ubuntu 22.04 LTS |
| **架构** | x86_64 (amd64) | x86_64 |
| **内存** | 4 GB | 8 GB+（大型项目/多 Agent 并行） |
| **磁盘** | 2 GB 空闲（SDK binary ~240 MB + 依赖 + 缓存） | 10 GB+ |
| **CPU** | 任意 64-bit | 4 核+（编译密集型项目） |
| **glibc** | 2.31+ | 2.35+（Ubuntu 22.04 自带） |
| **网络** | 出站 HTTPS 到 AI Provider API | 同左 |

> **ARM64 注意**：如果计算云使用 ARM64 架构（如华为鲲鹏），需使用 `linux-arm64` SDK 子包。

### 2.2 必装组件

#### 2.2.1 系统级依赖

```bash
# 基础工具
sudo apt update && sudo apt install -y \
  build-essential \
  curl \
  wget \
  git \
  tmux \
  unzip \
  ca-certificates

# glibc 运行库（Agent SDK binary 依赖，Ubuntu 通常已预装）
# 验证：
ldd --version  # 应显示 2.31+

# 重要：如果系统安装了 musl 交叉编译包，可能导致 SDK 检测错误
# 检查：
ls /lib/libc.musl-x86_64.so.1 2>/dev/null && echo "⚠️ musl 存在，可能干扰 SDK 检测"
```

#### 2.2.2 Bun 运行时（1.2.5+）

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 验证
source ~/.bashrc  # 或 ~/.zshrc
bun --version     # 应 >= 1.2.5
```

#### 2.2.3 Node.js（18+，推荐 22 LTS）

```bash
# 方案 A：NodeSource 仓库（推荐）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 方案 B：nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# 验证
node --version  # 应 >= 18.0.0
npm --version
```

#### 2.2.4 Git（2.0+）

```bash
# Ubuntu 通常已预装
git --version  # 应 >= 2.0.0

# 如需更新
sudo add-apt-repository ppa:git-core/ppa -y
sudo apt update && sudo apt install -y git
```

#### 2.2.5 tmux（会话保活）

```bash
# 通常已在上面的基础工具中安装
tmux -V

# 基本用法
tmux new -s luxagents    # 创建命名会话
# Ctrl+B, D              # 分离（SSH 断开也不影响）
tmux attach -t luxagents # 重新附加
```

### 2.3 LuxAgents 安装

#### 2.3.1 克隆和构建

```bash
# 克隆仓库
git clone https://github.com/GeoffBao/LuxAgents.git ~/luxagents
cd ~/luxagents

# 安装依赖
bun install

# 添加 Linux SDK 子包（当前仅声明了 darwin + win32，需手动添加）
cd apps/electron
bun add -d @anthropic-ai/claude-agent-sdk-linux-x64@0.3.201

# 验证 SDK binary 可执行
ls -la node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude
chmod +x node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude
./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --version
```

#### 2.3.2 配置

```bash
# 创建配置目录
mkdir -p ~/.luxagents

# 配置 API Key（手动创建 channels.json）
# ⚠️ 计算云上没有 Electron safeStorage，API Key 将明文存储
# 必须配合文件权限保护
cat > ~/.luxagents/channels.json << 'EOF'
[
  {
    "id": "default-anthropic",
    "name": "Anthropic",
    "providerId": "anthropic",
    "apiKey": "<YOUR_API_KEY>",
    "models": ["claude-sonnet-4-20250514"],
    "createdAt": "2026-07-22T00:00:00.000Z"
  }
]
EOF

# 严格文件权限
chmod 600 ~/.luxagents/channels.json
chmod 700 ~/.luxagents
```

#### 2.3.3 Phase 0 验证（不需要 Daemon，直接 SSH 使用）

```bash
# 在计算云的 tmux 会话中运行
tmux new -s agent-test

# 方式 A：直接使用 Claude Code CLI（如果已安装）
export ANTHROPIC_API_KEY="<YOUR_KEY>"
claude -p "列出当前目录结构"

# 方式 B：使用 LuxAgents CLI
cd ~/luxagents
bun apps/cli/src/index.ts session list

# 从 Windows 跳板机远程发送命令
ssh compute-user@compute-host "cd ~/project && claude -p '分析项目结构'"
```

### 2.4 可选组件

| 组件 | 用途 | 安装方式 |
|------|------|---------|
| **Docker** | 沙箱隔离 Agent 执行 | `sudo apt install docker.io` |
| **ripgrep** | 代码搜索（SDK 内置，但独立安装有助调试） | `sudo apt install ripgrep` |
| **jq** | JSON 日志分析 | `sudo apt install jq` |
| **htop** | 进程监控 | `sudo apt install htop` |
| **Secret Service (gnome-keyring)** | 启用 safeStorage 加密（需 D-Bus） | `sudo apt install gnome-keyring dbus-x11` |

### 2.5 ulimit 配置

Agent SDK 会产生多个子进程，需确保进程限制足够：

```bash
# 检查当前限制
ulimit -a

# 关键项
ulimit -u  # max user processes，应 >= 4096
ulimit -n  # open files，应 >= 8192

# 如果不足，联系系统管理员修改 /etc/security/limits.conf
# user  soft  nproc  4096
# user  hard  nproc  8192
# user  soft  nofile 8192
# user  hard  nofile 16384
```

---

## 3. Windows 跳板机安装清单

Windows 跳板机的定位是**控制面**，不运行 Agent。

### 3.1 最小安装（浏览器方案）

| 组件 | 用途 | 安装方式 |
|------|------|---------|
| **现代浏览器** | 访问 Web 控制面板 | Chrome/Edge/Firefox（通常已有） |
| **PuTTY 或 OpenSSH** | SSH 连接计算云 + 端口转发 | 通常已有 PuTTY |

**SSH 端口转发配置（PuTTY）：**

1. 打开 PuTTY → Connection → SSH → Tunnels
2. Source port: `7890`
3. Destination: `localhost:7890`（计算云 Daemon 端口）
4. 勾选 "Local" + "Auto"
5. 点击 "Add"
6. 保存 Session

连接后，跳板机浏览器访问 `http://localhost:7890` 即可看到 Web 控制面板。

**OpenSSH 命令行（如果 Windows 10+ 有 OpenSSH）：**

```cmd
ssh -L 7890:localhost:7890 user@compute-host
```

### 3.2 增强安装（桌面方案）

| 组件 | 用途 | 安装方式 |
|------|------|---------|
| **LuxAgents Electron App** | 完整桌面体验（远程模式） | 安装包 |
| **Git for Windows** | Agent 工具链（如本地也跑 Agent） | `winget install Git.Git` |

> **注意**：如果跳板机有软件安装限制，仅使用最小安装方案（浏览器 + SSH 隧道）。

### 3.3 PuTTY SSH 配置模板

```
# 保存为 PuTTY Session "ComputeCloud-LuxAgents"

Host Name: <计算云 IP 或主机名>
Port: 22
Connection type: SSH

# Connection → SSH → Auth
Private key: <path_to_ppk_key>

# Connection → SSH → Tunnels
L7890 → localhost:7890    # Daemon API
L5173 → localhost:5173    # Web 控制面板（dev 模式）

# Connection → SSH → Keepalives
Seconds between keepalives: 30
```

---

## 4. 开发者本机（可选）

如果开发者希望从个人设备（不经跳板机）直接控制 Agent：

### 4.1 方案 A：浏览器 + VPN

```
本机浏览器 → 公司 VPN → 计算云:7890 (Web 控制面板)
```

### 4.2 方案 B：SSH 跳板穿透

```bash
# ~/.ssh/config（本机）
Host compute-cloud
  HostName <计算云 IP>
  User <username>
  ProxyJump jumpbox-user@<跳板机 IP>
  LocalForward 7890 localhost:7890
  ServerAliveInterval 30
  ServerAliveCountMax 4
```

### 4.3 方案 C：手机浏览器

- 手机安装 VPN 客户端
- 访问 `http://<计算云:7890>` 或通过隧道访问
- Web 控制面板响应式设计，手机浏览器直接可用

---

## 5. 安全风险评估

### 5.1 风险矩阵

| 风险ID | 风险描述 | 可能性 | 影响 | 风险等级 | 所属类别 |
|--------|---------|--------|------|---------|---------|
| **R01** | API Key 泄露：明文存储在计算云文件系统 | 中 | 高 | **高** | 凭证安全 |
| **R02** | Agent 读取/泄露源代码到 AI Provider | 中 | 高 | **高** | 数据泄露 |
| **R03** | Agent 执行危险命令（rm -rf, sudo 等） | 中 | 极高 | **极高** | 执行安全 |
| **R04** | Prompt 注入：恶意仓库文件诱导 Agent 执行攻击 | 低 | 极高 | **高** | 供应链 |
| **R05** | Web 控制面板未授权访问 | 低 | 高 | **中** | 访问控制 |
| **R06** | SSH 隧道被中间人攻击 | 低 | 高 | **中** | 网络安全 |
| **R07** | AI Provider API 出站流量被窃听 | 低 | 中 | **中** | 网络安全 |
| **R08** | Agent 通过 MCP/工具调用外泄数据 | 中 | 高 | **高** | 数据泄露 |
| **R09** | 会话日志含敏感信息（密钥、业务数据） | 高 | 中 | **高** | 数据保护 |
| **R10** | 多用户共享计算云账户的权限隔离 | 中 | 中 | **中** | 多租户 |
| **R11** | Agent 生成代码含硬编码密钥/凭证 | 高 | 中 | **高** | 代码安全 |
| **R12** | 依赖供应链攻击（恶意 npm 包） | 低 | 高 | **中** | 供应链 |

### 5.2 详细风险分析

#### R01：API Key 明文存储

**现状：** LuxAgents 使用 Electron `safeStorage` 加密 API Key，底层调用 OS 密钥链（macOS Keychain / Windows DPAPI / Linux Secret Service）。在 headless Ubuntu 计算云上，`safeStorage` 通常不可用，退化为**明文存储**。

**攻击路径：**
```
攻击者获取计算云 shell 权限 → cat ~/.luxagents/channels.json → 获取 AI Provider API Key
```

**影响：** API Key 被盗用可产生大额 API 费用，且可能被用于访问其他服务。

**缓解措施：** → 见 [6.1 凭证管理](#61-凭证管理)

---

#### R02：源代码泄露到 AI Provider

**现状：** Agent 运行时会将源代码片段作为上下文发送给 AI Provider API。LuxAgents 的 `buildSdkEnv()` 会将完整的 `process.env`（除 `ANTHROPIC_*`）传递给 SDK 子进程。

**攻击路径：**
```
Agent 读取源码/配置文件 → 作为 prompt context 发送到 Provider API → 经过互联网传输
```

**影响：** 核心代码、内部 API 设计、业务逻辑可能被 AI 训练或泄露。

**关键澄清：**
- Anthropic API 明确承诺**不使用 API 数据训练模型**（需确认合同条款）
- 数据在传输中使用 TLS 加密
- 但代码确实会离开企业内网到达 Provider 服务器

**缓解措施：** → 见 [6.2 数据防泄露](#62-数据防泄露)

---

#### R03：Agent 执行危险命令

**现状：** LuxAgents 权限模型有三层防护：

| 层级 | 机制 | 当前默认 |
|------|------|---------|
| **权限模式** | `bypassPermissions`（完全自动） / `plan`（只读） | **完全自动** |
| **危险命令检测** | `DANGEROUS_COMMANDS` 前缀匹配 | 检测但不阻止（仅 UI 标记） |
| **安全 Bash 模式** | `SAFE_BASH_PATTERNS` 白名单 | 仅在 plan 模式生效 |

**被标记为危险的命令（LuxAgents `permission-rules.ts`）：**
```
rm, rmdir, sudo, su, chmod, chown, mv, dd,
kill, killall, pkill,
git push, git reset, git rebase, git checkout,
git clean, git branch -D, git branch -d,
npm publish, curl, wget, ssh, scp
```

**但在默认 `bypassPermissions` 模式下，这些命令仍然可以执行！**

**攻击路径：**
```
用户提示 "清理项目" → Agent 执行 rm -rf → 数据丢失
恶意 CLAUDE.md 注入 → Agent 执行 curl 外泄数据 → 信息泄露
```

**缓解措施：** → 见 [6.3 Agent 权限管控](#63-agent-权限管控)

---

#### R04：Prompt 注入 / 投毒仓库攻击

**真实案例（2026 年 Mitiga 报告）：**  
攻击者在仓库中嵌入 poisoned `CLAUDE.md` / `.cursor/rules` / MCP 配置，AI Agent 自动读取后执行：
1. 发现 AWS 凭证
2. 枚举云和 K8s 环境
3. 窃取 CI/CD 长期凭证
4. 外泄数据到攻击者端点

**全程 < 2 分钟，仅使用合法开发工具。**

**在 LuxAgents 中的风险路径：**
```
git clone 恶意仓库 → Agent 读取 CLAUDE.md/AGENTS.md → 
隐藏指令注入 → Agent 执行 curl/ssh 外泄环境变量/密钥
```

**缓解措施：** → 见 [6.4 供应链安全](#64-供应链安全)

---

#### R08：MCP 工具调用外泄

**现状：** LuxAgents 支持用户配置 MCP Server（`mcp.json`），MCP Server 可以是任意 stdio/HTTP/SSE 端点。Agent 通过 MCP 工具可以触达**任意用户配置的外部系统**。

**攻击路径：**
```
恶意 MCP 配置（仓库内或导入）→ Agent 调用 MCP 工具 → 数据发往攻击者控制的端点
```

---

#### R09：会话日志含敏感信息

**现状：** LuxAgents 使用 JSONL 持久化所有会话消息，包括 Agent 读取的文件内容、执行的命令输出。

**存储位置：** `~/.luxagents/agent-sessions/{sessionId}.jsonl`

**风险：** 会话日志可能包含被 Agent 读取的密钥、密码、业务数据。

---

### 5.3 LuxAgents 现有安全机制

| 机制 | 实现位置 | 状态 |
|------|---------|------|
| API Key 加密 | `channel-manager.ts` safeStorage | ✅ 桌面有效 / ⚠️ 计算云退化 |
| 危险命令检测 | `permission-rules.ts` | ✅ 检测 / ⚠️ 默认不阻止 |
| 文件路径授权 | `ipc.ts` authorized roots | ✅ 渲染进程有效 / ⚠️ SDK 不受限 |
| SDK 环境变量隔离 | `buildSdkEnv()` 过滤 `ANTHROPIC_*` | ✅ 有效 |
| 日志脱敏 | `bridge-log-redaction.ts` | ✅ IM 桥接有效 |
| 渲染进程沙箱 | `contextIsolation + sandbox` | ✅ 有效 |
| 文件协议 token 门控 | `local-file-protocol.ts` TTL | ✅ 有效 |
| SDK 配置隔离 | `CLAUDE_CONFIG_DIR` 重定向 | ✅ 有效 |

---

## 6. 企业管控措施

### 6.1 凭证管理

#### 6.1.1 API Key 存储方案

**推荐方案：环境变量 + 文件权限（最小化安装）**

```bash
# 将 API Key 存入受保护的环境文件
cat > ~/.luxagents/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxxxx
EOF

chmod 600 ~/.luxagents/.env
chmod 700 ~/.luxagents

# Daemon 启动时加载
source ~/.luxagents/.env
```

**进阶方案：对接企业密钥管理**

| 方案 | 适用场景 | 实现方式 |
|------|---------|---------|
| **HashiCorp Vault** | 已有 Vault 基础设施 | `vault kv get -field=api_key secret/luxagents` |
| **AWS Secrets Manager** | 使用 AWS 服务 | `aws secretsmanager get-secret-value` |
| **Linux Secret Service** | 安装 gnome-keyring | 启用 safeStorage 原生加密 |
| **自定义 KMS** | 公司自研密钥系统 | 通过 API 获取，启动时注入 |

**启用 Linux Secret Service（使 safeStorage 工作）：**

```bash
# 安装 gnome-keyring
sudo apt install gnome-keyring dbus-x11 libsecret-1-0

# 初始化（headless 环境）
export DBUS_SESSION_BUS_ADDRESS=$(dbus-daemon --session --fork --print-address)
echo -n "password" | gnome-keyring-daemon --unlock --start --components=secrets

# 此后 safeStorage.isEncryptionAvailable() 返回 true
```

#### 6.1.2 API Key 轮换策略

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 生成新 Key    │ ──► │ 更新计算云配置 │ ──► │ 废弃旧 Key    │
│ (Provider 控台)│     │ (自动/手动)   │     │ (确认无调用后) │
└──────────────┘     └──────────────┘     └──────────────┘

建议轮换周期：每 90 天
紧急轮换：发现疑似泄露时立即执行
```

### 6.2 数据防泄露

#### 6.2.1 代码上下文控制

**方案 A：`.cursorignore` / Agent 排除规则**

在项目根目录创建排除规则，防止 Agent 读取敏感文件：

```bash
# .luxagentsignore（建议新增功能）
# 或利用 Agent Skills 中的指令限制

# 排除敏感目录
secrets/
.env*
**/credentials*
**/private_key*
**/certificates/
**/internal-docs/
```

**方案 B：目录白名单**

在 Daemon 配置中限定 Agent 可访问的目录：

```json
{
  "allowedDirectories": [
    "/home/user/projects/module-a/src",
    "/home/user/projects/module-a/tests"
  ],
  "deniedPatterns": [
    "**/.env*",
    "**/secrets/**",
    "**/*credential*",
    "**/*password*"
  ]
}
```

**方案 C：企业代理审计（推荐）**

在出站代理上审计/记录 AI API 请求（不解密内容，只记录元数据）：

```
计算云 Agent → 企业 HTTPS 代理 → AI Provider API
                    ↓
              审计日志（时间、目标、请求大小、Token 用量）
```

#### 6.2.2 Provider 选择建议

| Provider | 数据政策 | 适合场景 |
|----------|---------|---------|
| **Anthropic API** | 不用 API 数据训练；30 天日志保留 | 通用推荐 |
| **私有部署 LLM** | 数据不出企业 | 极高安全要求 |
| **Azure OpenAI** | 企业数据隔离；可选不保留 | 已有 Azure 合同 |
| **AWS Bedrock Claude** | 数据不出 AWS 账户 | 已有 AWS 基础设施 |

**如果代码绝对不能出企业内网：** 使用私有部署 LLM（通过 LuxAgents 的 Custom Provider 端点接入）。

### 6.3 Agent 权限管控

#### 6.3.1 强制权限模式（企业关键措施）

**当前问题：** LuxAgents 默认 `bypassPermissions`，Agent 可执行任何命令。

**企业部署必须改为 `plan` 模式或 `ask` 模式：**

| 模式 | 行为 | 适合场景 |
|------|------|---------|
| **plan（计划模式）** | 只读操作自动通过，写操作需确认 | 代码审查、分析 |
| **ask（询问模式）** | 每个工具调用都需要用户批准 | 生产环境操作 |
| **auto（自动模式）** | 全部自动批准 | **⚠️ 企业不推荐** |

```json
// Daemon 配置：强制权限模式
{
  "defaultPermissionMode": "plan",
  "allowAutoMode": false,
  "dangerousCommandPolicy": "block"  // 建议新增：直接阻止危险命令
}
```

#### 6.3.2 命令黑名单增强

在 LuxAgents 现有 `DANGEROUS_COMMANDS` 基础上，企业应额外阻止：

```typescript
const ENTERPRISE_BLOCKED_COMMANDS = [
  // 现有 DANGEROUS_COMMANDS...

  // 网络外泄
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'socat',
  'ssh', 'scp', 'sftp', 'rsync',
  'ftp', 'tftp',

  // 系统操作
  'sudo', 'su', 'passwd', 'useradd', 'userdel',
  'systemctl', 'service', 'init',
  'mount', 'umount', 'fdisk',
  'iptables', 'ufw', 'firewall-cmd',

  // 容器逃逸
  'docker', 'podman', 'kubectl', 'helm',

  // 包管理（防止安装恶意包）
  'pip install', 'npm install', 'bun add',  // 可选，需评估

  // 编译器/解释器直接执行（防止运行任意代码）
  'python -c', 'node -e', 'perl -e', 'ruby -e',
]
```

#### 6.3.3 文件系统沙箱

**方案 A：Linux 用户隔离（最小改动）**

```bash
# 为 Agent 创建专用受限用户
sudo useradd -m -s /bin/bash luxagent
sudo usermod -aG <project-group> luxagent

# Agent 只能访问项目目录
chmod 750 /home/user/projects
chown user:<project-group> /home/user/projects

# Daemon 以 luxagent 用户运行
sudo -u luxagent luxagents-daemon --config /etc/luxagents/daemon.json
```

**方案 B：容器沙箱（推荐，强隔离）**

```yaml
# docker-compose.yml
services:
  luxagents-daemon:
    build: .
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - ./project-src:/workspace:ro       # 源码只读挂载
      - ./agent-workspace:/agent:rw       # Agent 工作目录
      - ./luxagents-config:/config:ro     # 配置只读
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - DAC_OVERRIDE  # 文件访问
    networks:
      - egress-only
    environment:
      - ANTHROPIC_API_KEY_FILE=/run/secrets/api_key
    secrets:
      - api_key

secrets:
  api_key:
    file: ./secrets/anthropic-api-key.txt

networks:
  egress-only:
    driver: bridge
    # 配合 iptables 限制出站目标
```

**方案 C：Firejail 沙箱（轻量）**

```bash
firejail --private=/home/luxagent/workspace \
         --net=none \
         --no-new-privs \
         luxagents-daemon
```

### 6.4 供应链安全

#### 6.4.1 仓库安全扫描

在 Agent 访问仓库前，扫描潜在投毒文件：

```bash
# 检查可疑 Agent 配置文件
check_files=(
  "CLAUDE.md"
  "AGENTS.md"
  ".cursor/rules"
  ".cursor/mcp.json"
  ".mcp.json"
  ".luxagents/mcp.json"
)

for f in "${check_files[@]}"; do
  if [ -f "$f" ]; then
    echo "⚠️ 发现 Agent 配置文件: $f"
    # 检查是否包含可疑命令
    grep -n -i 'curl\|wget\|ssh\|exfiltrat\|steal\|secret\|credential\|env\|token' "$f" && \
      echo "  ⚠️ 可能含有可疑指令，请人工审查"
  fi
done
```

#### 6.4.2 MCP Server 白名单

```json
// 企业配置：仅允许审批过的 MCP Server
{
  "mcp": {
    "allowedServers": [
      {"name": "company-docs", "type": "http", "url": "http://internal-docs-mcp.corp/"},
      {"name": "jira", "type": "http", "url": "http://jira-mcp.corp/"}
    ],
    "blockExternalMcp": true,
    "blockStdioMcp": false  // stdio 类型本地运行，相对安全
  }
}
```

#### 6.4.3 依赖锁定

```bash
# 使用 lockfile 锁定所有依赖版本
bun install --frozen-lockfile

# 定期审计依赖
bunx npm-audit-ci --critical
```

---

## 7. 网络策略设计

### 7.1 出站防火墙规则

```
┌─────────────────────────────────────────────────────────────────┐
│                    Ubuntu 计算云防火墙                            │
│                                                                 │
│  ✅ 允许出站：                                                   │
│  ├── api.anthropic.com:443         (Anthropic API)              │
│  ├── api.openai.com:443            (OpenAI API，如需要)          │
│  ├── generativelanguage.googleapis.com:443  (Google AI，如需要)  │
│  ├── <company-proxy>:8080          (企业代理，如使用)             │
│  ├── github.com:443                (Git 仓库，如需要)            │
│  └── npm.registry.npmjs.org:443    (包管理，如需要)              │
│                                                                 │
│  ✅ 允许入站（仅限内网）：                                        │
│  ├── <跳板机 IP>:22                (SSH 管理)                    │
│  └── 127.0.0.1:7890               (Daemon API，仅 SSH 隧道)     │
│                                                                 │
│  ❌ 阻止：                                                       │
│  ├── 所有其他出站                                                 │
│  ├── 任何入站公网连接                                              │
│  └── Daemon 端口直接暴露公网                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 iptables 参考规则

```bash
# 清空现有规则
sudo iptables -F OUTPUT

# 允许回环
sudo iptables -A OUTPUT -o lo -j ACCEPT

# 允许已建立连接
sudo iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 允许 DNS
sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
sudo iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# 允许 AI Provider API（按需开放）
sudo iptables -A OUTPUT -d api.anthropic.com -p tcp --dport 443 -j ACCEPT

# 允许企业代理（如使用）
sudo iptables -A OUTPUT -d <proxy-ip> -p tcp --dport 8080 -j ACCEPT

# 允许内部 Git
sudo iptables -A OUTPUT -d <git-server> -p tcp --dport 443 -j ACCEPT
sudo iptables -A OUTPUT -d <git-server> -p tcp --dport 22 -j ACCEPT

# 拒绝所有其他出站
sudo iptables -A OUTPUT -j REJECT

# 持久化
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### 7.3 企业代理集成

LuxAgents 已支持 HTTP(S) 代理：

```json
// ~/.luxagents/proxy-settings.json
{
  "mode": "manual",
  "httpProxy": "http://proxy.corp.internal:8080",
  "httpsProxy": "http://proxy.corp.internal:8080",
  "noProxy": "localhost,127.0.0.1,.corp.internal"
}
```

`buildSdkEnv()` 会自动将代理设置注入 SDK 子进程的 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量。

---

## 8. 审计与合规

### 8.1 审计日志设计

| 事件类型 | 记录内容 | 存储位置 |
|----------|---------|---------|
| **Agent 启动/停止** | 时间、用户、会话ID、工作区、模型 | Daemon 日志 |
| **消息发送** | 时间、会话ID、prompt 摘要（前100字） | Daemon 日志 |
| **工具调用** | 工具名、参数摘要、结果状态 | 会话 JSONL |
| **命令执行** | Bash 命令全文、退出码 | 会话 JSONL |
| **文件读写** | 路径、操作类型、大小 | 会话 JSONL |
| **权限请求/响应** | 工具名、用户决策、时间 | Daemon 日志 |
| **API 调用** | Provider、模型、Token 用量、耗时 | Daemon 日志 |
| **登录/认证** | Token 验证、来源 IP | Daemon 日志 |
| **异常/错误** | 错误类型、堆栈摘要 | Daemon 日志 |

```bash
# 审计日志位置（建议）
~/.luxagents/audit/
├── daemon-YYYY-MM-DD.log        # Daemon 操作日志（按天轮转）
├── api-usage-YYYY-MM.json       # API 用量月度统计
└── security-events.log          # 安全事件（危险命令、权限拒绝等）

# 日志轮转配置（logrotate）
cat > /etc/logrotate.d/luxagents << 'EOF'
/home/*/.luxagents/audit/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
}
EOF
```

### 8.2 Token 用量监控

```bash
# 建议实现的用量控制
{
  "usage": {
    "dailyTokenLimit": 1000000,        // 每日 Token 上限
    "monthlyBudgetUSD": 500,           // 月度预算（美元）
    "alertThresholdPercent": 80,       // 80% 时告警
    "alertChannel": "feishu",          // 告警通道
    "perSessionMaxTokens": 200000,     // 单会话 Token 上限
    "perSessionMaxTurns": 50           // 单会话最大轮次
  }
}
```

### 8.3 合规检查清单

| 检查项 | 要求 | 建议做法 |
|--------|------|---------|
| **数据分类** | 确认代码是否属于受限数据 | 按项目标记敏感级别；机密项目禁用 AI Agent |
| **第三方数据处理** | AI Provider 的数据处理协议 | 签署 DPA；确认不用于训练 |
| **日志保留** | 审计日志保留期限 | 最少 90 天；安全事件 1 年 |
| **访问控制** | 谁可以启动/管理 Agent | Token 按人发放；操作可追溯 |
| **事件响应** | 数据泄露应急流程 | → 见 [9. 应急响应预案](#9-应急响应预案) |
| **变更管理** | 配置变更审批 | MCP Server / 权限模式变更需审批 |
| **供应商评估** | AI Provider 安全评估 | 定期评估 Provider 安全公告和合规状态 |

---

## 9. 应急响应预案

### 9.1 事件分级

| 级别 | 场景 | 响应时间 |
|------|------|---------|
| **P1 紧急** | API Key 确认泄露；Agent 执行了数据外泄命令 | 15 分钟 |
| **P2 严重** | 疑似 Prompt 注入攻击；异常大量 API 调用 | 1 小时 |
| **P3 一般** | Agent 误删文件（有 Git 备份）；权限配置错误 | 4 小时 |

### 9.2 P1 紧急响应流程

```
1. 立即停止 Daemon
   kill $(pgrep -f luxagents-daemon)

2. 轮换 API Key
   登录 Provider 控制台 → 废弃当前 Key → 生成新 Key

3. 检查 Agent 会话日志
   grep -r 'curl\|wget\|ssh\|nc' ~/.luxagents/agent-sessions/*.jsonl

4. 检查外泄范围
   - 审查 Agent 执行的所有 Bash 命令
   - 检查是否有数据发往外部 IP
   - 检查 Git 提交历史是否包含凭证

5. 通知安全团队
   - 提供会话日志、时间线、影响范围评估

6. 恢复服务
   - 使用新 Key 更新配置
   - 确认权限模式正确
   - 重启 Daemon
```

### 9.3 定期安全检查

```bash
#!/bin/bash
# security-check.sh - 每周运行

echo "=== LuxAgents 安全检查 ==="

# 1. 检查文件权限
echo "--- 敏感文件权限 ---"
stat -c '%a %n' ~/.luxagents/channels.json
stat -c '%a %n' ~/.luxagents/.env 2>/dev/null

# 2. 检查异常进程
echo "--- Agent 相关进程 ---"
ps aux | grep -E 'claude|luxagents' | grep -v grep

# 3. 检查最近的危险命令
echo "--- 最近 7 天危险命令记录 ---"
find ~/.luxagents/agent-sessions/ -name '*.jsonl' -mtime -7 -exec \
  grep -l -E '"(rm |sudo |curl |wget |ssh |scp )' {} \;

# 4. 检查 API 用量异常
echo "--- 最近会话 Token 统计 ---"
find ~/.luxagents/agent-sessions/ -name '*.jsonl' -mtime -1 -exec wc -l {} \;

# 5. 检查 MCP 配置
echo "--- MCP Server 配置 ---"
find ~/.luxagents/agent-workspaces/ -name 'mcp.json' -exec cat {} \;

# 6. 检查未授权文件
echo "--- 配置目录异常文件 ---"
find ~/.luxagents/ -newer ~/.luxagents/channels.json -name '*.json' -o -name '*.js'
```

---

## 10. 部署检查清单

### 10.1 计算云部署前

- [ ] 确认 OS 版本 ≥ Ubuntu 20.04（glibc ≥ 2.31）
- [ ] 确认 CPU 架构（x86_64 / arm64）
- [ ] 确认 `ulimit -u` ≥ 4096
- [ ] 确认出站网络可达 AI Provider API
- [ ] 确认可使用 tmux 或 systemd --user
- [ ] 确认磁盘空间 ≥ 2 GB 空闲
- [ ] 确认 RAM ≥ 4 GB

### 10.2 安装验证

- [ ] Bun 版本 ≥ 1.2.5
- [ ] Node.js 版本 ≥ 18
- [ ] Git 版本 ≥ 2.0
- [ ] Agent SDK binary 可执行（`./claude --version`）
- [ ] 无 musl 检测冲突（`ldd --version` 确认 glibc）
- [ ] `~/.luxagents/` 目录权限 700
- [ ] `channels.json` 文件权限 600

### 10.3 安全配置

- [ ] API Key 使用文件权限或密钥管理系统保护
- [ ] 权限模式设为 `plan` 或 `ask`（非 `auto`）
- [ ] 出站防火墙规则配置完成
- [ ] MCP Server 白名单配置完成（如启用）
- [ ] 审计日志目录创建并配置轮转
- [ ] 安全检查脚本部署并加入 cron

### 10.4 Windows 跳板机

- [ ] PuTTY / OpenSSH 可用
- [ ] SSH 端口转发配置正确
- [ ] 浏览器可通过隧道访问计算云 Daemon

### 10.5 运维就绪

- [ ] Daemon 启停脚本/服务配置完成
- [ ] 日志监控和告警配置完成
- [ ] 应急响应流程团队已知晓
- [ ] API Key 轮换流程确认

---

## 修订关系

- 承接：`2026-07-22-remote-development-feasibility.md`（可行性评估）
- 关联：`2026-07-21-mobile-remote-and-repo-wiki-roadmap.md`（占位文档）
- 本文性质：部署规划 + 安全评估；实施前须经安全团队评审确认
