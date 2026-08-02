/**
 * CodeClaw 桌面助手服务（主进程状态机）
 */

import { ipcMain } from 'electron'
import {
  CODECLAW_IPC_CHANNELS,
  type CodeClawInteractionKind,
  type CodeClawPhase,
  type CodeClawSessionSnapshot,
  DEFAULT_CODECLAW_THEME_ID,
  isCodeClawThemeId,
  type CodeClawThemeId,
  type CodeClawState,
  type AgentStreamPayload,
} from '@luxcoder/shared'
import { agentEventBus } from './agent-service'
import { getAgentSessionMeta } from './agent-session-manager'
import { getSettings, updateSettings } from './settings-service'
import { getCodeClawWindow, hideCodeClawWindow, moveCodeClawWindow, onCodeClawWindowReady, showCodeClawWindow } from './codeclaw-window'

const UNREAD_RETAIN_MS = 10 * 60_000
const PUSH_THROTTLE_MS = 120
const AGENT_STREAM_PUSH_THROTTLE_MS = 1_500
/** 终态会话在 Map 中的最长保留时间：超过后回收，避免长期运行内存无限增长。 */
const SESSION_RETAIN_MS = 24 * 60 * 60_000
/**
 * 活跃会话（running / needs-interaction）无事件时的最长保留时间。
 * 活跃会话正常会持续刷新 lastActivityAt；若事件流因 Agent 异常终止等原因
 * 永久停更，仍需兜底回收，否则会与终态会话一样无限累积。
 */
const SESSION_ACTIVE_MAX_MS = 7 * 24 * 60 * 60_000

interface InternalCodeClawSession extends CodeClawSessionSnapshot {
  unread: boolean
  terminalAt?: number
}

export interface CodeClawServiceDeps {
  showAndFocusMainWindow: () => void
  openAgentSession: (sessionId: string, title: string) => void
  enabled?: () => boolean
}

let initialized = false
let serviceDeps: CodeClawServiceDeps | null = null
let disposeEventBus: (() => void) | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let lastStateJson = ''
const sessions = new Map<string, InternalCodeClawSession>()

