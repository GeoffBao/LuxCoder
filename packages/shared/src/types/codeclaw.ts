/**
 * CodeClaw —— MyYoda 桌面助手共享类型
 *
 * CodeClaw 是替代旧 Agent Island/灵动岛的桌面助手 surface。主进程仍是
 * Agent 状态真源，渲染进程只负责呈现与交互意图回传。
 *
 * 移植自 clawd-on-desk（AGPL-3.0-only，https://github.com/rullerzhou-afk/clawd-on-desk）：
 * - 细粒度动画状态（CodeClawVisual）对应上游 12+ 动画状态机
 * - 眼动追踪 / 睡眠序列 / 点击反应 / Mini 模式由渲染端消费 theme.json 配置驱动
 * - 权限气泡（interaction）在桌宠小窗内直接审批，复用主窗口现有审批服务
 */

/** 粗粒度会话阶段（主进程排序/聚合用，向后兼容）。 */
export type CodeClawPhase = 'idle' | 'running' | 'needs-interaction' | 'completed' | 'error'

/**
 * 细粒度动画状态（对应 theme.json 的 states 键）。
 * 主进程下发优先级会话的 visual，渲染端结合本地睡眠/点击反应/Mini 状态最终选片。
 */
export type CodeClawVisual =
  | 'idle'
  | 'roam'
  | 'yawning'
  | 'dozing'
  | 'collapsing'
  | 'thinking'
  | 'working'
  | 'juggling'
  | 'sweeping'
  | 'error'
  | 'attention'
  | 'notification'
  | 'carrying'
  | 'sleeping'
  | 'waking'
  | 'dizzy'

/** Mini 模式动画状态（对应 theme.json miniMode.states 键）。 */
export type CodeClawMiniVisual =
  | 'mini-idle'
  | 'mini-alert'
  | 'mini-happy'
  | 'mini-enter'
  | 'mini-peek'
  | 'mini-working'
  | 'mini-crabwalk'
  | 'mini-enter-sleep'
  | 'mini-sleep'

export function isCodeClawVisual(value: unknown): value is CodeClawVisual {
  return typeof value === 'string' && CODECLAW_VISUALS.includes(value as CodeClawVisual)
}

/** 合法细粒度动画状态集合（渲染端校验用）。 */
export const CODECLAW_VISUALS: readonly CodeClawVisual[] = [
  'idle', 'roam', 'yawning', 'dozing', 'collapsing', 'thinking', 'working', 'juggling',
  'sweeping', 'error', 'attention', 'notification', 'carrying', 'sleeping', 'waking', 'dizzy',
] as const

export type CodeClawThemeId = 'calico' | 'clawd' | 'cloudling'

/** 桌宠窗口尺寸档位（S/M/L）。 */
export type CodeClawSize = 's' | 'm' | 'l'

/** 默认桌宠窗口尺寸档位（M）。 */
export const DEFAULT_CODECLAW_SIZE: CodeClawSize = 'm'

export function isCodeClawSize(value: unknown): value is CodeClawSize {
  return value === 's' || value === 'm' || value === 'l'
}

export interface CodeClawThemeDefinition {
  id: CodeClawThemeId
  name: string
  description: string
}

export const CODECLAW_THEMES: readonly CodeClawThemeDefinition[] = [
  { id: 'calico', name: 'Calico', description: '来自 clawd-on-desk 的 AGPL 三花猫主题，MyYoda 默认桌宠形象' },
  { id: 'clawd', name: 'Clawd', description: '来自 clawd-on-desk 的 AGPL 像素小螃蟹主题' },
  { id: 'cloudling', name: 'Cloudling', description: '来自 clawd-on-desk 的 AGPL 云宝主题' },
] as const

/** 新用户/未设置主题时默认打开的桌宠主题（Calico 三花猫）。 */
export const DEFAULT_CODECLAW_THEME_ID: CodeClawThemeId = 'calico'

export function isCodeClawThemeId(value: unknown): value is CodeClawThemeId {
  return typeof value === 'string' && CODECLAW_THEMES.some((theme) => theme.id === value)
}

export type CodeClawInteractionKind = 'permission' | 'ask_user_question' | 'plan_review'

