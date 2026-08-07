/**
 * 主题领域逻辑。
 *
 * 旧主题负责表达 MyYoda 的鲜明视觉个性；ThemePack 负责让用户像 Craft 一样
 * 自定义整块画布、前景、强调色和窗口材质。两者通过同一批 CSS token 汇合。
 */

import type {
  ChromeTheme,
  ThemeCanvas,
  ThemeFonts,
  ThemePack,
  ThemeSemanticColors,
  ThemeState,
  ThemeSurfaces,
  ThemeStyle,
  ThemeVariant,
} from '../../types'
// Craft 预设通过下方 re-export 暴露给设置页；同时本文件内部也要用 getCraftThemePack 做存量迁移。
import {
  DEFAULT_CHROME_THEMES,
  DEFAULT_INTERFACE_VARIANT,
  DEFAULT_THEME_STYLE,
  DEFAULT_THEME_MODE as DEFAULT_MODE,
  THEME_STYLES,
} from '../../types'
import { getCraftThemePack } from './theme.seed'

export type { ChromeTheme, ThemeCanvas, ThemeFonts, ThemePack, ThemeSemanticColors, ThemeState, ThemeSurfaces, ThemeVariant }
export type { CraftThemePreset } from './theme.seed'
export { CRAFT_THEME_PRESETS, getCraftThemePack } from './theme.seed'

export interface ThemeCssVariableBuild {
  variables: Record<string, string>
  material: 'opaque' | 'translucent'
}

export interface ThemeSharePayload {
  style: ThemeStyle
  variant: ThemeVariant
  pack: ThemePack
}

export interface CodeThemeOption {
  id: string
  label: string
  variants: readonly ThemeVariant[]
}

export const THEME_SHARE_PREFIX = 'myyoda-theme-v1:'

// 主题初始化是异步的；如果用户在 getSettings() 返回前切换界面风格，
// 旧的持久化值不能在请求完成后覆盖用户刚选中的值。
let interfaceVariantUpdateEpoch = 0

export function captureInterfaceVariantUpdateEpoch(): number {
  return interfaceVariantUpdateEpoch
}

export function markInterfaceVariantUpdated(): void {
  interfaceVariantUpdateEpoch += 1
}

export function canApplyHydratedInterfaceVariant(epoch: number): boolean {
  return epoch === interfaceVariantUpdateEpoch
}

