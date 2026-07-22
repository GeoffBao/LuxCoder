# P1a 品牌替换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Proma 视觉/系统层面替换为 LuxCodex：品牌字符串、数据目录、Electron 元数据、localStorage 键名、三模式 Tab，不改任何核心功能逻辑，不改 `@proma/*` 包名（留给 P1b）。

**Architecture:** 逐文件替换，无结构变化。新增 `migration-service.ts` 在首次启动时把 `~/.luxcodex/` 数据迁移到 `~/.luxcodex/`（非破坏性，保留原目录）。ModeSwitcher 扩展为三按钮滑块（Chat / Code / Work），Work 为占位 UI。

**Tech Stack:** TypeScript, Electron, React, Jotai, Tailwind CSS, esbuild

---

## 文件一览

| 状态 | 文件 | 改动概要 |
|------|------|---------|
| Modify | `packages/shared/src/config/index.ts` | APP_NAME |
| Modify | `packages/core/src/providers/user-agent.ts` | 函数名、repo URL、UA 字符串 |
| Modify | `packages/core/src/providers/anthropic-adapter.ts` | 更新 import |
| Modify | `apps/electron/electron-builder.yml` | appId、productName、fileAssoc、publish |
| Modify | `apps/electron/src/main/index.ts` | protocol、userData、file ext、import |
| Modify | `apps/electron/src/main/lib/config-paths.ts` | dir 名、env var |
| Create | `apps/electron/src/main/lib/migration-service.ts` | 数据目录迁移 |
| Modify | `apps/electron/src/renderer/atoms/app-mode.ts` | 键名、添加 'cowork' 类型 |
| Modify | `apps/electron/src/renderer/atoms/agent-atoms.ts` | 3 个 localStorage 键 |
| Modify | `apps/electron/src/renderer/atoms/preview-atoms.ts` | 2 个 localStorage 键 |
| Modify | `apps/electron/src/renderer/atoms/system-prompt-atoms.ts` | 1 个 localStorage 键 |
| Modify | `apps/electron/src/renderer/atoms/sidebar-atoms.ts` | 1 个 localStorage 键 |
| Modify | `apps/electron/src/renderer/atoms/tab-atoms.ts` | 2 个 localStorage 键 + tutorial 标题 |
| Modify | `apps/electron/src/renderer/atoms/theme.ts` | 3 个缓存键常量 |
| Modify | `apps/electron/src/renderer/atoms/chat-atoms.ts` | 4 个 localStorage 键 |
| Modify | `apps/electron/src/renderer/components/settings/AboutSettings.tsx` | GitHub URL、页面标题 |
| Modify | `apps/electron/src/renderer/components/settings/FeishuSettings.tsx` | UI 文案中的 Proma → LuxCodex |
| Modify | `apps/electron/src/renderer/components/settings/WeChatSettings.tsx` | UI 文案中的 Proma → LuxCodex |
| Rename | `apps/electron/src/renderer/components/settings/PromaLogoSettings.tsx` → `AppLogoSettings.tsx` | 组件名、内部注释 |
| Modify | `apps/electron/src/renderer/components/settings/BotHubSettings.tsx` | 更新 import |
| Rename | `apps/electron/default-skills/proma-coach/` → `luxcodex-coach/` | 目录 + SKILL.md 内容 |
| Modify | `apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx` | 三模式滑块 |

---

## Task 1: 品牌字符串常量

**Files:**
- Modify: `packages/shared/src/config/index.ts`
- Modify: `packages/core/src/providers/user-agent.ts`
- Modify: `packages/core/src/providers/anthropic-adapter.ts`

- [ ] **Step 1: 更新 APP_NAME**

```typescript
// packages/shared/src/config/index.ts
/**
 * Shared configuration for LuxCodex
 */

export const APP_NAME = 'LuxCodex'
```

- [ ] **Step 2: 重写 user-agent.ts**

