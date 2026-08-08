/**
 * CodeClaw —— Yoda 桌面助手 MVP
 */

import React from 'react'
import { AlertCircle, CheckCircle2, MousePointer2, Sparkles, TerminalSquare } from 'lucide-react'
import { DEFAULT_CODECLAW_THEME_ID, isCodeClawThemeId, type CodeClawPhase, type CodeClawState, type CodeClawThemeId } from '@yoda/shared'
import './codeclaw.css'

const THEME_ASSETS = import.meta.glob('../../assets/codeclaw-themes/*/assets/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const EXTERNAL_THEME_PHASE_ASSETS: Record<CodeClawThemeId, Record<CodeClawPhase, string>> = {
  clawd: {
    idle: 'clawd-idle-follow.svg',
    running: 'clawd-working-typing.svg',
    'needs-interaction': 'clawd-notification.svg',
    completed: 'clawd-happy.svg',
    error: 'clawd-error.svg',
  },
  calico: {
    idle: 'calico-idle-follow.svg',
    running: 'calico-working-typing.apng',
    'needs-interaction': 'calico-notification.apng',
    completed: 'calico-happy.apng',
    error: 'calico-error.apng',
  },
  cloudling: {
    idle: 'cloudling-idle.svg',
    running: 'cloudling-typing.svg',
    'needs-interaction': 'cloudling-notification.svg',
    completed: 'cloudling-attention.svg',
    error: 'cloudling-error.svg',
  },
}

const PHASE_LABEL: Record<CodeClawPhase, string> = {
  idle: '待命',
  running: '执行中',
  'needs-interaction': '待接手',
  completed: '已完成',
  error: '需关注',
}

function useCodeClawState(): CodeClawState | null {
  const [state, setState] = React.useState<CodeClawState | null>(null)
  React.useEffect(() => window.electronAPI.codeClaw.onState(setState), [])
  return state
}

function phaseIcon(phase: CodeClawPhase): React.ReactNode {
  if (phase === 'needs-interaction') return <MousePointer2 size={14} />
  if (phase === 'completed') return <CheckCircle2 size={14} />
  if (phase === 'error') return <AlertCircle size={14} />
  if (phase === 'running') return <TerminalSquare size={14} />
  return <Sparkles size={14} />
}

function resolveExternalThemeAsset(themeId: CodeClawThemeId, phase: CodeClawPhase): string | undefined {
  const file = EXTERNAL_THEME_PHASE_ASSETS[themeId][phase]
  return THEME_ASSETS[`../../assets/codeclaw-themes/${themeId}/assets/${file}`]
}

function renderMascot(themeId: CodeClawThemeId, phase: CodeClawPhase): React.ReactNode {
  const src = resolveExternalThemeAsset(themeId, phase) ?? resolveExternalThemeAsset(themeId, 'idle')
  if (!src) return null
  return (
    <span className="codeclaw-mascot codeclaw-vendored-theme" aria-hidden="true">
      <img src={src} alt="" draggable={false} />
    </span>
  )
}

export function CodeClawApp(): React.ReactElement {
  const state = useCodeClawState()
  const dragRef = React.useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const phase = state?.phase ?? 'idle'
  const visible = state?.visible !== false
  const themeId = isCodeClawThemeId(state?.themeId) ? state.themeId : DEFAULT_CODECLAW_THEME_ID
  const headline = state?.headline ?? 'CodeClaw'
  const detail = state?.detail ?? '准备协助你的研发工作'
  const active = state?.activeSessionCount ?? 0
  const pending = state?.pendingInteractionCount ?? 0
  const done = state?.unreadCompletedCount ?? 0

  const openMain = React.useCallback(() => {
    void window.electronAPI.codeClaw.openMainWindow()
  }, [])

  const openSession = React.useCallback(() => {
    void window.electronAPI.codeClaw.openSession(state?.prioritySession?.sessionId)
  }, [state?.prioritySession?.sessionId])

  const handlePointerDown = React.useCallback((event: React.MouseEvent) => {
    dragRef.current = { x: event.screenX, y: event.screenY, moved: false }
    setDragging(true)
  }, [])

  React.useEffect(() => {
    if (!dragging) return
    const onMove = (event: MouseEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = event.screenX - drag.x
      const dy = event.screenY - drag.y
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return
      drag.moved = true
      void window.electronAPI.codeClaw.move(event.screenX - 110, event.screenY - 110)
      drag.x = event.screenX
      drag.y = event.screenY
    }
    const onUp = (): void => {
      const wasDragged = dragRef.current?.moved === true
      dragRef.current = null
      setDragging(false)
      if (!wasDragged) openSession()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, openSession])

  if (!visible) return <div className="codeclaw-root" />

  return (
    <div className="codeclaw-root">
      <button
        type="button"
        className={`codeclaw-card ${phase} theme-${themeId} ${dragging ? 'dragging' : ''}`}
        onMouseDown={handlePointerDown}
        onDoubleClick={openMain}
        title="单击打开当前会话，拖动移动，双击打开 Yoda"
      >
        <span className="codeclaw-glow" />
        {renderMascot(themeId, phase)}
        <span className="codeclaw-status">
          <span className="codeclaw-status-row">
            <span className="codeclaw-phase">{phaseIcon(phase)}{PHASE_LABEL[phase]}</span>
            {(active > 0 || pending > 0 || done > 0) && (
              <span className="codeclaw-counts">
                {active > 0 && <b>{active} 进行中</b>}
                {pending > 0 && <b>{pending} 待接手</b>}
                {done > 0 && <b>{done} 完成</b>}
              </span>
            )}
          </span>
          <span className="codeclaw-title">{headline}</span>
          <span className="codeclaw-detail">{detail}</span>
        </span>
      </button>
    </div>
  )
}