export const CODE_THEME_OPTIONS: readonly CodeThemeOption[] = [
  { id: 'myyoda', label: 'MyYoda', variants: ['light', 'dark'] },
  { id: 'codex', label: 'Codex', variants: ['light', 'dark'] },
  { id: 'github', label: 'GitHub', variants: ['light', 'dark'] },
  { id: 'nord', label: 'Nord', variants: ['dark'] },
  { id: 'dracula', label: 'Dracula', variants: ['dark'] },
  { id: 'everforest', label: 'Everforest', variants: ['light', 'dark'] },
  { id: 'rose-pine', label: 'Rose Pine', variants: ['light', 'dark'] },
  { id: 'matrix', label: 'Matrix', variants: ['dark'] },
] as const

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const CSS_COLOR_RE = /^(?:#[0-9a-f]{3,8}|rgba?\([^;{}]+\)|hsla?\([^;{}]+\)|oklch\([^;{}]+\))$/i
const LEGACY_STYLES = THEME_STYLES.filter((style) => style !== 'default' && style !== 'custom')

const LEGACY_THEME_SEEDS: Record<ThemeStyle, Partial<Record<ThemeVariant, ChromeTheme>>> = {
  default: {
    light: {
      accent: '#0a0a0a',
      contrast: 50,
      fonts: { ui: null, code: null },
      ink: '#0a0a0a',
      opaqueWindows: true,
      semanticColors: { diffAdded: '#16803c', diffRemoved: '#ba2623', skill: '#7048c8' },
      surface: '#ffffff',
      canvas: { background: '#ffffff', shellFrom: '#f1f1ef', shellTo: '#fafafa' },
    },
    dark: {
      accent: '#da7756',
      contrast: 50,
      fonts: { ui: null, code: null },
      ink: '#f4f1ec',
      opaqueWindows: true,
      semanticColors: { diffAdded: '#40c977', diffRemoved: '#fa423e', skill: '#ad7bf9' },
      surface: '#1a1612',
      canvas: { background: '#1a1612', shellFrom: '#14110e', shellTo: '#1f1914' },
    },
  },
  'ocean-light': {
    light: {
      accent: '#408abf', contrast: 50, fonts: { ui: null, code: null }, ink: '#1b2632', opaqueWindows: false,
      semanticColors: { diffAdded: '#16803c', diffRemoved: '#ba2623', skill: '#5b62bd' }, surface: '#ecf2f7',
      canvas: { background: '#f4f7fa', shellFrom: '#dceaf4', shellTo: '#eaf2f8' },
    },
  },
  'ocean-dark': {
    dark: {
      accent: '#6d9bbd', contrast: 50, fonts: { ui: null, code: null }, ink: '#e7ebef', opaqueWindows: false,
      semanticColors: { diffAdded: '#40c977', diffRemoved: '#fa423e', skill: '#9f9fe8' }, surface: '#151b22',
      canvas: { background: '#14191f', shellFrom: '#0b1015', shellTo: '#121b24' },
    },
  },
  'forest-light': {
    light: {
      accent: '#4d7a58', contrast: 50, fonts: { ui: null, code: null }, ink: '#263529', opaqueWindows: false,
      semanticColors: { diffAdded: '#16803c', diffRemoved: '#ba2623', skill: '#65784e' }, surface: '#e7ecdc',
      canvas: { background: '#f0f5e9', shellFrom: '#dfe8d3', shellTo: '#edf3e5' },
    },
  },
  'forest-dark': {
    dark: {
      accent: '#6ca178', contrast: 50, fonts: { ui: null, code: null }, ink: '#e3e8e5', opaqueWindows: false,
      semanticColors: { diffAdded: '#40c977', diffRemoved: '#fa423e', skill: '#a7c48f' }, surface: '#19221c',
      canvas: { background: '#151c18', shellFrom: '#0d1410', shellTo: '#142019' },
    },
  },
  'slate-light': {
    light: {
      accent: '#bda59b', contrast: 50, fonts: { ui: null, code: null }, ink: '#312f2a', opaqueWindows: true,
      semanticColors: { diffAdded: '#16803c', diffRemoved: '#ba2623', skill: '#8d6d9d' }, surface: '#e3e1dc',
      canvas: { background: '#f0efec', shellFrom: '#dedbd5', shellTo: '#ebe9e4' },
    },
  },
  'slate-dark': {
    dark: {
      accent: '#c9a89e', contrast: 50, fonts: { ui: null, code: null }, ink: '#e9e6e3', opaqueWindows: true,
      semanticColors: { diffAdded: '#40c977', diffRemoved: '#fa423e', skill: '#bca4d8' }, surface: '#1d1b20',
      canvas: { background: '#161418', shellFrom: '#100f13', shellTo: '#1d1a20' },
    },
  },
  'terminal-dark': {
    dark: {
      accent: '#6b9e52', contrast: 50, fonts: { ui: 'JetBrains Mono', code: 'JetBrains Mono' }, ink: '#acb09f', opaqueWindows: true,
      semanticColors: { diffAdded: '#7fd962', diffRemoved: '#c45b4c', skill: '#a8a45e' }, surface: '#0d0e0c',
      canvas: { background: '#0f100e', shellFrom: '#0c0e0b', shellTo: '#121510' },
    },
  },
  custom: {},
}

export const DEFAULT_THEME_STATE: ThemeState = {
  mode: DEFAULT_MODE,
  style: DEFAULT_THEME_STYLE,
  packs: {
    light: { codeThemeId: 'myyoda', theme: DEFAULT_CHROME_THEMES.light },
    dark: { codeThemeId: 'myyoda', theme: DEFAULT_CHROME_THEMES.dark },
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback
}

function normalizeCssColor(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized.length <= 120 && CSS_COLOR_RE.test(normalized) ? normalized : fallback
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback
}

function normalizeUnit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
}

function normalizeFonts(value: unknown, fallback: ThemeFonts): ThemeFonts {
  if (!isRecord(value)) return fallback
  return {
    ui: typeof value.ui === 'string' && value.ui.trim() ? value.ui.trim() : null,
    code: typeof value.code === 'string' && value.code.trim() ? value.code.trim() : null,
  }
}

function normalizeCanvas(value: unknown, fallback: ThemeCanvas, surface: string): ThemeCanvas {
  const canvas = isRecord(value) ? value : {}
  const mode = canvas.mode === 'scenic' ? 'scenic' : 'solid'
  const backgroundImage = typeof canvas.backgroundImage === 'string' && canvas.backgroundImage.trim()
    ? canvas.backgroundImage.trim()
    : null
  return {
    background: normalizeHex(canvas.background, fallback.background || surface),
    shellFrom: normalizeHex(canvas.shellFrom, fallback.shellFrom),
    shellTo: normalizeHex(canvas.shellTo, fallback.shellTo),
    mode,
    backgroundImage,
    backgroundAlpha: normalizeUnit(canvas.backgroundAlpha, fallback.backgroundAlpha ?? (mode === 'scenic' ? 0.4 : 1)),
    backgroundOverlayColor: normalizeOptionalCssColor(canvas.backgroundOverlayColor, fallback.backgroundOverlayColor),
  }
}

/** 与 normalizeCssColor 相同的校验，但缺失时返回 undefined 而非强制回退值。 */
function normalizeOptionalCssColor(value: unknown, fallback: string | undefined): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized.length <= 120 && CSS_COLOR_RE.test(normalized) ? normalized : fallback
}

