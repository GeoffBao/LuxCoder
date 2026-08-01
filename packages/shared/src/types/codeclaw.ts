/**
 * CodeClaw —— LuxCoder 桌面助手共享类型
 *
 * CodeClaw 是替代旧 Agent Island/灵动岛的桌面助手 surface。主进程仍是
 * Agent 状态真源，渲染进程只负责呈现与交互意图回传。
 */

export type CodeClawPhase = 'idle' | 'running' | 'needs-interaction' | 'completed' | 'error'

export type CodeClawThemeId = 'lux' | 'clawd' | 'calico' | 'cloudling'

export interface CodeClawThemeDefinition {
  id: CodeClawThemeId
  name: string
  description: string
}

export const CODECLAW_THEMES: readonly CodeClawThemeDefinition[] = [
  { id: 'lux', name: 'CodeClaw', description: 'LuxCoder 蓝金桌宠，默认企业研发助手形象' },
  { id: 'clawd', name: 'Clawd', description: '来自 clawd-on-desk 的 AGPL 像素小螃蟹主题' },
  { id: 'calico', name: 'Calico', description: '来自 clawd-on-desk 的 AGPL 三花猫主题' },
  { id: 'cloudling', name: 'Cloudling', description: '来自 clawd-on-desk 的 AGPL 云宝主题' },
] as const

export const DEFAULT_CODECLAW_THEME_ID: CodeClawThemeId = 'lux'

export function isCodeClawThemeId(value: unknown): value is CodeClawThemeId {
  return typeof value === 'string' && CODECLAW_THEMES.some((theme) => theme.id === value)
}

export type CodeClawInteractionKind = 'permission' | 'ask_user_question' | 'plan_review'

export interface CodeClawSessionSnapshot {
  sessionId: string
  title: string
  phase: CodeClawPhase
  interactionKind?: CodeClawInteractionKind
  detail: string
  attention: boolean
  startedAt: number
  lastActivityAt: number
}

export interface CodeClawState {
  /** 用户设置与当前状态共同决定是否展示桌宠。 */
  visible: boolean
  /** 当前使用的 clean-room 宠物主题。 */
  themeId: CodeClawThemeId
  /** 当前优先展示的 Agent 会话。 */
  prioritySession?: CodeClawSessionSnapshot
  /** 正在运行、等待接手、异常或未读完成的会话。 */
  sessions: CodeClawSessionSnapshot[]
  activeSessionCount: number
  pendingInteractionCount: number
  unreadCompletedCount: number
  phase: CodeClawPhase
  headline: string
  detail: string
  updatedAt: number
}

export interface CodeClawMoveRequest {
  x: number
  y: number
}

export const CODECLAW_IPC_CHANNELS = {
  /** main → renderer：全量状态推送 */
  STATE: 'codeclaw:state',
  /** renderer → main：移动桌宠窗口并记忆位置 */
  MOVE: 'codeclaw:move',
  /** renderer → main：请求打开/聚焦主窗口 */
  OPEN_MAIN_WINDOW: 'codeclaw:open-main-window',
  /** renderer → main：请求打开当前/指定 Agent 会话 */
  OPEN_SESSION: 'codeclaw:open-session',
  /** renderer → main：用户已查看完成会话，清除未读完成提醒 */
  MARK_SESSION_VIEWED: 'codeclaw:mark-session-viewed',
  /** renderer → main：更新桌宠主题并立即推送状态 */
  SET_THEME: 'codeclaw:set-theme',
} as const

export type CodeClawIpcChannel = (typeof CODECLAW_IPC_CHANNELS)[keyof typeof CODECLAW_IPC_CHANNELS]
