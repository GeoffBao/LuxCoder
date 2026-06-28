# LuxAgents Baseline — Codebase Review

> Date: 2026-06-28
> Upstream: Proma v0.13.19 (ErlichLiu/Proma)
> Branch: luxagents/bootstrap

## Source

Forked from Proma. Full monorepo preserved.

## Local Run Result

- bun install: **待执行** — node_modules 未安装
- dev command: **待验证**
- Electron window: **待验证**
- Chat mode: 已有（ModeSwitcher 支持 chat ↔ agent）
- Agent mode: 已有（基于 Claude Agent SDK v0.3.185）
- dist 文件: 存在（main.cjs 25MB, preload.cjs 75KB），但需确认是否对应当前源码

## Monorepo Structure (Actual)

```
LuxAgents/
├── packages/
│   ├── shared/     # @proma/shared — types, config, utils, constants
│   ├── core/       # @proma/core — AI Provider 适配器, Shiki highlight
│   └── ui/         # @proma/ui — CodeBlock, MermaidBlock
├── apps/
│   └── electron/   # @proma/electron (v0.13.19) — Electron 桌面应用
│       └── src/
│           ├── main/       # 主进程 + 服务层
│           │   └── lib/
│           │       ├── adapters/claude-agent-adapter.ts  ← 已有 adapter 模式
│           │       ├── agent-service.ts
│           │       ├── agent-orchestrator.ts  (~71KB，改造最重)
│           │       ├── agent-permission-service.ts  ← 已有 permission
│           │       ├── agent-session-manager.ts
│           │       ├── agent-prompt-builder.ts
│           │       ├── agent-workspace-manager.ts
│           │       └── builtin-mcp/                  ← 已有 MCP
│           ├── preload/    # IPC 桥接
│           └── renderer/   # React + Vite + Tailwind + Radix UI
│               ├── components/app-shell/
│               │   ├── AppShell.tsx        # 布局：[LeftSidebar | MainArea | RightSidePanel]
│               │   ├── ModeSwitcher.tsx    # Chat ↔ Agent 切换（只有两个按钮）
│               │   └── LeftSidebar.tsx
│               ├── atoms/
│               │   └── app-mode.ts         # type AppMode = 'chat' | 'agent' | 'scratch'
│               ├── components/agent/       # Agent UI (AgentView, SDKMessageRenderer, etc.)
│               ├── components/chat/        # Chat UI (ChatView, ChatInput, etc.)
│               └── components/diff/        # Diff viewer
├── docs/
│   └── luxagents/
│       ├── 00-baseline.md      ← 本文件
│       ├── 01-code-map.md      ← 代码地图（品牌改造导航）
│       ├── 02-migration-plan.md ← 迁移计划
│       └── README.md
└── proma-thinking/              # 原 Proma 产品思考文档
```

## Key Dependencies

| Dependency | Version | Notes |
|------------|---------|-------|
| @anthropic-ai/claude-agent-sdk | 0.3.185 | **Agent SDK，不是 Claude Code SDK** |
| @anthropic-ai/sdk | ^0.93.0 | Anthropic API 客户端 |
| @modelcontextprotocol/sdk | ^1.29.0 | MCP SDK |
| electron | ^39.5.1 | 桌面框架 |
| react | ^18.3.1 | UI |
| jotai | workspace | 状态管理 |
| tailwindcss | ^3.4.17 | CSS 框架 |
| Radix UI | various | UI 组件库 |
| @larksuiteoapi/node-sdk | ^1.65.0 | 飞书集成 |

## Existing Theme System

- CSS 变量驱动，支持 7 种主题（ocean/forest/slate/terminal × light/dark）
- `tailwind.config.js` 已预留 `craft-accent: #DA7756`（LuxAgents 品牌色）
- 字体：Inter Variable + JetBrains Mono

## App Mode System (Current)

```typescript
// apps/electron/src/renderer/atoms/app-mode.ts
export type AppMode = 'chat' | 'agent' | 'scratch'
export const appModeAtom = atomWithStorage<AppMode>('proma-app-mode', 'agent')
```

- ModeSwitcher 只暴露 Chat / Agent 两个按钮
- 需要扩展为 Chat / Code / Cowork 三模式

## Architecture Decision: One SDK, Two Providers

```
┌─────────────────────────────────────────┐
│         Claude Agent SDK                │  ← 统一 agent loop
│   (think → tool_call → result → …)      │
├────────────────────┬────────────────────┤
│  provider: hermes  │ provider: anthropic│
│  (Hermes Agent)    │  (Claude)          │
├────────────────────┼────────────────────┤
│  Chat Mode         │  Code / Cowork     │
│  知识助理           │  工程执行          │
└────────────────────┴────────────────────┘
```