function truncate(text: string, max = 72): string {
  const value = text.trim()
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

function getTitle(sessionId: string): string {
  try {
    const meta = getAgentSessionMeta(sessionId)
    return meta?.title?.trim() || sessionId.slice(0, 8)
  } catch {
    return sessionId.slice(0, 8)
  }
}

function ensureSession(sessionId: string): InternalCodeClawSession {
  let session = sessions.get(sessionId)
  if (!session) {
    const now = Date.now()
    session = {
      sessionId,
      title: getTitle(sessionId),
      phase: 'running',
      detail: '正在准备…',
      attention: false,
      unread: false,
      startedAt: now,
      lastActivityAt: now,
    }
    sessions.set(sessionId, session)
  }
  return session
}

function setNeedsInteraction(sessionId: string, kind: CodeClawInteractionKind, detail: string): void {
  const session = ensureSession(sessionId)
  session.phase = 'needs-interaction'
  session.interactionKind = kind
  session.detail = detail
  session.attention = true
  session.lastActivityAt = Date.now()
}

function setRunning(session: InternalCodeClawSession, detail?: string): void {
  session.phase = 'running'
  session.interactionKind = undefined
  session.attention = false
  session.unread = false
  if (detail) session.detail = detail
  session.lastActivityAt = Date.now()
}

function handleLuxCoderEvent(sessionId: string, event: import('@luxcoder/shared').LuxCoderEvent): void {
  switch (event.type) {
    case 'permission_request':
      setNeedsInteraction(sessionId, 'permission', '等待权限确认')
      break
    case 'ask_user_request': {
      const question = event.request?.questions?.[0]?.question
        ?? event.request?.questions?.[0]?.header
        ?? '等待回答'
      setNeedsInteraction(sessionId, 'ask_user_question', truncate(question, 48))
      break
    }
    case 'exit_plan_mode_request':
      setNeedsInteraction(sessionId, 'plan_review', '等待计划审批')
      break
    case 'permission_resolved':
    case 'ask_user_resolved':
    case 'exit_plan_mode_resolved': {
      const session = sessions.get(sessionId)
      if (session && session.phase === 'needs-interaction') setRunning(session, '已响应，继续执行')
      break
    }
    case 'title_updated': {
      const session = sessions.get(sessionId)
      if (session && event.title) session.title = event.title
      break
    }
    case 'external_run_started':
    case 'run_resumed':
      setRunning(ensureSession(sessionId), '正在执行')
      break
    case 'retry': {
      const detail = event.status === 'attempt' ? `重试第 ${event.attempt ?? 1} 次` : '等待重试…'
      setRunning(ensureSession(sessionId), detail)
      break
    }
    default: {
      const session = sessions.get(sessionId)
      if (session) session.lastActivityAt = Date.now()
      break
    }
  }
}

function handleSdkMessage(sessionId: string, message: import('@luxcoder/shared').SDKMessage): void {
  switch (message.type) {
    case 'assistant': {
      const assistant = message as import('@luxcoder/shared').SDKAssistantMessage
      if (assistant.isReplay) return
      const session = ensureSession(sessionId)
      if (assistant.error) {
        session.phase = 'error'
        session.detail = truncate(assistant.error.message || '执行出错', 60)
        session.attention = true
        session.unread = true
        session.terminalAt = Date.now()
        session.lastActivityAt = Date.now()
        return
      }
      setRunning(session)
      for (const block of assistant.message.content ?? []) {
        if (block.type === 'text' && 'text' in block && typeof block.text === 'string' && block.text.trim()) {
          session.detail = truncate(block.text, 56)
        } else if (block.type === 'tool_use') {
          const input = 'input' in block && block.input && typeof block.input === 'object' ? block.input as Record<string, unknown> : {}
          const name = (input['_displayName'] as string | undefined) || ('name' in block && typeof block.name === 'string' ? block.name : undefined) || '工具'
          session.detail = `正在使用 ${name}`
        }
      }
      break
    }
    case 'result': {
      const result = message as import('@luxcoder/shared').SDKResultMessage
      const session = ensureSession(sessionId)
      if (result.subtype === 'success') {
        session.phase = 'completed'
        session.detail = '任务已完成'
      } else {
        session.phase = 'error'
        session.detail = truncate(result.errors?.[0] || result.terminal_reason || '执行出错', 60)
      }
      session.attention = true
      session.unread = true
      session.terminalAt = Date.now()
      session.lastActivityAt = Date.now()
      break
    }
    case 'system': {
      const system = message as import('@luxcoder/shared').SDKSystemMessage
      const session = ensureSession(sessionId)
      switch (system.subtype) {
        case 'task_started':
          setRunning(session, `子任务：${truncate(system.description || '', 36)}`)
          break
        case 'task_progress':
          setRunning(session, system.description ? `子任务：${truncate(system.description, 36)}` : '子任务推进中')
          break
        case 'compact_boundary':
          setRunning(session, '正在压缩上下文…')
          break
        case 'permission_denied':
          setNeedsInteraction(sessionId, 'permission', '权限被拒绝')
          break
        default:
          session.lastActivityAt = Date.now()
          break
      }
      break
    }
    case 'tool_progress':
      setRunning(ensureSession(sessionId))
      break
    default:
      break
  }
}

function handleAgentEvent(sessionId: string, payload: AgentStreamPayload): void {
  if (payload.kind === 'luxcoder_event') handleLuxCoderEvent(sessionId, payload.event)
  else handleSdkMessage(sessionId, payload.message)
}

function phaseScore(phase: CodeClawPhase): number {
  if (phase === 'needs-interaction') return 4
  if (phase === 'error') return 3
  if (phase === 'completed') return 2
  if (phase === 'running') return 1
  return 0
}

function isVisibleSession(session: InternalCodeClawSession, now: number): boolean {
  if (now - session.lastActivityAt >= SESSION_RETAIN_MS) return false
  if (session.phase === 'running' || session.phase === 'needs-interaction' || session.phase === 'error') return true
  return session.phase === 'completed'
    && session.unread
    && session.terminalAt !== undefined
    && now - session.terminalAt < UNREAD_RETAIN_MS
}

/**
 * 回收早已结束且长时间无活动的终态会话，防止 sessions Map 无限增长。
 * 终态会话（completed / error）在超过 SESSION_RETAIN_MS 无活动后清理；
 * 活跃会话（running / needs-interaction）在超过 SESSION_ACTIVE_MAX_MS
 * （事件流可能已永久中断）后同样兜底回收。
 */
function pruneExpiredSessions(now: number): void {
  for (const [sessionId, session] of sessions) {
    const isActive = session.phase === 'running' || session.phase === 'needs-interaction'
    const maxRetain = isActive ? SESSION_ACTIVE_MAX_MS : SESSION_RETAIN_MS
    if (now - session.lastActivityAt >= maxRetain) {
      sessions.delete(sessionId)
    }
  }
}

function compareSessions(a: InternalCodeClawSession, b: InternalCodeClawSession): number {
  return phaseScore(b.phase) - phaseScore(a.phase)
    || a.startedAt - b.startedAt
    || a.sessionId.localeCompare(b.sessionId)
}

function getThemeId(): CodeClawThemeId {
  const themeId = getSettings().codeClaw?.themeId
  return isCodeClawThemeId(themeId) ? themeId : DEFAULT_CODECLAW_THEME_ID
}

function buildState(): CodeClawState {
  const now = Date.now()
  pruneExpiredSessions(now)
  const visibleSessions = [...sessions.values()].filter((session) => isVisibleSession(session, now)).sort(compareSessions)
  const priority = visibleSessions[0]
  const phase = priority?.phase ?? 'idle'
  const activeSessionCount = visibleSessions.filter((session) => session.phase === 'running' || session.phase === 'needs-interaction').length
  const pendingInteractionCount = visibleSessions.filter((session) => session.phase === 'needs-interaction').length
  const unreadCompletedCount = visibleSessions.filter((session) => session.phase === 'completed').length
  const enabled = serviceDeps?.enabled?.() === true
  return {
    visible: enabled,
    themeId: getThemeId(),
    prioritySession: priority ? toPublicSession(priority) : undefined,
    sessions: visibleSessions.map(toPublicSession),
    activeSessionCount,
    pendingInteractionCount,
    unreadCompletedCount,
    phase,
    headline: priority?.title ?? 'CodeClaw',
    detail: priority?.detail ?? '准备协助你的研发工作',
    updatedAt: Math.max(0, ...visibleSessions.map((session) => session.lastActivityAt)),
  }
}

function toPublicSession(session: InternalCodeClawSession): CodeClawSessionSnapshot {
  return {
    sessionId: session.sessionId,
    title: session.title,
    phase: session.phase,
    interactionKind: session.interactionKind,
    detail: session.detail,
    attention: session.attention,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
  }
}

function pushState(): void {
  const state = buildState()
  const json = JSON.stringify(state)
  if (json === lastStateJson) return
  lastStateJson = json
  if (state.visible) showCodeClawWindow()
  else hideCodeClawWindow()
  const win = getCodeClawWindow()
  if (!win || win.isDestroyed()) return
  if (!win.webContents.isDestroyed()) win.webContents.send(CODECLAW_IPC_CHANNELS.STATE, state)
}

function schedulePush(delay = PUSH_THROTTLE_MS): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushState()
  }, delay)
}

