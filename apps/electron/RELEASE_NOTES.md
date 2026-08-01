# LuxCoder v0.6.0

## 文件与项目体验

- **Files 统一**：右侧文件面板收敛为「Files / 文件改动」，Files 内新增「会话文件 / 项目文件」二级来源筛选，按会话记忆上次选择。
- **项目文件浏览**：支持在会话授权范围内浏览 / 打开 / 重命名 / 删除 / 移动项目（Project / Git Worktree）文件，不再受旧的工作区沙箱限制。
- **@ 引用更可靠**：修复项目与会话存在相同相对路径时的冲突；会话内相对路径按会话根目录解析，避免读错文件。
- **会话悬浮预览**：新增设置开关（默认关闭），左侧会话行悬浮可展示迷你地图预览。

## 设置

- 恢复「语音输入」「数据迁移」「磁盘管理」设置入口。
- Markdown 预览默认字号调整为「小」（13px），更紧凑。
- Chat 工具入口随 Chat 模式下线；旧备份中的 Chat 工具导入兼容逻辑保留。

## 渠道与模型

- **xAI（Grok）订阅 OAuth 登录**：支持 xAI 订阅渠道的 device-code 授权、自动续期与模型拉取。
- 保留 Claude 订阅 OAuth、ChatGPT (Codex) OAuth、OpenRouter、NUWA 等既有渠道能力。

## 平台与稳定性

- 新增 **Linux (Ubuntu)** 构建产物：AppImage + deb。
- 发布矩阵覆盖：**macOS arm64 / macOS Intel / Windows x64 / Ubuntu x64**。
- Windows 剪贴板与规划窗口操作修复。
- 灵动岛（Agent Island）功能**暂停启用**，等待后续 CodeClaw 桌宠替代；相关代码与设置项保留。

## 上游同步

同步 Proma upstream 至 `ff9a9b58`，含 Agent Island 完成态同步、macOS 26 兼容守卫等修复。