function normalizeSurfaces(value: unknown, fallback: string): ThemeSurfaces | undefined {
  if (!isRecord(value)) return undefined
  return {
    paper: normalizeCssColor(value.paper, fallback),
    navigator: normalizeCssColor(value.navigator, fallback),
    input: normalizeCssColor(value.input, fallback),
    popover: normalizeCssColor(value.popover, fallback),
    popoverSolid: normalizeCssColor(value.popoverSolid, fallback),
  }
}

function normalizeSemantics(value: unknown, fallback: ThemeSemanticColors): ThemeSemanticColors {
  const semantics = isRecord(value) ? value : {}
  return {
    diffAdded: normalizeHex(semantics.diffAdded, fallback.diffAdded),
    diffRemoved: normalizeHex(semantics.diffRemoved, fallback.diffRemoved),
    skill: normalizeHex(semantics.skill, fallback.skill),
    info: normalizeCssColor(semantics.info, fallback.info ?? '#fbbf24'),
    success: normalizeCssColor(semantics.success, fallback.success ?? '#22c55e'),
    destructive: normalizeCssColor(semantics.destructive, fallback.destructive ?? fallback.diffRemoved),
  }
}

export function normalizeChromeTheme(value: unknown, variant: ThemeVariant): ChromeTheme {
  const fallback = DEFAULT_CHROME_THEMES[variant]
  const theme = isRecord(value) ? value : {}
  const surface = normalizeHex(theme.surface, fallback.surface)
  const canvas = normalizeCanvas(theme.canvas, fallback.canvas, surface)
  const surfaces = normalizeSurfaces(theme.surfaces, surface)
  // Haze 的调色板会持续演进（如本轮从冷黑改暖褐玻璃）；读取存量持久化配置时始终同步到
  // getCraftThemePack('haze', 'dark') 的当前权威值，避免用户必须再次点击预设才能看到更新。
  const isPersistedHaze = canvas.mode === 'scenic' && canvas.backgroundImage?.includes('theme-haze-scenic')
  const hazeCanonical = isPersistedHaze ? getCraftThemePack('haze', 'dark')?.theme : undefined
  return {
    accent: hazeCanonical?.accent ?? normalizeHex(theme.accent, fallback.accent),
    contrast: normalizeNumber(theme.contrast, fallback.contrast),
    fonts: normalizeFonts(theme.fonts, fallback.fonts),
    ink: hazeCanonical?.ink ?? normalizeHex(theme.ink, fallback.ink),
    opaqueWindows: typeof theme.opaqueWindows === 'boolean' ? theme.opaqueWindows : fallback.opaqueWindows,
    semanticColors: normalizeSemantics(theme.semanticColors, fallback.semanticColors),
    surface: hazeCanonical?.surface ?? surface,
    surfaces: hazeCanonical?.surfaces ?? surfaces,
    canvas: hazeCanonical
      ? { ...canvas, background: hazeCanonical.canvas.background, backgroundOverlayColor: hazeCanonical.canvas.backgroundOverlayColor }
      : canvas,
  }
}