```typescript
// packages/core/src/providers/user-agent.ts
const LUXCODEX_REPO_URL = 'https://github.com/GeoffBao/LuxCodex'

let _appVersion = '0.0.0'

export function setAppVersion(version: string): void {
  _appVersion = version
}

export function getAppVersion(): string {
  return _appVersion
}

export function getAppUserAgent(version?: string): string {
  const v = version ?? _appVersion
  return `LuxCodex/${v} (+${LUXCODEX_REPO_URL})`
}
```

- [ ] **Step 3: 更新 anthropic-adapter.ts import**

找到 `packages/core/src/providers/anthropic-adapter.ts` 中：
```typescript
import { getPromaUserAgent } from './user-agent.ts'
```
改为：
```typescript
import { getAppUserAgent } from './user-agent.ts'
```

找到两处 `getPromaUserAgent()` 调用（约第 283、288 行），全部改为 `getAppUserAgent()`。

- [ ] **Step 4: 类型检查**

```bash
cd packages/core && bun run typecheck
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/index.ts packages/core/src/providers/user-agent.ts packages/core/src/providers/anthropic-adapter.ts
git commit -m "brand: rename APP_NAME and user-agent constants to LuxCodex"
```

---

## Task 2: electron-builder.yml 元数据

**Files:**
- Modify: `apps/electron/electron-builder.yml`

- [ ] **Step 1: 更新 appId / productName / copyright**

```yaml
appId: com.luxshare.luxcodex
productName: LuxCodex
copyright: Copyright © 2024-2026 Luxshare
```

- [ ] **Step 2: 更新 fileAssociations（mac + win 各一处）**

mac 和 win 的 fileAssociations 把 `.luxcodex-backup` / `.luxcodex-share` 改为 `.luxcodex-backup` / `.luxcodex-share`：

```yaml
# mac section
fileAssociations:
  - ext: luxcodex-backup
    name: LuxCodex Personal Backup
    role: Editor
  - ext: luxcodex-share
    name: LuxCodex Share Package
    role: Editor
```

```yaml
# win section
fileAssociations:
  - ext: luxcodex-backup
    name: LuxCodex Personal Backup
    icon: resources/icon.ico
  - ext: luxcodex-share
    name: LuxCodex Share Package
    icon: resources/icon.ico
```

- [ ] **Step 3: 更新 extendInfo 描述文案**

```yaml
extendInfo:
  NSMicrophoneUsageDescription: "LuxCodex 需要访问麦克风，用于将你的语音实时转写为文本。"
```

- [ ] **Step 4: 更新 publish**

```yaml
publish:
  provider: github
  owner: GeoffBao
  repo: LuxCodex
```

- [ ] **Step 5: Commit**

```bash
git add apps/electron/electron-builder.yml
git commit -m "brand: update electron-builder metadata to LuxCodex"
```

---

## Task 3: main/index.ts Electron 主进程品牌替换

**Files:**
- Modify: `apps/electron/src/main/index.ts`

- [ ] **Step 1: 更新 userData 路径**

第 8 行：
```typescript
// 原：app.setPath('userData', join(app.getPath('appData'), '@proma/electron-dev'))
app.setPath('userData', join(app.getPath('appData'), '@luxcodex/electron-dev'))
```

- [ ] **Step 2: 更新自定义协议注册**

找到 `proma-file` 协议注册（约第 33 行），改为：
```typescript
{ scheme: 'luxcodex-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
```

- [ ] **Step 3: 更新文件扩展名检测**

约第 51 行（argv 扫描）：
```typescript
const fileArg = argv.find((arg) => arg.endsWith('.luxcodex-backup') || arg.endsWith('.luxcodex-share'))
```

约第 126 行（filePath 检测）：
```typescript
if (filePath.endsWith('.luxcodex-backup') || filePath.endsWith('.luxcodex-share')) {
```

- [ ] **Step 4: 更新 import 和 setAppVersion 调用**

