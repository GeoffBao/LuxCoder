/**
 * CodeClaw —— MyYoda 桌面助手
 *
 * 移植自 clawd-on-desk（AGPL-3.0-only）的桌面宠物交互机制：
 * - 细粒度动画状态：消费 theme.json 的 states / workingTiers / idleAnimations
 * - 睡眠序列：userIdle（主进程检测鼠标离开）→ yawning → dozing → collapsing → sleeping；唤醒
 * - 眼动追踪：<object> 加载 SVG 后操作 contentDocument 内眼睛/身体/阴影元素跟随光标
 * - 点击反应：拖拽播放 drag 素材、快速连点播放 annoyed 反应
 * - Mini 模式：拖拽贴边吸附、mini 素材、悬停 peek
 * - 权限气泡：在桌宠小窗内直接审批 permission / ask_user / plan_review
 *
 * 保留既有交互：单击打开会话、双击打开主窗口、拖拽移动、主题切换、状态角标。
 */

import React from 'react'
import { AlertCircle, CheckCircle2, Check, List, MousePointer2, Sparkles, TerminalSquare, X } from 'lucide-react'
import {
  DEFAULT_CODECLAW_SIZE,
  DEFAULT_CODECLAW_THEME_ID,
  isCodeClawSize,
  isCodeClawThemeId,
  type CodeClawInteraction,
  type CodeClawMiniVisual,
  type CodeClawPhase,
  type CodeClawSize,
  type CodeClawState,
  type CodeClawThemeId,
  type CodeClawVisual,
} from '@myyoda/shared'
import './codeclaw.css'