function requiresImmediatePush(payload: AgentStreamPayload): boolean {
  if (payload.kind !== 'luxcoder_event') return false
  return payload.event.type === 'permission_request'
    || payload.event.type === 'ask_user_request'
    || payload.event.type === 'exit_plan_mode_request'
    || payload.event.type === 'permission_resolved'
    || payload.event.type === 'ask_user_resolved'
    || payload.event.type === 'exit_plan_mode_resolved'
}

function setCodeClawTheme(themeId: CodeClawThemeId): void {
  const current = getSettings().codeClaw ?? {}
  updateSettings({ codeClaw: { ...current, themeId } })
  schedulePush()
}

function markCodeClawSessionViewed(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (!session || session.phase !== 'completed' || !session.unread) return
  session.unread = false
  session.attention = false
  schedulePush()
}

function openCodeClawSession(sessionId?: string): void {
  if (!serviceDeps) return
  const target = sessionId ? sessions.get(sessionId) : buildState().prioritySession
  if (!target) {
    serviceDeps.showAndFocusMainWindow()
    return
  }
  markCodeClawSessionViewed(target.sessionId)
  serviceDeps.openAgentSession(target.sessionId, target.title)
  serviceDeps.showAndFocusMainWindow()
  schedulePush()
}

export function initCodeClawService(deps: CodeClawServiceDeps): void {
  if (initialized) return
  initialized = true
  serviceDeps = deps

  disposeEventBus = agentEventBus.on((sessionId, payload) => {
    if (deps.enabled?.() === false) return
    handleAgentEvent(sessionId, payload)
    schedulePush(requiresImmediatePush(payload) ? PUSH_THROTTLE_MS : AGENT_STREAM_PUSH_THROTTLE_MS)
  })

  onCodeClawWindowReady(() => {
    lastStateJson = ''
    pushState()
  })

  ipcMain.handle(CODECLAW_IPC_CHANNELS.MOVE, (_event, req: { x: number; y: number }) => {
    if (typeof req?.x === 'number' && typeof req?.y === 'number') moveCodeClawWindow(req.x, req.y)
  })

  ipcMain.handle(CODECLAW_IPC_CHANNELS.OPEN_MAIN_WINDOW, () => {
    deps.showAndFocusMainWindow()
  })

  ipcMain.handle(CODECLAW_IPC_CHANNELS.OPEN_SESSION, (_event, sessionId?: unknown) => {
    openCodeClawSession(typeof sessionId === 'string' ? sessionId : undefined)
  })

  ipcMain.handle(CODECLAW_IPC_CHANNELS.MARK_SESSION_VIEWED, (_event, sessionId: unknown) => {
    if (typeof sessionId === 'string' && sessionId.length > 0) markCodeClawSessionViewed(sessionId)
  })

  ipcMain.handle(CODECLAW_IPC_CHANNELS.SET_THEME, (_event, themeId: unknown) => {
    if (isCodeClawThemeId(themeId)) setCodeClawTheme(themeId)
  })
}

export function refreshCodeClawConfiguration(): void {
  lastStateJson = ''
  schedulePush()
}

export function publishCodeClawNow(): void {
  lastStateJson = ''
  pushState()
}

export function disposeCodeClawService(): void {
  if (disposeEventBus) {
    disposeEventBus()
    disposeEventBus = null
  }
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  ipcMain.removeHandler(CODECLAW_IPC_CHANNELS.MOVE)
  ipcMain.removeHandler(CODECLAW_IPC_CHANNELS.OPEN_MAIN_WINDOW)
  ipcMain.removeHandler(CODECLAW_IPC_CHANNELS.OPEN_SESSION)
  ipcMain.removeHandler(CODECLAW_IPC_CHANNELS.MARK_SESSION_VIEWED)
  ipcMain.removeHandler(CODECLAW_IPC_CHANNELS.SET_THEME)
  initialized = false
  serviceDeps = null
  sessions.clear()
  lastStateJson = ''
}