/**
 * 桌宠小窗内可直接审批的交互气泡数据。
 * 渲染端调用主窗口现有的 respondPermission / respondAskUser / respondExitPlanMode 完成审批，
 * 无需新增审批服务。
 */
export interface CodeClawInteraction {
  kind: CodeClawInteractionKind
  /** 审批服务所需的请求 ID（PermissionRequest / AskUserRequest / ExitPlanModeRequest）。 */
  requestId: string
  /** 气泡标题（权限=工具名、问答=问题 header、计划=计划审批）。 */
  title: string
  /** 气泡描述（权限=操作描述、问答=问题正文、计划=计划摘要）。 */
  description: string
  /** 权限专用：是否允许“总是允许”（加入会话白名单）。 */
  allowAlways?: boolean
  /** 问答专用：问题与选项（复用 AskUserQuestion 结构）。 */
  questions?: Array<{
    question: string
    header?: string
    options: Array<{ label: string; description?: string; preview?: string }>
    multiSelect?: boolean
  }>
  /** 计划审批专用：允许的 Bash 操作列表。 */
  allowedPrompts?: Array<{ tool: string; prompt: string }>
}

export interface CodeClawSessionSnapshot {
  sessionId: string
  title: string
  phase: CodeClawPhase
  /** 细粒度动画状态（主进程从 SDK 消息/事件推导）。 */
  visual: CodeClawVisual
  interactionKind?: CodeClawInteractionKind
  /** 需要用户审批的交互气泡（permission / ask_user / plan_review 时有值）。 */
  interaction?: CodeClawInteraction
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
  /** 全局细粒度动画状态（= prioritySession.visual，无会话时 idle）。 */
  visual: CodeClawVisual
  /** 用户是否离开（鼠标长时间未动且无活跃会话）→ 渲染端驱动睡眠序列。 */
  userIdle: boolean
  /** 当前是否处于 Mini 模式（贴边隐藏）。 */
  miniMode: boolean
  /** 免打扰：交互请求静默，不弹气泡（对应上游 DND）。 */
  dnd: boolean
  /** 桌宠窗口尺寸档位。 */
  size: CodeClawSize
  /** 音效开关。 */
  soundEnabled: boolean
  /** 光标屏幕坐标（主进程轮询，眼动追踪用）。 */
  cursor: { x: number; y: number }
  headline: string
  detail: string
  updatedAt: number
}

export interface CodeClawMoveRequest {
  x: number
  y: number
}

export interface CodeClawMiniRequest {
  /** true = 进入 Mini 模式（贴边吸附）；false = 退出并恢复原位。 */
  mini: boolean
  /** 贴边方向：'left' | 'right'（进入 mini 时渲染端根据窗口位置判断）。 */
  edge?: 'left' | 'right'
}

export interface CodeClawPeekRequest {
  /** true = Mini 悬停探出；false = 缩回贴边。 */
  peek: boolean
}

export const CODECLAW_IPC_CHANNELS = {
  /** main → renderer：全量状态推送 */
  STATE: 'codeclaw:state',
  /** main → renderer：光标屏幕坐标高频推送（眼动追踪用） */
  CURSOR: 'codeclaw:cursor',
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
  /** renderer → main：进入/退出 Mini 模式（贴边吸附） */
  SET_MINI_MODE: 'codeclaw:set-mini-mode',
  /** renderer → main：Mini 模式悬停探出/缩回 */
  PEEK_MINI: 'codeclaw:peek-mini',
  /** renderer → main：调整桌宠窗口尺寸 S/M/L */
  SET_SIZE: 'codeclaw:set-size',
  /** renderer → main：切换免打扰（交互静默） */
  SET_DND: 'codeclaw:set-dnd',
  /** renderer → main：切换音效 */
  SET_SOUND: 'codeclaw:set-sound',
  /** renderer → main：弹出桌宠右键菜单 */
  OPEN_CONTEXT_MENU: 'codeclaw:open-context-menu',
} as const

export type CodeClawIpcChannel = (typeof CODECLAW_IPC_CHANNELS)[keyof typeof CODECLAW_IPC_CHANNELS]