const SOUND_ASSETS = import.meta.glob<string>('../../assets/codeclaw-sounds/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/**
 * 眼动素材：只打包 idle-follow SVG 文本（clawd/calico）。
 * 不使用 <object> 加载 SVG——打包后 renderer 走 file:// 协议，Chromium 对
 * file:// 下 <object type="image/svg+xml"> 加载本地 SVG 有限制（显示错误页），
 * 内联进 JS 可完全绕开运行时文件加载。
 */
const THEME_EYE_SVG_RAW = import.meta.glob<string>('../../assets/codeclaw-themes/*/assets/*-idle-follow.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function getThemeEyeSvgRaw(themeId: string, file: string): string | undefined {
  return THEME_EYE_SVG_RAW[`../../assets/codeclaw-themes/${themeId}/assets/${file}`]
}

// ===== 主题 schema（theme.json 子集） =====

interface ThemeEyeTracking {
  enabled?: boolean
  states?: string[]
  eyeRatioX?: number
  eyeRatioY?: number
  maxOffset?: number
  bodyScale?: number
  shadowStretch?: number
  shadowShift?: number
  ids?: { eyes?: string; body?: string; shadow?: string; dozeEyes?: string }
  trackingLayers?: Record<string, { ids?: string[]; maxOffset?: number; ease?: number }>
}

interface ThemeReactions {
  drag?: { file?: string; duration?: number }
  clickLeft?: { file?: string; duration?: number }
  clickRight?: { file?: string; duration?: number }
  annoyed?: { file?: string; duration?: number }
  double?: { file?: string; files?: string[]; duration?: number }
}

interface ThemeMiniMode {
  supported?: boolean
  offsetRatio?: number
  states?: Record<string, string[]>
}

interface ThemeTimings {
  mouseIdleTimeout?: number
  mouseSleepTimeout?: number
  yawnDuration?: number
  collapseDuration?: number
  wakeDuration?: number
}

interface ThemeJson {
  states?: Record<string, string[]>
  idleAnimations?: Array<{ file: string; duration: number }>
  workingTiers?: Array<{ minSessions: number; file: string }>
  eyeTracking?: ThemeEyeTracking
  reactions?: ThemeReactions
  miniMode?: ThemeMiniMode
  timings?: ThemeTimings
}

const THEME_JSONS = import.meta.glob<ThemeJson>('../../assets/codeclaw-themes/*/theme.json', {
  eager: true,
  import: 'default',
}) as Record<string, ThemeJson>

const THEME_ASSETS = import.meta.glob<string>('../../assets/codeclaw-themes/*/assets/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function getThemeData(themeId: string): ThemeJson {
  return THEME_JSONS[`../../assets/codeclaw-themes/${themeId}/theme.json`] ?? {}
}

function resolveAsset(themeId: string, file: string): string | undefined {
  return THEME_ASSETS[`../../assets/codeclaw-themes/${themeId}/assets/${file}`]
}

// ===== 睡眠序列 =====

type SleepStage = 'awake' | 'yawning' | 'dozing' | 'collapsing' | 'sleeping' | 'waking'

const DEFAULT_TIMINGS: Required<Pick<ThemeTimings, 'mouseIdleTimeout' | 'mouseSleepTimeout' | 'yawnDuration' | 'collapseDuration' | 'wakeDuration'>> = {
  mouseIdleTimeout: 20_000,
  mouseSleepTimeout: 60_000,
  yawnDuration: 3_000,
  collapseDuration: 5_000,
  wakeDuration: 1_500,
}

function computeSleepStage(
  userIdle: boolean,
  activeSessionCount: number,
  hasBubble: boolean,
  idleSince: number,
  timings: Required<Pick<ThemeTimings, 'mouseIdleTimeout' | 'mouseSleepTimeout' | 'yawnDuration' | 'collapseDuration' | 'wakeDuration'>>,
): SleepStage {
  if (!userIdle || activeSessionCount > 0 || hasBubble) return 'awake'
  const t = Date.now() - idleSince
  if (t < timings.mouseIdleTimeout) return 'awake'
  if (t < timings.mouseIdleTimeout + timings.yawnDuration) return 'yawning'
  if (t < timings.mouseIdleTimeout + timings.yawnDuration + timings.collapseDuration) return 'dozing'
  if (t < timings.mouseSleepTimeout) return 'collapsing'
  return 'sleeping'
}

function useSleepTimeline(userIdle: boolean, activeSessionCount: number, hasBubble: boolean, wakeDuration: number): SleepStage {
  const timings = { ...DEFAULT_TIMINGS, wakeDuration }
  const [stage, setStage] = React.useState<SleepStage>('awake')
  const idleSinceRef = React.useRef<number | null>(null)
  const wakeUntilRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const shouldSleep = userIdle && activeSessionCount === 0 && !hasBubble
    if (shouldSleep) {
      if (idleSinceRef.current === null) idleSinceRef.current = Date.now()
      wakeUntilRef.current = null
    } else {
      idleSinceRef.current = null
    }
  }, [userIdle, activeSessionCount, hasBubble])

  React.useEffect(() => {
    const tick = (): void => {
      if (idleSinceRef.current === null) {
        // 非睡眠条件：从睡眠状态醒来时先短暂播放 waking 动画，再回 awake。
        setStage((prev) => {
          const now = Date.now()
          if (wakeUntilRef.current !== null && now < wakeUntilRef.current) return 'waking'
          wakeUntilRef.current = null
          if (prev === 'awake' || prev === 'waking') return 'awake'
          wakeUntilRef.current = now + wakeDuration
          return 'waking'
        })
        return
      }
      setStage(computeSleepStage(true, 0, false, idleSinceRef.current, timings))
    }
    const timer = setInterval(tick, 400)
    return () => clearInterval(timer)
  }, [userIdle, activeSessionCount, hasBubble, wakeDuration])

  return stage
}

// ===== 眼动追踪 =====

interface EyeTrackedSvgProps {
  /** 内联 SVG 文本（?raw 打包进 JS，避免 object 在 file:// 下加载失败）。 */
  svgRaw: string
  eyeTracking: ThemeEyeTracking
}