约第 119 行：
```typescript
import { setAppVersion } from '@proma/core'
```

约第 480 行：
```typescript
setAppVersion(app.getVersion())
```

- [ ] **Step 5: 更新协议 handler 注册**

约第 484 行：
```typescript
protocol.handle('luxcodex-file', handlePromaFileRequest)
```

（函数名 handlePromaFileRequest 保留，P1b 随包名一起改）

- [ ] **Step 6: 更新错误提示文案中的路径引用**

约第 628-629 行：
```typescript
`2. ~/.luxcodex/ 配置损坏（重命名 ~/.luxcodex 后重启）\n` +
`3. 系统 Keychain 无法解密保存的凭证（删除 ~/.luxcodex/feishu.json 等后重新登录）\n\n` +
```

- [ ] **Step 7: 更新注释中的 ~/.luxcodex/ 路径引用**

约第 490 行注释：
```typescript
// 同步默认 Skills 模板到 ~/.luxcodex/default-skills/
```

- [ ] **Step 8: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -30
```
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add apps/electron/src/main/index.ts
git commit -m "brand: update Electron main process to LuxCodex protocol/paths"
```

---

## Task 4: config-paths.ts 数据目录重命名

**Files:**
- Modify: `apps/electron/src/main/lib/config-paths.ts`

- [ ] **Step 1: 替换环境变量名和目录名**

`getConfigDirName()` 函数中：
```typescript
// 原：if (process.env.PROMA_DEV === '1')
if (process.env.LUXCODEX_DEV === '1') {
  _configDirName = '.luxcodex-dev'
} else {
  try {
    const { app } = require('electron')
    _configDirName = app.isPackaged ? '.luxcodex' : '.luxcodex-dev'
  } catch {
    _configDirName = '.luxcodex'
  }
  const mode = _configDirName === '.luxcodex-dev' ? '开发模式' : '正式版本'
  console.log(`[配置] 配置目录: ~/${_configDirName}/（${mode}）`)
```

- [ ] **Step 2: 更新文件头注释**

```typescript
/**
 * 配置路径工具
 *
 * 管理 LuxCodex 应用的本地配置文件路径。
 * 所有用户配置存储在 ~/.luxcodex/ 目录下。
 */
```

- [ ] **Step 3: 替换文件内所有注释中的 ~/.luxcodex/ 路径**

用 sed 批量替换注释（共约 30 处 JSDoc `@returns ~/.luxcodex/...`）：

```bash
sed -i '' 's|~\/\.proma\/|~\/.luxcodex\/|g' apps/electron/src/main/lib/config-paths.ts
```

- [ ] **Step 4: 替换 getSdkConfigDir 注释中的「Proma」**

```typescript
// 实现 LuxCodex 与 Claude Code CLI 的配置隔离。
```

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/main/lib/config-paths.ts
git commit -m "brand: rename data directory .proma → .luxcodex"
```

---

## Task 5: 数据迁移服务（新文件）

**Files:**
- Create: `apps/electron/src/main/lib/migration-service.ts`
- Modify: `apps/electron/src/main/index.ts`（wire 迁移调用）

- [ ] **Step 1: 创建 migration-service.ts**

```typescript
/**
 * 迁移服务
 *
 * 首次启动时将 ~/.luxcodex/ 迁移到 ~/.luxcodex/（非破坏性，保留原目录）。
 * 迁移完成后标记 flag 文件，避免重复执行。
 */

