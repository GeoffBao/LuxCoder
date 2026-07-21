# Proma Sync · 合入历史档案

> Live Canvas（侧栏打开）：`~/.cursor/projects/.../canvases/proma-sync-merge-archive.canvas.tsx`  
> 本文件是 **git 可跟踪** 的维护源；改完后同步更新 Canvas。

## 维护约定

每次开新 `sync/proma-YYYYMMDD-xxx`：

1. 追加「Sync 分支流水」一行  
2. 写阶段性 Review 结论（可另开/更新 stage-review canvas）  
3. 合入 main 后把 Status 改为 `MERGED` + 日期  

日常 Proma cherry-pick 细节记这里；整块「其他产品 / 自研」大 feature 分别记：

- [cross-product-feature-ingest.md](./cross-product-feature-ingest.md)
- [luxagents-native-feature-log.md](./luxagents-native-feature-log.md)

## 当前 tip（2026-07-21）

| 项 | 值 |
|---|---|
| Branch | `sync/proma-20260721-b01` |
| Tip | `eec46f83` |
| vs origin/main | ~214 commits / 341 files |
| Upstream FP remaining | **0**（已对齐 v0.15.7） |
| electron | 0.1.89 |
| Default runtime | **pi** |
| Merge to main | **未合** |

## Sync 分支流水

| Branch / Wave | Range | Tip | Status | Review note |
|---|---|---|---|---|
| sync/proma-20260721-b01 | Pi #1170 → v0.15.7 + hygiene | eec46f83 | OPEN · pushed | With fixes 已清；默 Pi；可考虑合 main |
| b01 early (b1–14) | baseline → pre-Pi | 3ad7a860 一带 | superseded | 旧 stage canvas |
| batches 1–6 snapshot | early CLI / memory | — | archived | 旧 batch16 canvas |

## 本轮关键里程碑

| Upstream | Topic | Lux note |
|---|---|---|
| #1170 | Pi dual runtime | 保留 workContext / projectContext / Kanban |
| #1178 / #1221 | 默认 Pi | Conductor = settings.agentRuntime ?? pi |
| #1210 | qwen token plan | rename-map 加固 |
| #1213 / #1217 | Codex OAuth persist | 完整凭据回写 |
| #1219 / #1236 | Pi 0.80.9 + stream patch | bun install 必打 patch |
| #1232 | 会话星标 | AgentSessionItem.tsx |
| #1237 | Pi 委派直跑 | children bypassPermissions |
| eec46f83 | sync hygiene | 测路径 / 文案 / docs 0.3.201 |

## 合 main 前手测

1. `bun install` → 确认 `pi-ai` retry.js 含 terminal response patch  
2. 新会话默认 Pi；Codex OAuth 刷新回写  
3. Board 任务 → Code 流式可见  
4. 星标 hover；可切 Claude runtime  
5. 项目中心 / 专家 / 子分组无回归  
