# 发布与版本规范

## 版本真源

桌面应用的发布版本以 `apps/electron/package.json` 的 `version` 为唯一真源。Git tag 必须为相同版本加 `v` 前缀，例如应用版本为 `0.1.95` 时，发布 tag 必须是 `v0.1.95`。

根 `package.json` 是私有 workspace 配置，不参与桌面应用发布版本。`packages/shared`、`packages/core`、`packages/ui` 与 `packages/session-core` 是内部包版本：改动某个包时，按需递增该包的 patch 版本，但不用于生成 GitHub Release tag。

## 版本递增

遵循 Semantic Versioning：

- `PATCH`（`0.1.95` → `0.1.96`）：修复、UI 调整、文案和兼容性补丁。
- `MINOR`（`0.1.95` → `0.2.0`）：用户可感知的新功能或完整工作流能力。
- `MAJOR`（`0.x.y` → `1.0.0`）：不兼容迁移、数据格式或配置的破坏性变更。

普通开发提交不要求递增应用版本；在准备发布时统一确定并提交版本号。当前下一次发布版本为 `0.1.95`。

## 发布流程

1. 在发布提交中更新 `apps/electron/package.json` 的 `version`；若有受影响的内部包，同时递增其 patch 版本。
2. 在干净的提交上创建带注释 tag：`git tag -a vX.Y.Z -m "release: vX.Y.Z"`。
3. 推送提交与 tag：`git push origin main --follow-tags`。
4. GitHub Actions 在构建前校验 tag 格式必须为 `vX.Y.Z`，且去掉 `v` 后必须等于 `apps/electron/package.json` 的版本；不一致时不会执行 macOS 或 Windows 构建。
5. 在 GitHub Releases 确认 Release 不是 Draft，且 macOS arm64、Windows x64 的安装包和更新元数据均已上传。

已发布的 tag 不得移动或复用；如需修复发布内容，递增 patch 版本后重新发布。