import { join } from 'node:path'
import { existsSync, cpSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

const OLD_DIR = '.proma'
const NEW_DIR = '.luxcodex'
const MIGRATE_FLAG = '.migrated-from-proma'

export function migrateDataDirIfNeeded(): void {
  const home = homedir()
  const oldDir = join(home, OLD_DIR)
  const newDir = join(home, NEW_DIR)
  const flagFile = join(newDir, MIGRATE_FLAG)

  // 新目录已存在且已迁移过 → 跳过
  if (existsSync(flagFile)) return

  // 旧目录不存在 → 全新安装，无需迁移
  if (!existsSync(oldDir)) return

  // 新目录已存在但无 flag → 用户已手动建目录，也跳过迁移
  if (existsSync(newDir)) return

  try {
    cpSync(oldDir, newDir, { recursive: true })
    writeFileSync(flagFile, new Date().toISOString(), 'utf-8')
    console.log(`[迁移] 已将 ~/${OLD_DIR}/ 迁移到 ~/${NEW_DIR}/（原目录保留）`)
  } catch (err) {
    console.warn('[迁移] 数据迁移失败，将使用全新目录:', err)
  }
}
```

- [ ] **Step 2: 在 main/index.ts 顶部调用迁移（在 getConfigDir 首次调用之前）**

在 `apps/electron/src/main/index.ts` 找到 import 区块结尾处（约第 120 行之后、app.whenReady 之前），在最早读取 config 路径的位置前插入：

```typescript
import { migrateDataDirIfNeeded } from './lib/migration-service.ts'
```

然后在 `app.whenReady()` 回调的第一行调用：
```typescript
migrateDataDirIfNeeded()
```

- [ ] **Step 3: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/electron/src/main/lib/migration-service.ts apps/electron/src/main/index.ts
git commit -m "feat: add data directory migration service (.proma → .luxcodex)"
```

---

## Task 6: LocalStorage 键名替换（Atoms）

**Files:**
- Modify: `apps/electron/src/renderer/atoms/app-mode.ts`
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`
- Modify: `apps/electron/src/renderer/atoms/preview-atoms.ts`
- Modify: `apps/electron/src/renderer/atoms/system-prompt-atoms.ts`
- Modify: `apps/electron/src/renderer/atoms/sidebar-atoms.ts`
- Modify: `apps/electron/src/renderer/atoms/tab-atoms.ts`
- Modify: `apps/electron/src/renderer/atoms/theme.ts`
- Modify: `apps/electron/src/renderer/atoms/chat-atoms.ts`

- [ ] **Step 1: 批量替换 atoms 目录下 proma- 键名**

```bash
find apps/electron/src/renderer/atoms -name "*.ts" -exec \
  sed -i '' "s/'proma-/'luxcodex-/g" {} \;
```

- [ ] **Step 2: 验证替换结果**

```bash
grep -rn "proma-" apps/electron/src/renderer/atoms/
```
Expected: 输出为空（无遗漏）

- [ ] **Step 3: 更新 tab-atoms.ts 教程 Tab 标题**

```typescript
// apps/electron/src/renderer/atoms/tab-atoms.ts
export const TUTORIAL_TAB_TITLE = 'LuxCodex 使用教程'
```

- [ ] **Step 4: 更新 theme.ts 注释**

把注释中 `~/.luxcodex/settings.json` → `~/.luxcodex/settings.json`（如有）。

- [ ] **Step 5: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/atoms/
git commit -m "brand: rename proma-* localStorage keys to luxcodex-*"
```

---

## Task 7: 设置页 UI 文案替换

**Files:**
- Modify: `apps/electron/src/renderer/components/settings/AboutSettings.tsx`
- Modify: `apps/electron/src/renderer/components/settings/FeishuSettings.tsx`
- Modify: `apps/electron/src/renderer/components/settings/WeChatSettings.tsx`

- [ ] **Step 1: AboutSettings - GitHub URL 和标题**

约第 32 行：
```typescript
const GITHUB_RELEASES_URL = 'https://github.com/GeoffBao/LuxCodex/releases'
```

约第 445 行：
```tsx
title="关于 LuxCodex"
```

约第 470 行：
```tsx
href="https://github.com/GeoffBao/LuxCodex"
```

约第 475 行：
```tsx
github.com/GeoffBao/LuxCodex
```

- [ ] **Step 2: FeishuSettings - 用户可见文案中的 Proma → LuxCodex**

```bash
sed -i '' 's/Proma Agent/LuxCodex Agent/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/Proma 的/LuxCodex 的/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/Proma 会/LuxCodex 会/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/Proma 记录/LuxCodex 记录/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/让 Proma/让 LuxCodex/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/向 Proma/向 LuxCodex/g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
sed -i '' 's/ Proma / LuxCodex /g' apps/electron/src/renderer/components/settings/FeishuSettings.tsx
```

- [ ] **Step 3: 验证 FeishuSettings 无遗漏**

```bash
grep -n "\bProma\b" apps/electron/src/renderer/components/settings/FeishuSettings.tsx
```
Expected: 0 行（`@proma/shared` import 除外，package import 在 P1b 改）

- [ ] **Step 4: WeChatSettings - 用户可见文案**

```bash
sed -i '' 's/Proma Agent/LuxCodex Agent/g' apps/electron/src/renderer/components/settings/WeChatSettings.tsx
sed -i '' 's/Proma 会/LuxCodex 会/g' apps/electron/src/renderer/components/settings/WeChatSettings.tsx
sed -i '' 's/向 Proma/向 LuxCodex/g' apps/electron/src/renderer/components/settings/WeChatSettings.tsx
sed -i '' 's/ Proma / LuxCodex /g' apps/electron/src/renderer/components/settings/WeChatSettings.tsx
```

- [ ] **Step 5: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/electron/src/renderer/components/settings/AboutSettings.tsx \
  apps/electron/src/renderer/components/settings/FeishuSettings.tsx \
  apps/electron/src/renderer/components/settings/WeChatSettings.tsx
git commit -m "brand: update settings UI copy Proma → LuxCodex"
```

---

## Task 8: Skill 目录重命名 + Logo 组件重命名

**Files:**
- Rename: `apps/electron/default-skills/proma-coach/` → `apps/electron/default-skills/luxcodex-coach/`
- Rename: `PromaLogoSettings.tsx` → `AppLogoSettings.tsx`
- Modify: `apps/electron/src/renderer/components/settings/BotHubSettings.tsx`

- [ ] **Step 1: 重命名 proma-coach skill 目录**

```bash
mv apps/electron/default-skills/proma-coach apps/electron/default-skills/luxcodex-coach
```

- [ ] **Step 2: 更新 luxcodex-coach/SKILL.md 的 name 字段**

打开 `apps/electron/default-skills/luxcodex-coach/SKILL.md`，找到 frontmatter 中的：
```yaml
name: proma-coach
```
改为：
```yaml
name: luxcodex-coach
```
同时把 SKILL.md 正文中所有 "Proma" 替换为 "LuxCodex"（注意保留专业术语）。

- [ ] **Step 3: 递增 SKILL.md 的 version 字段（patch +1）**

```yaml
# 例如原来是 version: "1.0.2"，改为：
version: "1.0.3"
```

- [ ] **Step 4: 重命名 PromaLogoSettings 组件文件**

```bash
mv apps/electron/src/renderer/components/settings/PromaLogoSettings.tsx \
   apps/electron/src/renderer/components/settings/AppLogoSettings.tsx
```

- [ ] **Step 5: 更新 AppLogoSettings.tsx 内容**

文件头注释：
```typescript
/**
 * AppLogoSettings - LuxCodex 品牌 Logo 下载
 *
 * 展示多个 Logo 颜色变体网格，用户可下载用作机器人头像。
 */
```

组件名：`PromaLogoSettings` → `AppLogoSettings`（函数声明 + export）：
```typescript
export function AppLogoSettings(): React.ReactElement {
```

- [ ] **Step 6: 更新 BotHubSettings.tsx import**

```typescript
// 原：
import { PromaLogoSettings } from './PromaLogoSettings'
// 改为：
import { AppLogoSettings } from './AppLogoSettings'
```

找到使用处 `<PromaLogoSettings />` → `<AppLogoSettings />`（约第 174 行）。

- [ ] **Step 7: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/electron/default-skills/ \
  apps/electron/src/renderer/components/settings/AppLogoSettings.tsx \
  apps/electron/src/renderer/components/settings/BotHubSettings.tsx
git rm apps/electron/src/renderer/components/settings/PromaLogoSettings.tsx
git commit -m "brand: rename proma-coach skill and PromaLogoSettings component"
```

---

## Task 9: ModeSwitcher 三模式（Chat / Code / Work）

**Files:**
- Modify: `apps/electron/src/renderer/atoms/app-mode.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx`

- [ ] **Step 1: 扩展 AppMode 类型**

```typescript
// apps/electron/src/renderer/atoms/app-mode.ts
/**
 * App Mode Atom - 应用模式状态
 *
 * - chat: 对话模式
 * - agent: Code 模式（Claude Agent SDK，原 Agent/Flow）
 * - cowork: 协作模式（P3 实现，P1a 为 UI 占位）
 * - scratch: 草稿本模式
 */

import { atomWithStorage } from 'jotai/utils'

export type AppMode = 'chat' | 'agent' | 'cowork' | 'scratch'

/** App 模式，自动持久化到 localStorage */
export const appModeAtom = atomWithStorage<AppMode>('luxcodex-app-mode', 'agent')
```

- [ ] **Step 2: 重写 ModeSwitcher.tsx 为三按钮版本**

```typescript
/**
 * ModeSwitcher - Chat/Code/Work 三模式切换（带滑动指示器）
 *
 * - Chat：对话模式（切换时恢复上次对话）
 * - Code：Agent 模式（切换时恢复上次会话）
 * - Work：协作模式（P3 实现，P1a 仅 UI 占位）
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { appModeAtom, type AppMode } from '@/atoms/app-mode'
import { conversationsAtom, currentConversationIdAtom } from '@/atoms/chat-atoms'
import { agentSessionsAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { tabsAtom } from '@/atoms/tab-atoms'
import { useOpenSession } from '@/hooks/useOpenSession'
import { Bot, MessageSquare, Network } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModeConfig {
  value: AppMode
  label: string
  icon: React.ReactNode
  disabled?: boolean
}

const modes: ModeConfig[] = [
  { value: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
  { value: 'agent', label: 'Code', icon: <Bot size={14} /> },
  { value: 'cowork', label: 'Work', icon: <Network size={14} />, disabled: true },
]

export function ModeSwitcher(): React.ReactElement {
  const [mode, setMode] = useAtom(appModeAtom)
  const openSession = useOpenSession()
  const conversations = useAtomValue(conversationsAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const currentAgentSessionId = useAtomValue(currentAgentSessionIdAtom)
  const tabs = useAtomValue(tabsAtom)

  const modeIndex = Math.max(0, modes.findIndex(m => m.value === mode))
  const n = modes.length

  const restoreSession = React.useCallback((targetMode: AppMode) => {
    if (targetMode === 'cowork') {
      setMode('cowork')
      return
    }

    const isChatMode = targetMode === 'chat'
    const sessions = isChatMode ? conversations : agentSessions
    const lastId = isChatMode ? currentConversationId : currentAgentSessionId

    if (lastId) {
      const match = sessions.find((s) => s.id === lastId)
      if (match) {
        openSession(targetMode, match.id, match.title)
        return
      }
    }
    const tab = tabs.find((t) => t.type === targetMode)
    if (tab) {
      openSession(targetMode, tab.sessionId, tab.title)
      return
    }
    const recent = sessions.find((s) => !s.archived)
    if (recent) {
      openSession(targetMode, recent.id, recent.title)
      return
    }
    setMode(targetMode)
  }, [openSession, conversations, agentSessions, currentConversationId, currentAgentSessionId, tabs, setMode])

  const handleModeSwitch = React.useCallback((m: ModeConfig) => {
    if (m.disabled || m.value === mode) return
    restoreSession(m.value)
  }, [mode, restoreSession])

  return (
    <div className="pt-2 titlebar-drag-region select-none">
      <div className="relative flex rounded-xl p-1 titlebar-drag-region mode-switcher-track sidebar-control-surface">
        {/* 滑动背景指示器 — 三等分定位 */}
        <div
          className="mode-slider pointer-events-none absolute rounded-lg bg-background shadow-sm transition-[left] duration-300 ease-in-out"
          style={{
            top: '4px',
            bottom: '4px',
            width: `calc(${(100 / n).toFixed(4)}% - ${(8 / n).toFixed(4)}px)`,
            left: `calc(${((modeIndex / n) * 100).toFixed(4)}% + 4px - ${((modeIndex * 8) / n).toFixed(4)}px)`,
          }}
        />
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => handleModeSwitch(m)}
            disabled={m.disabled}
            title={m.disabled ? '即将推出' : undefined}
            className={cn(
              'mode-btn titlebar-no-drag relative z-[1] h-8 flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-0 text-xs font-medium transition-colors duration-200 select-none',
              mode === m.value
                ? 'mode-btn-selected text-foreground'
                : m.disabled
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 类型检查**

```bash
cd apps/electron && bun run typecheck 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 4: 启动开发服务器确认三 Tab 显示正常**

```bash
# Terminal 1
cd apps/electron && bun run dev:vite
# Terminal 2（等 Vite ready 后）
cd apps/electron && bun run dev:electron
```

验证：
- ModeSwitcher 显示 Chat / Code / Work 三个按钮
- 点击 Chat 切换正常，滑块动画流畅
- 点击 Code 切换正常
- Work 按钮为半透明 disabled 状态，hover 无效，点击无反应

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/atoms/app-mode.ts \
  apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx
git commit -m "feat: extend ModeSwitcher to 3 modes (Chat/Code/Work)"
```

---

## Task 10: 验证与总提交

- [ ] **Step 1: 全量 typecheck**

```bash
bun run typecheck
```
Expected: 0 errors

- [ ] **Step 2: 确认无遗漏的 proma 字符串（用户可见层）**

```bash
# 排除 @proma/* import（P1b 处理）和 node_modules
grep -rn "\bProma\b\|\bproma\b" \
  apps/electron/src/renderer \
  apps/electron/src/main \
  packages/shared/src \
  packages/core/src \
  --include="*.ts" --include="*.tsx" \
  | grep -v "@proma/" \
  | grep -v "node_modules" \
  | grep -v "PromaPermissionMode\|PROMA_PERMISSION\|PROMA_DEFAULT"
```

允许残留：`PromaPermissionMode`、`PROMA_*` 等 TypeScript 类型名（在 `@proma/shared` 包内，P1b 处理）。

- [ ] **Step 3: 确认 luxcodex 替换覆盖**

```bash
grep -rn "luxcodex" apps/electron/src/main apps/electron/src/renderer \
  packages/shared/src packages/core/src \
  --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules" | wc -l
```
Expected: > 30（说明替换覆盖到位）

- [ ] **Step 4: 创建分支提交 PR 准备**

```bash
git log --oneline -10
```
确认所有 Task 的 commit 都已包含。

---

## 注意事项

- **`@proma/*` 包名 import**（如 `from '@proma/shared'`）**不在 P1a 范围**，留给 P1b（300+ 文件）。
- **PromaPermissionMode 类型名**不在 P1a 范围，留给 P1b。
- `handlePromaFileRequest` 函数名不在 P1a 范围，留给 P1b。
- logo 图片资源（proma-black.png 等）物理文件不替换 — 无 LuxCodex 设计稿，保留原图。
- 迁移服务只处理 `~/.luxcodex` → `~/.luxcodex` 一次性迁移；`~/.luxcodex-dev` 留给手动处理（开发者知道自己在做什么）。