export function normalizeThemePack(value: unknown, variant: ThemeVariant): ThemePack {
  const pack = isRecord(value) ? value : {}
  return {
    codeThemeId: typeof pack.codeThemeId === 'string' ? pack.codeThemeId : 'myyoda',
    theme: normalizeChromeTheme(pack.theme, variant),
  }
}

export function normalizeThemeState(value: unknown): ThemeState {
  const state = isRecord(value) ? value : {}
  const packs = isRecord(state.packs) ? state.packs : {}
  const legacyChromeThemes = isRecord(state.chromeThemes) ? state.chromeThemes : {}
  const style = typeof state.style === 'string' && (THEME_STYLES as readonly string[]).includes(state.style)
    ? state.style as ThemeStyle
    : DEFAULT_THEME_STYLE
  const readPack = (variant: ThemeVariant): unknown => {
    if (packs[variant] !== undefined) return packs[variant]
    const legacyTheme = legacyChromeThemes[variant]
    return legacyTheme === undefined ? undefined : { codeThemeId: 'myyoda', theme: legacyTheme }
  }
  return {
    mode: state.mode === 'light' || state.mode === 'dark' || state.mode === 'system' || state.mode === 'special'
      ? state.mode
      : DEFAULT_THEME_STATE.mode,
    style,
    packs: {
      light: normalizeThemePack(readPack('light'), 'light'),
      dark: normalizeThemePack(readPack('dark'), 'dark'),
    },
  }
}

export function getLegacyThemePack(style: ThemeStyle, variant: ThemeVariant): ThemePack {
  const seed = LEGACY_THEME_SEEDS[style]?.[variant] ?? LEGACY_THEME_SEEDS.default?.[variant] ?? DEFAULT_CHROME_THEMES[variant]
  return {
    codeThemeId: style === 'terminal-dark' ? 'matrix' : 'myyoda',
    theme: normalizeChromeTheme(seed, variant),
  }
}

export function getAvailableLegacyStyles(variant: ThemeVariant): readonly ThemeStyle[] {
  return LEGACY_STYLES.filter((style) => Boolean(LEGACY_THEME_SEEDS[style]?.[variant]))
}

export function resolveThemePack(state: ThemeState, variant: ThemeVariant): ThemePack {
  if (state.mode === 'special' && state.style !== 'default' && state.style !== 'custom') {
    return getLegacyThemePack(state.style, variant)
  }
  return normalizeThemePack(state.packs[variant], variant)
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function rgbToHsl([red, green, blue]: [number, number, number]): string {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  if (max === min) return `0 ${Math.round(lightness * 100)}% ${Math.round(lightness * 100)}%`
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0)
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  return `${Math.round((hue / 6) * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
}

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`
}

