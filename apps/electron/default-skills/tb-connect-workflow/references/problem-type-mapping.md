# 问题类型映射表

> 本文件为 connect_TB_workflow 步骤4 的参考文档，按需加载。

## 判定信息来源

| 信息来源 | 判定线索 |
|---------|---------|
| 问题单 `customfields` 的产品分类 | 如 "手机 / 软件 / 长距SIM" → SIM 卡问题 |
| 问题单标题和描述 | 如 "无法识别SIM卡" → SIM 卡问题 |
| 附件文件名 | 如 `signal.zip` → 信号/SIM 相关 |
| 日志目录结构 | 如含 `diag_logs/`、`modem/olog/` → modem 诊断日志 |

## 问题类型映射表（扩展版）

| 问题类型 | 判定线索 | 推荐调用的 skill |
|---------|---------|-----------------|
| Qualcomm Modem SIM 卡问题 | 描述含"SIM卡"、"识卡"、"注网"；分类含"长距SIM"；日志含 QDSS、QXDM | `qxdm-qcom-modem-sim-v1` |
| 代码异常 / 堆栈错误 | 日志含 Exception、StackTrace、Error 级别日志 | `TRAE-debugger` 或通用日志分析 |
| 性能问题 | 日志含 latency、timeout、慢查询、ANR | 性能分析 skill |
| 接口问题 | 日志含 HTTP 状态码、请求响应、网络错误 | 接口排查 skill |
| 数据问题 | 描述提及数据不一致、丢失、数据库错误 | 数据核对 skill |
| 连接性问题 | 描述含"无法连接"、"断连"、"WiFi"、"蓝牙" | 连接性分析 skill |
| 其他 / 无法判定 | — | 通用日志分析方法（读取日志、提取关键错误行、归纳异常模式） |

## 调用规则

- 若当前工作区已加载相关 skill，按上表调用；若无可用 skill，则使用通用日志分析方法。
- 多个 skill 可串联调用，需记录每个 skill 的输入、输出摘要。