不需要两套 agent 架构。Hermes 作为新 provider 接入现有 Agent SDK。

## Things Already Present (Don't Reinvent)

- [x] Claude Agent SDK integration (agent loop, streaming, tools)
- [x] MCP tool registry + builtin servers
- [x] Skills system with UI (import, detail sheet, validation)
- [x] Agent permission service (可沿用，确认 4-tier 对齐)
- [x] Diff viewer with inline preview
- [x] Multi-tab system (TabBar + TabContent)
- [x] Theme system with CSS variables
- [x] File browser + workspace watcher
- [x] Onboarding + tutorial system
- [x] Settings system (channels, bots, shortcuts, etc.)
- [x] Auto-updater (electron-updater)
- [x] Feishu/DingTalk/WeChat bridge integration
- [x] Runtime adapter pattern (`claude-agent-adapter.ts`)

## Things Definitely Missing (Need Net-New Build)

- [ ] Hermes Agent provider（扩 provider 注册表）
- [ ] Teambition API client + auth
- [ ] Kanban board UI (5-phase)
- [ ] TaskOrchestrator (worktree management + agent dispatch)
- [ ] spec-kit workflow engine (rca → implement → verify)
- [ ] TB writeback (status, spec_url, attachments)
- [ ] Git worktree manager
- [ ] Cowork mode UI (kanban + task detail + writeback panel)
- [ ] RAG/Knowledge ACL system
- [ ] SSO/RBAC (P6)
- [ ] Model Gateway (P6)

## Storage: JSON/JSONL First, SQLite FTS5 Later

参考 craft-agents-max 的混合方案：
- 会话消息 → JSONL（不改）
- 配置/记忆 → JSON + Markdown（不改）
- Cowork 看板 → JSON/JSONL 起步
- 全文搜索 → 后续加 SQLite FTS5（参考 craft-agents-max `{workspace}/.craft/memory-index/`）
- MVP 阶段不引入数据库

## Branding Replacement — Full Checklist

| # | 原 | 改 | 位置 | 阶段 |
|---|----|----|------|------|
| 1 | `APP_NAME = 'Proma'` | `'LuxAgents'` | `packages/shared/src/config/index.ts` | P1a |
| 2 | `~/.proma/` (prod) / `~/.proma-dev/` (dev) | `~/.luxagents/` / `~/.luxagents-dev/` | `config-paths.ts` | P1a |
| 3 | `com.proma.app` / `ai.proma.app` | `com.luxshare.luxagents` | `electron-builder.yml` + `main/index.ts` | P1a |
| 4 | `Proma` (productName) | `LuxAgents` | `electron-builder.yml` | P1a |
| 5 | `.proma-backup` / `.proma-share` | `.luxagents-backup` / `.luxagents-share` | `electron-builder.yml` + `main/index.ts` | P1a |
| 6 | `proma-file://` 协议 | `luxagents-file://` | `apps/electron/src/main/index.ts` | P1a |
| 7 | `proma-*` localStorage keys | `luxagents-*` | 所有 `atomWithStorage` 调用 | P1a |
| 8 | Proma logo 资源 | LuxAgents logo | `resources/proma-logos/` + `renderer/assets/bots/proma-logos/` | P1a |
| 9 | GPU 加速禁用宏 `proma` | `luxagents` | 待确认 grep | P1a |
| 10 | GitHub URL `ErlichLiu/Proma` | `GeoffBao/LuxAgents` | `AboutSettings.tsx` | P1a |
| 11 | `proma-coach` skill | `luxagents-coach` | `default-skills/proma-coach/SKILL.md` | P1a |
| 12 | `PromaLogoSettings.tsx` | Logo 设置页替换 | `renderer/components/settings/` | P1a |
| 13 | `@proma/shared` 等 4 个包名 | `@luxagents/shared` 等 | 全库 300+ import + package.json + tsconfig | P1b |
| 14 | `~/.proma/` → `~/.luxagents/` 迁移 | 自动迁移脚本 | `migration-service.ts` | P1a |

## Notes

- 原 Proma 项目名/作者：ErlichLiu，erlichliu@gmail.com
- IPC channel 常量字符串值无 `proma:` 前缀，无需替换（只需替换 `proma-file://` 协议）
- 数据迁移脚本在 Phase 1a 实现，不影响老用户数据
- 不改 CLAUDE.md 规范