function mixHex(left: string, right: string, amount: number): string {
  const a = hexToRgb(left)
  const b = hexToRgb(right)
  const mix = (index: number) => Math.round(a[index]! + (b[index]! - a[index]!) * amount)
  return `#${[mix(0), mix(1), mix(2)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

// ink：背景较亮时使用的深色；lightInk：背景较暗时使用的浅色（调用方传反过一次，导致近黑 accent 上叠近黑文字，务必保持这个顺序）
function readableForeground(background: string, ink: string, lightInk: string): string {
  const [red, green, blue] = hexToRgb(background)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance > 0.58 ? ink : lightInk
}

function cssUrl(value: string | null | undefined): string {
  if (!value) return 'none'
  const escaped = value.replace(/[\\"']/g, '\\$&')
  return `url("${escaped}")`
}

export function buildThemeCssVariables(
  pack: ThemePack,
  variant: ThemeVariant,
  options?: { electron?: boolean; isMac?: boolean },
): ThemeCssVariableBuild {
  const theme = normalizeChromeTheme(pack.theme, variant)
  const light = variant === 'light'
  const background = theme.canvas.background
  const foreground = theme.ink
  const secondary = mixHex(background, foreground, light ? 0.06 : 0.12)
  const muted = mixHex(background, foreground, light ? 0.08 : 0.16)
  const card = mixHex(background, foreground, light ? 0.02 : 0.10)
  const derivedPopover = mixHex(background, foreground, light ? 0.04 : 0.18)
  const primaryForeground = readableForeground(theme.accent, '#101010', '#ffffff')
  const secondaryForeground = readableForeground(secondary, foreground, '#ffffff')
  const surfaceHsl = rgbToHsl(hexToRgb(background))
  const foregroundHsl = rgbToHsl(hexToRgb(foreground))
  const accentHsl = rgbToHsl(hexToRgb(theme.accent))
  const primaryForegroundHsl = rgbToHsl(hexToRgb(primaryForeground))
  const material = options?.electron && options.isMac && !theme.opaqueWindows ? 'translucent' : 'opaque'
  const scenic = theme.canvas.mode === 'scenic'
  const surfaces = theme.surfaces ?? {}
  const paper = surfaces.paper ?? theme.surface
  const navigator = surfaces.navigator ?? theme.surface
  const input = surfaces.input ?? background
  const popoverSurface = surfaces.popover ?? derivedPopover
  const popoverSolid = surfaces.popoverSolid ?? popoverSurface
  const contentBackground = scenic ? paper : background
  const shellBackground = scenic
    ? 'transparent'
    : `linear-gradient(135deg, hsl(${rgbToHsl(hexToRgb(theme.canvas.shellFrom))}) 0%, hsl(${rgbToHsl(hexToRgb(theme.canvas.shellTo))}) 100%)`
  const backgroundOverlay = scenic
    ? theme.canvas.backgroundOverlayColor ?? `rgba(0, 0, 0, ${theme.canvas.backgroundAlpha ?? 0.4})`
    : 'transparent'
  // Craft Scenic 的面板毛玻璃是 8px；普通 translucent surface 保持原有 16px，避免 Haze
  // 把低对比的雾景进一步糊成一整块灰色。
  const surfaceBackdrop = material === 'translucent'
    ? `${scenic ? 'blur(8px)' : 'blur(16px)'} saturate(135%)`
    : 'none'

  return {
    material,
    variables: {
      '--background': surfaceHsl,
      '--foreground': foregroundHsl,
      '--content-area': rgbToHsl(hexToRgb(background)),
      '--sidebar-surface': rgbToHsl(hexToRgb(theme.surface)),
      '--tabbar-surface': rgbToHsl(hexToRgb(theme.surface)),
      '--tab-surface': surfaceHsl,
      '--sidebar-control-surface': rgbToHsl(hexToRgb(mixHex(theme.surface, foreground, light ? 0.08 : 0.16))),
      '--sidebar-control-surface-hover': rgbToHsl(hexToRgb(mixHex(theme.surface, foreground, light ? 0.12 : 0.22))),
      '--input-surface': surfaceHsl,
      '--primary': accentHsl,
      '--primary-foreground': primaryForegroundHsl,
      '--secondary': rgbToHsl(hexToRgb(secondary)),
      '--secondary-foreground': rgbToHsl(hexToRgb(secondaryForeground)),
      '--accent': rgbToHsl(hexToRgb(mixHex(background, theme.accent, light ? 0.14 : 0.24))),
      '--accent-foreground': rgbToHsl(hexToRgb(theme.accent)),
      '--ring': accentHsl,
      '--muted': rgbToHsl(hexToRgb(muted)),
      '--muted-foreground': rgbToHsl(hexToRgb(mixHex(foreground, background, light ? 0.48 : 0.42))),
      '--border': rgbToHsl(hexToRgb(mixHex(background, foreground, light ? 0.14 : 0.24))),
      '--input': rgbToHsl(hexToRgb(mixHex(background, foreground, light ? 0.10 : 0.18))),
      '--card': rgbToHsl(hexToRgb(card)),
      '--card-foreground': foregroundHsl,
      '--popover': rgbToHsl(hexToRgb(derivedPopover)),
      '--popover-foreground': foregroundHsl,
      '--dialog': rgbToHsl(hexToRgb(derivedPopover)),
      '--dialog-foreground': foregroundHsl,
      '--destructive': rgbToHsl(hexToRgb(theme.semanticColors.diffRemoved)),
      '--destructive-foreground': primaryForegroundHsl,
      '--stop-hover-bg': rgba(theme.semanticColors.diffRemoved, 0.12),
      '--tooltip': rgbToHsl(hexToRgb(mixHex(background, foreground, light ? 0.72 : 0.32))),
      '--tooltip-foreground': '0 0% 98%',
      '--tooltip-muted': rgbToHsl(hexToRgb(mixHex(foreground, background, 0.28))),
      '--code-bg': rgbToHsl(hexToRgb(mixHex(background, foreground, light ? 0.72 : 0.20))),
      '--tab-indicator': accentHsl,
      '--theme-font-ui': theme.fonts.ui ?? '',
      '--theme-font-code': theme.fonts.code ?? '',
      '--theme-mode': theme.canvas.mode ?? 'solid',
      '--background-image': cssUrl(theme.canvas.backgroundImage),
      '--theme-background-alpha': String(theme.canvas.backgroundAlpha ?? (scenic ? 0.4 : 1)),
      '--app-background-overlay': backgroundOverlay,
      '--diff-added': theme.semanticColors.diffAdded,
      '--diff-removed': theme.semanticColors.diffRemoved,
      '--skill': theme.semanticColors.skill,
      '--shell-bg-from': rgbToHsl(hexToRgb(theme.canvas.shellFrom)),
      '--shell-bg-to': rgbToHsl(hexToRgb(theme.canvas.shellTo)),
      '--app-shell-background': shellBackground,
      '--app-content-background': contentBackground,
      '--app-paper-background': paper,
      '--app-navigator-background': navigator,
      '--app-input-background': input,
      '--app-popover-background': popoverSurface,
      '--app-popover-solid': popoverSolid,
      '--app-content-backdrop-filter': surfaceBackdrop,
      '--app-sidebar-background': material === 'translucent' ? `color-mix(in srgb, ${navigator} 72%, transparent)` : navigator,
      '--app-sidebar-backdrop-filter': surfaceBackdrop,
    },
  }
}

export function createThemeShareString(variant: ThemeVariant, style: ThemeStyle, pack: ThemePack): string {
  return `${THEME_SHARE_PREFIX}${JSON.stringify({ variant, style, pack })}`
}

export function parseThemeShareString(value: string): ThemeSharePayload {
  const trimmed = value.trim()
  if (!trimmed.startsWith(THEME_SHARE_PREFIX)) throw new Error('主题分享字符串格式不正确。')
  try {
    const payload = JSON.parse(trimmed.slice(THEME_SHARE_PREFIX.length)) as unknown
    if (!isRecord(payload) || (payload.variant !== 'light' && payload.variant !== 'dark')) throw new Error('主题变体无效。')
    const style = typeof payload.style === 'string' && (THEME_STYLES as readonly string[]).includes(payload.style)
      ? payload.style as ThemeStyle
      : 'custom'
    return { variant: payload.variant, style, pack: normalizeThemePack(payload.pack, payload.variant) }
  } catch (error) {
    if (error instanceof Error && error.message !== '主题分享字符串格式不正确。') throw error
    throw new Error('主题分享字符串无法解析。')
  }
}

export function updateThemePackFromShareString(state: ThemeState, value: string, targetVariant: ThemeVariant): ThemeState {
  const payload = parseThemeShareString(value)
  if (payload.variant !== targetVariant) throw new Error(`该主题属于${payload.variant === 'light' ? '浅色' : '深色'}变体。`)
  return {
    ...state,
    mode: 'special',
    style: 'custom',
    packs: { ...state.packs, [targetVariant]: payload.pack },
  }
}

export function serializeThemeState(state: ThemeState): string {
  return JSON.stringify(state)
}

export function parseStoredThemeState(rawValue: string | null | undefined): ThemeState {
  if (!rawValue) return DEFAULT_THEME_STATE
  try {
    return normalizeThemeState(JSON.parse(rawValue))
  } catch {
    return DEFAULT_THEME_STATE
  }
}

export const DEFAULT_INTERFACE_VARIANT_FOR_THEME = DEFAULT_INTERFACE_VARIANT
export const DEFAULT_THEME_MODE_FOR_THEME = DEFAULT_MODE
export const LEGACY_THEME_STYLE_IDS = LEGACY_STYLES
