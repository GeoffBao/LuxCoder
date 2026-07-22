# 自研合入 · 大 Feature 档案

> Live Canvas：`luxcoder-native-feature-log.canvas.tsx`  
> Lux 自研能力与 IA；Proma sync **冲突时结构优先保留**。

## 怎么记

- Status：`SHIPPED` / `EVOLVING` / `RETIRED`
- 新行：Feature | Surface | Status | Sync 冲突策略 | 设计/PR | 日期

## Feature 总表

| Feature | Surface | Status | Sync policy | Note |
|---|---|---|---|---|
| 顶栏 Chat \| Code | ModeSwitcher · appMode | SHIPPED | keep | Work/cowork 顶栏已退休 |
| 项目中心 Hub | activeView=projects | SHIPPED | keep | 左栏单行入口 |
| Agent专家 | ~/.luxcoder/experts · expertId | SHIPPED | keep | 尚无 session/mcpIds/Bot 注入 |
| AgentSessionItem 抽离 | app-shell/AgentSessionItem.tsx | SHIPPED | keep | 星标 port 在此 |
| SidebarProjectSubgroup | Code 侧栏项目子分组 | SHIPPED | keep | 共享 project atoms |
| Kanban workContext | triggeredBy=work | SHIPPED | keep on conflict | Conductor 跟全局 Pi |
| 品牌 / 路径 | @luxcoder · ~/.luxcoder · luxcoder_event | EVOLVING | rename-map | migration 可读 ~/.proma |
