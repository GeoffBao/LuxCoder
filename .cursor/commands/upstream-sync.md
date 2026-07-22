---
name: upstream-sync
description: Proma upstream cherry-pick / sync 完成后的门禁与 rename 修复
---

# Upstream Sync Gate

在从 `upstream`（proma-ai/Proma）cherry-pick / merge 解完冲突之后执行。

## 必须做

1. 先 dry-run 看 rename 面：
   ```bash
   bun run sync:apply-renames
   ```
2. 确认无误后落盘（改到 `default-skills/*/SKILL.md` 时会自动 patch bump version）：
   ```bash
   bun run sync:apply-renames -- --write
   ```
3. 跑门禁（失败不合并）：
   ```bash
   bun run sync:check
   ```
4. 若本次动了 default-skills，加上游对比：
   ```bash
   bun run sync:check -- --skills-upstream
   ```
5. `bun run typecheck`
6. 若动了 SDK / `agent-orchestrator` / adapter：手动冒烟 —— Code 发一轮消息；若相关则 Work 跑一个 task

## 规则

- **rename**：只走 `scripts/upstream-sync/rename-map.json`，不要手搓全库替换
- **allowlist**：`migration-service.ts` 里故意保留的 `~/.proma` 迁移逻辑不要改
- **文档残留**（CLAUDE.md / AGENTS.md / README）：默认 warn；需要硬卡时用 `bun run sync:check -- --strict-docs`
- **SDK**：`apps/electron/package.json` 主包 + 4 个 optionalDeps + 根 `overrides` 版本必须一致；`electron-builder.yml` files 必须覆盖主包+平台包
- **skills**：改了 `default-skills/<skill>/` 内容必须 bump version；`sync:apply-renames --write` 改到 SKILL.md 时会自动 patch +1
- **裁决**：Lux 独有（Kanban / 项目中心 / Agent专家 / `@luxcoder`）站本地；纯 bugfix / security 站上游

## 不要做

- 不要从 `sync/*` 分支开新 feature
- 不要在未跑 `sync:check` 的情况下合并 sync PR
- 不要无条件把文档里的历史 `@proma` 叙述全删（设计文档在 allowlist；运行时路径必须改）
- **不做双向贡献**：不要向 proma-ai/Proma 开反向 PR；只单向吃上游
