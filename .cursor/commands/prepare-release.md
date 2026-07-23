---
name: prepare-release
description: 根据上一 GitHub Release 之后的提交，递增版本号并写 release-notes，准备发版 PR
---

# Prepare Release（版本号 + Release Notes）

在用户要求「更新 release / 升版本 / 准备发版」时执行。只做**发版准备**（version + notes + PR），**不要**在本命令里打 tag / 推 tag（除非用户明确要求）。

规范真源：`docs/releasing.md`。

## 输入

用户可能指定：

- **bump 类型**：`patch`（默认）/ `minor` / `major`
- **目标版本**：如 `0.1.99`（若给出则不再自动算）
- **相对基线**：默认用 GitHub 上最新非 draft Release 的 tag；也可指定如 `v0.1.97`

未指定时：

1. `gh release list --limit 5` 取最新已发布 tag 作为「上一 release」
2. `apps/electron/package.json` 的 `version` 为当前工作区版本
3. 下一版本 = 上一发布版本按 bump 类型 +1（若工作区 version 已高于上一 release 且用户未指定，以工作区为准再 patch+1，或与用户确认）

## 必须做

1. **同步 main**
   ```bash
   git fetch origin main --tags
   git checkout main && git pull origin main
   ```

2. **解析版本**
   - `PREV_TAG`：上一发布 tag（如 `v0.1.97`）
   - `PREV`：去掉 `v`（如 `0.1.97`）
   - `NEXT`：目标版本（如 `0.1.98`）
   - 确认 `NEXT` 的 tag **尚不存在**（`git rev-parse v$NEXT` 应失败）
   - 确认 GitHub 上还没有同名 Release

3. **汇总变更**（写 notes 的素材）
   ```bash
   git log ${PREV_TAG}..HEAD --oneline
   gh pr list --state merged --search "merged:>=YYYY-MM-DD" --limit 30
   ```
   只写**用户可感知**的 Features / Fixes；chore/ci/docs 内部项可省略或收进「其他」。

4. **开分支**（命名随仓库 / 代理惯例，例如 `cursor/release-0-1-99-<suffix>` 或 `chore/release-v0.1.99`）
   ```bash
   git checkout -b cursor/release-<NEXT-with-dashes>
   ```

5. **改版本号**
   - 更新 `apps/electron/package.json` 的 `version` → `$NEXT`
   - **不要**顺手改 `packages/*` 的 version，除非本次内部包有实质变更且用户要求
   - 更新 `docs/releasing.md` 末句指针：  
     `当前发布版本为 \`$NEXT\`；下一次发布版本为 \`<NEXT 的 patch+1>\``

6. **写 `release-notes/v$NEXT.md`**

   模板（按需删节章节；保留 macOS 未签名说明直至配置了 `MAC_CERTS`）：

   ```markdown
   # LuxCoder vX.Y.Z 更新

   相对 `vPREV`：<一句话总结>。

   ## 新功能

   - **标题** — 说明。(#PR)

   ## Bug 修复与 UI

   - **标题** — 说明。(#PR)

   ## 其他

   - …

   ## macOS 打开说明（重要）

   当前 Release **未配置 Apple Developer ID 签名/公证**。从浏览器下载后，macOS Gatekeeper 可能误报：

   > “LuxCoder” is damaged and can’t be opened.

   **这不是安装包损坏。** 安装到 Applications 后执行：

   ```bash
   xattr -cr /Applications/LuxCoder.app
   open /Applications/LuxCoder.app
   ```

   ## 下载

   - **macOS Apple Silicon** — `LuxCoder-X.Y.Z-arm64.dmg` / `LuxCoder-X.Y.Z-arm64-mac.zip`
   - **Windows** — `LuxCoder-Setup-X.Y.Z.exe`
   ```

   对照近期 `release-notes/v*.md` 语气；下载产物文件名里的版本必须等于 `$NEXT`。

7. **提交并开 PR**
   ```bash
   git add apps/electron/package.json release-notes/v$NEXT.md docs/releasing.md
   git commit -m "chore(release): bump version to v$NEXT"
   git push -u origin HEAD
   ```
   PR 标题：`chore(release): bump version to v$NEXT`  
   PR body 写明相对 `$PREV_TAG`，并附合入后打 tag 命令：

   ```bash
   git checkout main && git pull
   git tag -a v$NEXT -m "release: v$NEXT"
   git push origin v$NEXT
   ```

8. **回复用户**
   - 下一版本号、相对哪个 tag
   - PR 链接
   - 合入后如何打 tag / 用 `release-notes/v$NEXT.md` 更新 GitHub Release body
   - **默认不要**替用户 `git push origin v$NEXT`，除非明确说「打 tag 并发布」

## 不要做

- 不要移动或复用已发布 tag
- 不要在脏工作区或非发布相关改动里夹带 version bump
- 不要把 CLAUDE.md / AGENTS.md 的版本叙述当发版必须项（用户未要求勿改）
- 不要默认改内部包 `packages/*/package.json` version
- 合入前不要打 tag；CI 会校验 tag 与 `apps/electron/package.json` 一致

## 可选（仅用户明确要求时）

- 合入 PR 后打 tag 并 push，触发 Release workflow
- 用 `gh release edit v$NEXT --notes-file release-notes/v$NEXT.md` 覆盖 Release 描述
