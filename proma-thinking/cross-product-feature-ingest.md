# 跨产品合入 · 大 Feature 档案

> Live Canvas：`cross-product-feature-ingest.canvas.tsx`  
> 只记整块能力迁入；日常 Proma cherry-pick 见 [proma-sync-merge-archive.md](./proma-sync-merge-archive.md)。

## 怎么记

- Status：`INGESTING` / `LANDED` / `PARTIAL` / `DROPPED`
- 新行：Source | Feature | Lux 落点 | Status | Ref | Owner | 日期

## Feature 总表

| Source | Feature | Lux surface | Status | Ref |
|---|---|---|---|---|
| craft-agents-max | Project / Kanban / TaskRunner | 项目中心 · Board · Conductor→runAgentHeadless | LANDED | AGENTS.md |
| craft-agents-max | craft Project（cwd/color/MEMORY/assets） | projects/{slug}/ · SidebarProjectSubgroup | LANDED | serverKanbanProjectsAtom |
| Teambition | 任务认领 / Picker | Board 工具栏 · TeambitionPicker | LANDED* | *手测 OAuth/API |
| Proma（产品能力） | Pi Agent runtime | agentRuntime=pi · adapters/pi-* | LANDED | sync #1170+#1221 |
| Proma | ChatGPT Codex OAuth + usage | openai-codex · Pi credential store | LANDED | #1188–#1217 |
| Proma | session-core / CLI | @luxcodex/session-core · luxcodex CLI | LANDED | early sync batches |