/**
 * 内联渲染 SVG 并驱动眼动追踪：
 * - 单目标模式（clawd）：eyes / body / shadow 分别按 maxOffset / bodyScale / shadowStretch 偏移
 * - 多层模式（calico）：eyeTracking.trackingLayers 里每层（eyes/head/body）独立偏移与缓动
 * SVG 通过 dangerouslySetInnerHTML 内联到当前 document，眼动用 querySelector 操作内部元素。
 */
function EyeTrackedSvg({ svgRaw, eyeTracking }: EyeTrackedSvgProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const cursorRef = React.useRef({ x: 0, y: 0 })
  const rafRef = React.useRef<number | null>(null)
  const targetsRef = React.useRef<{
    eyes?: SVGElement | null
    body?: SVGElement | null
    shadow?: SVGElement | null
    layers?: Array<{ wrapper: SVGGElement; maxOffset: number; ease: number; x: number; y: number }>
  }>({})

  React.useEffect(() => {
    return window.electronAPI.codeClaw.onCursor((point) => {
      cursorRef.current = point
    })
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const targets = targetsRef.current
    targets.eyes = null
    targets.body = null
    targets.shadow = null
    targets.layers = []

    const findById = (id: string): SVGElement | null => {
      const el = container.querySelector(`#${id}`)
      return el instanceof SVGElement ? el : null
    }

    const ids = eyeTracking.ids
    if (ids?.eyes) {
      targets.eyes = findById(ids.eyes)
      if (ids.body) targets.body = findById(ids.body)
      if (ids.shadow) targets.shadow = findById(ids.shadow)
    }
    if (eyeTracking.trackingLayers) {
      for (const [, layer] of Object.entries(eyeTracking.trackingLayers)) {
        if (!layer.ids || layer.ids.length === 0) continue
        // 把该层首个元素包进 <g> 以便统一控制 transform（避免重复包裹）。
        const firstId = layer.ids[0]
        if (!firstId) continue
        const el = findById(firstId)
        if (!el) continue
        let wrapper = el.closest('g[data-tracking-wrapper]') as SVGGElement | null
        if (!wrapper) {
          const svgEl = el.ownerSVGElement
          if (!svgEl) continue
          wrapper = svgEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement
          wrapper.setAttribute('data-tracking-wrapper', '1')
          el.parentNode?.insertBefore(wrapper, el)
          wrapper.appendChild(el)
        }
        targets.layers.push({ wrapper, maxOffset: layer.maxOffset ?? eyeTracking.maxOffset ?? 12, ease: layer.ease ?? 0.2, x: 0, y: 0 })
      }
    }

    const maxOffset = eyeTracking.maxOffset ?? 12
    const bodyScale = eyeTracking.bodyScale ?? 0.33
    const shadowStretch = eyeTracking.shadowStretch ?? 0.15
    const shadowShift = eyeTracking.shadowShift ?? 0.3
    const eyeRatioX = eyeTracking.eyeRatioX ?? 0.5
    const eyeRatioY = eyeTracking.eyeRatioY ?? 0.5

    const tick = (): void => {
      const cursor = cursorRef.current
      if (Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
        const winX = window.screenX
        const winY = window.screenY
        const winW = window.outerWidth || 220
        const winH = window.outerHeight || 220
        const eyeX = winX + winW * eyeRatioX
        const eyeY = winY + winH * eyeRatioY
        const relX = cursor.x - eyeX
        const relY = cursor.y - eyeY
        const dist = Math.hypot(relX, relY)
        let eyeDx = 0
        let eyeDy = 0
        if (dist > 1) {
          const scale = Math.min(1, dist / 300)
          eyeDx = (relX / dist) * maxOffset * scale
          eyeDy = (relY / dist) * maxOffset * scale
        }
        eyeDx = Math.max(-maxOffset * 0.85, Math.min(maxOffset * 0.85, eyeDx))
        eyeDy = Math.max(-maxOffset * 0.5, Math.min(maxOffset * 0.5, eyeDy))
        if (targets.eyes) targets.eyes.setAttribute('transform', `translate(${Math.round(eyeDx * 2) / 2}, ${Math.round(eyeDy * 2) / 2})`)
        const bdx = Math.round(eyeDx * bodyScale * 2) / 2
        const bdy = Math.round(eyeDy * bodyScale * 2) / 2
        if (targets.body) targets.body.setAttribute('transform', `translate(${bdx}, ${bdy})`)
        if (targets.shadow) {
          const scaleX = 1 + Math.abs(bdx) * shadowStretch
          const shiftX = Math.round(bdx * shadowShift * 2) / 2
          targets.shadow.setAttribute('transform', `translate(${shiftX}, 0) scale(${scaleX}, 1)`)
        }
        for (const layer of targets.layers ?? []) {
          const nx = layer.x + (eyeDx - layer.x) * layer.ease
          const ny = layer.y + (eyeDy - layer.y) * layer.ease
          layer.x = nx
          layer.y = ny
          layer.wrapper.setAttribute('transform', `translate(${Math.round(nx * 2) / 2}, ${Math.round(ny * 2) / 2})`)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [svgRaw, eyeTracking])

  return (
    <div
      ref={containerRef}
      className="codeclaw-eye-tracked"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgRaw }}
    />
  )
}

// ===== 交互气泡 =====

interface BubbleProps {
  interaction: CodeClawInteraction
  onDismiss: () => void
}

function BubbleCard({ interaction, onDismiss }: BubbleProps): React.ReactElement {
  const [alwaysAllow, setAlwaysAllow] = React.useState(false)

  const handlePermission = React.useCallback((behavior: 'allow' | 'deny'): void => {
    void window.electronAPI.respondPermission({ requestId: interaction.requestId, behavior, alwaysAllow }).catch(console.error)
    onDismiss()
  }, [interaction.requestId, alwaysAllow, onDismiss])

  const handleAskUser = React.useCallback((answer: string): void => {
    const first = interaction.questions?.[0]
    if (!first) return
    void window.electronAPI.respondAskUser({ requestId: interaction.requestId, answers: { [first.question]: answer } }).catch(console.error)
    onDismiss()
  }, [interaction.requestId, interaction.questions, onDismiss])

  const handlePlan = React.useCallback((action: 'approve_bypass' | 'deny'): void => {
    void window.electronAPI.respondExitPlanMode({ requestId: interaction.requestId, action }).catch(console.error)
    onDismiss()
  }, [interaction.requestId, onDismiss])

  return (
    <div className="codeclaw-bubble" role="dialog" aria-label={interaction.title}>
      <button type="button" className="codeclaw-bubble-close" onClick={onDismiss} aria-label="关闭气泡">
        <X size={12} />
      </button>
      <div className="codeclaw-bubble-head">
        <span className="codeclaw-bubble-badge">
          {interaction.kind === 'permission' ? '权限请求' : interaction.kind === 'ask_user_question' ? '需要你回答' : '计划审批'}
        </span>
      </div>
      <div className="codeclaw-bubble-title">{interaction.title}</div>
      <div className="codeclaw-bubble-desc">{interaction.description}</div>

      {interaction.kind === 'permission' && (
        <div className="codeclaw-bubble-actions">
          <label className="codeclaw-bubble-always">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(event) => setAlwaysAllow(event.target.checked)}
              disabled={!interaction.allowAlways}
            />
            本次会话总是允许
          </label>
          <div className="codeclaw-bubble-buttons">
            <button type="button" className="codeclaw-btn danger" onClick={() => handlePermission('deny')}>拒绝</button>
            <button type="button" className="codeclaw-btn primary" onClick={() => handlePermission('allow')}>允许</button>
          </div>
        </div>
      )}

      {interaction.kind === 'ask_user_question' && (
        <div className="codeclaw-bubble-options">
          {(interaction.questions?.[0]?.options ?? []).map((option) => (
            <button
              key={option.label}
              type="button"
              className="codeclaw-btn option"
              onClick={() => handleAskUser(option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {interaction.kind === 'plan_review' && (
        <div className="codeclaw-bubble-actions">
          {interaction.allowedPrompts && interaction.allowedPrompts.length > 0 && (
            <div className="codeclaw-bubble-prompts">
              {interaction.allowedPrompts.slice(0, 2).map((prompt) => (
                <div key={`${prompt.tool}:${prompt.prompt}`} className="codeclaw-bubble-prompt">{prompt.prompt}</div>
              ))}
              {interaction.allowedPrompts.length > 2 && (
                <div className="codeclaw-bubble-more">+{interaction.allowedPrompts.length - 2} 个操作…</div>
              )}
            </div>
          )}
          <div className="codeclaw-bubble-buttons">
            <button type="button" className="codeclaw-btn danger" onClick={() => handlePlan('deny')}>拒绝</button>
            <button type="button" className="codeclaw-btn primary" onClick={() => handlePlan('approve_bypass')}>批准</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 主组件 =====

function useCodeClawState(): CodeClawState | null {
  const [state, setState] = React.useState<CodeClawState | null>(null)
  React.useEffect(() => window.electronAPI.codeClaw.onState(setState), [])
  return state
}

const COMPLETE_SOUND = SOUND_ASSETS['../../assets/codeclaw-sounds/complete.mp3']
const CONFIRM_SOUND = SOUND_ASSETS['../../assets/codeclaw-sounds/confirm.mp3']

/**
 * 音效：任务完成 → complete；交互气泡出现 → confirm。
 * 10s 冷却、音效关闭或 DND 时静音（对齐上游 sound 行为）。
 */
function useCodeClawSounds(state: CodeClawState | null): void {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const lastCompleteAtRef = React.useRef(0)
  const prevPhaseRef = React.useRef<string | null>(null)
  const prevInteractionIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!state) return
    const enabled = state.soundEnabled !== false && !state.dnd
    const now = Date.now()

    if (enabled && state.phase === 'completed' && prevPhaseRef.current !== 'completed' && state.unreadCompletedCount > 0) {
      if (now - lastCompleteAtRef.current > 10_000 && COMPLETE_SOUND) {
        lastCompleteAtRef.current = now
        const audio = audioRef.current ?? new Audio(COMPLETE_SOUND)
        audioRef.current = audio
        audio.volume = 0.6
        audio.currentTime = 0
        void audio.play().catch(() => { /* 系统静音/不可用时忽略 */ })
      }
    }
    prevPhaseRef.current = state.phase

    const interactionId = state.prioritySession?.interaction?.requestId
    if (enabled && interactionId && interactionId !== prevInteractionIdRef.current && CONFIRM_SOUND) {
      const audio = audioRef.current ?? new Audio(CONFIRM_SOUND)
      audioRef.current = audio
      audio.volume = 0.5
      audio.currentTime = 0
      void audio.play().catch(() => { /* 忽略 */ })
    }
    prevInteractionIdRef.current = interactionId ?? null
  }, [state])
}

function phaseIcon(phase: CodeClawPhase): React.ReactNode {
  if (phase === 'needs-interaction') return <MousePointer2 size={14} />
  if (phase === 'completed') return <CheckCircle2 size={14} />
  if (phase === 'error') return <AlertCircle size={14} />
  if (phase === 'running') return <TerminalSquare size={14} />
  return <Sparkles size={14} />
}

/** 主视觉 → Mini 素材状态映射。 */
function mapToMiniVisual(visual: CodeClawVisual, phase: CodeClawPhase): CodeClawMiniVisual {
  if (phase === 'completed') return 'mini-happy'
  if (phase === 'needs-interaction' || visual === 'notification') return 'mini-alert'
  if (visual === 'sleeping') return 'mini-sleep'
  if (visual === 'attention') return 'mini-happy'
  if (visual === 'working' || visual === 'thinking' || visual === 'juggling' || visual === 'sweeping' || visual === 'carrying' || visual === 'error') return 'mini-working'
  return 'mini-idle'
}

/** 解析当前应展示的素材文件（带 fallback 链）。 */
function resolveVisualFile(
  theme: ThemeJson,
  visual: CodeClawVisual,
  mini: boolean,
  miniVisual: CodeClawMiniVisual,
): string | undefined {
  const states = theme.states ?? {}
  const miniStates = theme.miniMode?.states ?? {}
  if (mini) {
    return miniStates[miniVisual]?.[0] ?? miniStates['mini-idle']?.[0]
  }
  const files = states[visual]
  if (files && files.length > 0) return files[0]
  return states.idle?.[0]
}

export function CodeClawApp(): React.ReactElement {
  const state = useCodeClawState()
  const dragRef = React.useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const clickSeqRef = React.useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 })
  const [dragging, setDragging] = React.useState(false)
  const [reaction, setReaction] = React.useState<string | null>(null)
  const [dismissedBubble, setDismissedBubble] = React.useState<string | null>(null)
  const [miniPeeked, setMiniPeeked] = React.useState(false)
  const [hudOpen, setHudOpen] = React.useState(false)

  const phase = state?.phase ?? 'idle'
  const visual = (state?.visual ?? 'idle') as CodeClawVisual
  const visible = state?.visible !== false
  const themeId = isCodeClawThemeId(state?.themeId) ? state.themeId : DEFAULT_CODECLAW_THEME_ID
  const size = isCodeClawSize(state?.size) ? state.size : DEFAULT_CODECLAW_SIZE
  const dnd = state?.dnd ?? false
  const headline = state?.headline ?? 'CodeClaw'
  const detail = state?.detail ?? '准备协助你的研发工作'
  const active = state?.activeSessionCount ?? 0
  const pending = state?.pendingInteractionCount ?? 0
  const done = state?.unreadCompletedCount ?? 0
  const userIdle = state?.userIdle ?? false
  const miniMode = state?.miniMode ?? false
  const interaction = state?.prioritySession?.interaction
  const showBubble = !!interaction && dismissedBubble !== interaction.requestId

  useCodeClawSounds(state)

  const theme = React.useMemo(() => getThemeData(themeId), [themeId])
  const timings = React.useMemo<Required<Pick<ThemeTimings, 'mouseIdleTimeout' | 'mouseSleepTimeout' | 'yawnDuration' | 'collapseDuration' | 'wakeDuration'>>>(() => ({
    mouseIdleTimeout: theme.timings?.mouseIdleTimeout ?? DEFAULT_TIMINGS.mouseIdleTimeout,
    mouseSleepTimeout: theme.timings?.mouseSleepTimeout ?? DEFAULT_TIMINGS.mouseSleepTimeout,
    yawnDuration: theme.timings?.yawnDuration ?? DEFAULT_TIMINGS.yawnDuration,
    collapseDuration: theme.timings?.collapseDuration ?? DEFAULT_TIMINGS.collapseDuration,
    wakeDuration: theme.timings?.wakeDuration ?? DEFAULT_TIMINGS.wakeDuration,
  }), [theme])

  const sleepStage = useSleepTimeline(userIdle, active, showBubble, timings.wakeDuration)

  // 视觉解析优先级：点击反应 > 睡眠序列 > 主进程细粒度视觉 > idle
  const miniVisual = React.useMemo(() => mapToMiniVisual(visual, phase), [visual, phase])
  let displayFile: string | undefined
  if (reaction) {
    displayFile = reaction
  } else if (miniMode) {
    displayFile = resolveVisualFile(theme, visual, true, miniVisual)
  } else if (sleepStage === 'waking') {
    displayFile = theme.states?.waking?.[0] ?? resolveVisualFile(theme, visual, false, 'mini-idle')
  } else if (sleepStage !== 'awake') {
    displayFile = resolveVisualFile(theme, sleepStage as CodeClawVisual, false, 'mini-idle')
  } else {
    displayFile = resolveVisualFile(theme, visual, false, 'mini-idle')
  }
  const displaySrc = displayFile ? resolveAsset(themeId, displayFile) : undefined

  // 眼动追踪：仅 idle / dozing 且主题支持且当前是 follow 素材且内联 raw 可用时启用
  const eyeTracking = theme.eyeTracking
  const eyeSvgRaw = (eyeTracking?.enabled
    && !miniMode
    && !reaction
    && (sleepStage === 'awake')
    && (eyeTracking.states ?? []).includes(visual)
    && displayFile?.endsWith('.svg')
    && displayFile
    ? getThemeEyeSvgRaw(themeId, displayFile)
    : undefined)
  const eyeTrackingEnabled = !!eyeSvgRaw

  const openMain = React.useCallback(() => {
    void window.electronAPI.codeClaw.openMainWindow()
  }, [])

  const openSession = React.useCallback(() => {
    void window.electronAPI.codeClaw.openSession(state?.prioritySession?.sessionId)
  }, [state?.prioritySession?.sessionId])

  const handlePointerDown = React.useCallback((event: React.MouseEvent) => {
    // Mini 模式下拖拽直接退出 Mini 再继续移动。
    if (state?.miniMode) {
      void window.electronAPI.codeClaw.setMiniMode({ mini: false })
    }
    dragRef.current = { x: event.screenX, y: event.screenY, moved: false }
    setDragging(true)
  }, [state?.miniMode])

  React.useEffect(() => {
    if (!dragging) return
    const onMove = (event: MouseEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = event.screenX - drag.x
      const dy = event.screenY - drag.y
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return
      if (!drag.moved) {
        // 开始拖拽 → 播放 drag 反应素材（若主题提供）。
        const dragFile = theme.reactions?.drag?.file
        if (dragFile) setReaction(resolveAsset(themeId, dragFile) ?? null)
      }
      drag.moved = true
      void window.electronAPI.codeClaw.move(event.screenX - 110, event.screenY - 110)
      drag.x = event.screenX
      drag.y = event.screenY
    }
    const onUp = (): void => {
      const wasDragged = dragRef.current?.moved === true
      dragRef.current = null
      setDragging(false)
      setReaction(null)
      if (wasDragged) {
        // 拖拽结束后检测是否贴边 → 进入 Mini 模式。
        const nearLeft = window.screenX <= 4
        const nearRight = window.screenX + (window.outerWidth || 220) >= (window.screen.availWidth || window.innerWidth) - 4
        if (nearLeft) void window.electronAPI.codeClaw.setMiniMode({ mini: true, edge: 'left' })
        else if (nearRight) void window.electronAPI.codeClaw.setMiniMode({ mini: true, edge: 'right' })
      } else {
        openSession()
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, openSession, themeId, theme.reactions])

  // 快速连点（3 次+）→ annoyed 反应，不打断双击打开主窗口。
  const handleClick = React.useCallback(() => {
    const now = Date.now()
    const seq = clickSeqRef.current
    if (now - seq.lastAt > 350) {
      seq.count = 1
      seq.lastAt = now
      return
    }
    seq.count += 1
    seq.lastAt = now
    if (seq.count >= 3) {
      seq.count = 0
      const annoyed = theme.reactions?.annoyed
      const dbl = theme.reactions?.double
      const annoyedFile = annoyed?.file
      const doubleFile = dbl?.file ?? (dbl?.files && dbl.files.length > 0 ? dbl.files[0] : undefined)
      const file = annoyedFile ?? doubleFile
      const duration = annoyed?.duration ?? dbl?.duration ?? 3_500
      if (file) {
        const src = resolveAsset(themeId, file)
        if (src) {
          setReaction(src)
          window.setTimeout(() => setReaction(null), duration)
        }
      }
    }
  }, [themeId, theme.reactions])

  const handleMiniPeekEnter = React.useCallback(() => {
    if (!miniMode || miniPeeked) return
    setMiniPeeked(true)
    void window.electronAPI.codeClaw.peekMini({ peek: true })
  }, [miniMode, miniPeeked])

  const handleMiniPeekLeave = React.useCallback(() => {
    if (!miniPeeked) return
    setMiniPeeked(false)
    void window.electronAPI.codeClaw.peekMini({ peek: false })
  }, [miniPeeked])

  const handleMiniClick = React.useCallback(() => {
    // 点击 Mini 宠物：退出 Mini 并聚焦主窗口。
    void window.electronAPI.codeClaw.setMiniMode({ mini: false })
    openMain()
  }, [openMain])

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    void window.electronAPI.codeClaw.openContextMenu()
  }, [])

  const handleHudToggle = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setHudOpen((prev) => !prev)
  }, [])

  const handleHudOpenSession = React.useCallback((sessionId: string) => {
    setHudOpen(false)
    void window.electronAPI.codeClaw.openSession(sessionId)
  }, [])

  if (!visible) return <div className="codeclaw-root" />

  return (
    <div
      className={`codeclaw-root ${miniMode ? 'codeclaw-mini' : ''} ${miniPeeked ? 'peeked' : ''} size-${size} ${dnd ? 'dnd-on' : ''}`}
      onMouseEnter={handleMiniPeekEnter}
      onMouseLeave={handleMiniPeekLeave}
      onContextMenu={handleContextMenu}
    >
      {showBubble && <BubbleCard interaction={interaction} onDismiss={() => setDismissedBubble(interaction.requestId)} />}
      {hudOpen && !miniMode && (
        <div className="codeclaw-hud" role="menu" aria-label="会话列表">
          <div className="codeclaw-hud-head">
            <span>会话</span>
            <button type="button" className="codeclaw-hud-close" onClick={() => setHudOpen(false)} aria-label="关闭会话列表">
              <X size={12} />
            </button>
          </div>
          <div className="codeclaw-hud-list">
            {(state?.sessions ?? []).length === 0 && <div className="codeclaw-hud-empty">暂无活跃会话</div>}
            {(state?.sessions ?? []).map((session) => (
              <button
                key={session.sessionId}
                type="button"
                className="codeclaw-hud-item"
                onClick={() => handleHudOpenSession(session.sessionId)}
              >
                <span className={`codeclaw-hud-dot ${session.phase}`} />
                <span className="codeclaw-hud-item-title">{session.title || '未命名会话'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className={`codeclaw-card ${phase} theme-${themeId} ${dragging ? 'dragging' : ''} ${miniMode ? 'is-mini' : ''} ${sleepStage !== 'awake' ? `codeclaw-sleep-${sleepStage}` : ''}`}
        onMouseDown={handlePointerDown}
        onClick={handleClick}
        onDoubleClick={openMain}
        onContextMenu={handleContextMenu}
        title="单击打开当前会话，拖动移动，双击打开 MyYoda；拖到屏幕边缘进入 Mini 模式，右键打开菜单"
      >
        <span className="codeclaw-glow" />
        {displaySrc && eyeTrackingEnabled && eyeSvgRaw
          ? <EyeTrackedSvg svgRaw={eyeSvgRaw} eyeTracking={eyeTracking ?? {}} />
          : (
            <span className="codeclaw-mascot codeclaw-vendored-theme" aria-hidden="true">
              <img src={displaySrc} alt="" draggable={false} />
            </span>
          )}
        {!miniMode && (
          <button
            type="button"
            className="codeclaw-hud-toggle"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleHudToggle}
            aria-label="会话列表"
          >
            <List size={13} />
          </button>
        )}
        {dnd && !miniMode && <span className="codeclaw-dnd-badge">免打扰</span>}
        {!miniMode && (
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
        )}
        {miniMode && <span className="codeclaw-mini-actions"><Check size={10} /> Mini</span>}
      </button>
    </div>
  )
}

const PHASE_LABEL: Record<CodeClawPhase, string> = {
  idle: '待命',
  running: '执行中',
  'needs-interaction': '待接手',
  completed: '已完成',
  error: '需关注',
}
