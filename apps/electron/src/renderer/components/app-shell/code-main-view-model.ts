/**
 * Code 模式主区视图 - 纯逻辑（视图模型）
 *
 * MainArea 的分支判定逻辑，抽成纯函数保证优先级规则单点可测。
 */

import type { ActiveView } from '@/atoms/active-view'
import type { AppMode } from '@/atoms/app-mode'
import type { CodeMainView } from '@/atoms/project-atoms'

export interface CodeMainViewInput {
  appMode: AppMode
  codeMainView: CodeMainView
  activeView: ActiveView
}

/** 顶栏可见的主模式（遗留 cowork 已并入 Code 的 Work 主区） */
export type PrimaryUiMode = 'chat' | 'agent' | 'scratch'

/**
 * 将持久化 / 运行时 AppMode 归一到顶栏可见模式。
 * cowork → agent（看板改由 codeMainViewAtom='work' 承载）。
 */
export function normalizeAppModeForUi(mode: AppMode): PrimaryUiMode {
  if (mode === 'cowork') return 'agent'
  if (mode === 'chat' || mode === 'agent' || mode === 'scratch') return mode
  return 'agent'
}

/** 是否仍为遗留顶栏 Work（cowork）模式，需迁移到 Code Work 主区 */
export function isLegacyCoworkMode(mode: AppMode): boolean {
  return mode === 'cowork'
}

/** activeView 是否为全屏覆盖视图（非 conversations 主内容） */
export function isOverlayActiveView(activeView: ActiveView): boolean {
  return (
    activeView === 'automations' ||
    activeView === 'agent-skills' ||
    activeView === 'agent-experts'
  )
}

/**
 * agent 模式主区是否渲染 Work 视图（看板 / 项目详情）。
 *
 * 优先级约束：
 * - 仅 agent 模式（遗留 cowork 由启动迁移落到 agent + codeMainView='work'）
 * - activeView 为 automations / agent-skills 等覆盖视图时让位（显式导航优先）
 */
export function shouldShowWorkViewInCode({
  appMode,
  codeMainView,
  activeView,
}: CodeMainViewInput): boolean {
  return appMode === 'agent' && codeMainView === 'work' && activeView === 'conversations'
}
