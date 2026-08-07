/**
 * 主题状态原子。
 *
 * 旧版具名主题仍通过 theme-* class 保留完整视觉；custom 使用 ThemePack 动态投影
 * 全画布与 shadcn CSS token。这样恢复旧效果时不会牺牲 Craft 风格的自定义能力。
 */

import { atom } from 'jotai'
import {
  DEFAULT_INTERFACE_VARIANT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_STYLE,
  DEFAULT_CHROME_THEMES,
  THEME_STYLES,
  type InterfaceVariant,
  type ThemeMode,
  type ThemePack,
  type ThemeState,
  type ThemeStyle,
  type ThemeVariant,
} from '../../types'
import {
  DEFAULT_THEME_STATE,
  buildThemeCssVariables,
  normalizeThemePack,
  normalizeThemeState,
  resolveThemePack,
  canApplyHydratedInterfaceVariant,
  captureInterfaceVariantUpdateEpoch,
  markInterfaceVariantUpdated,
} from '../theme/theme.logic'

const THEME_CACHE_KEY = 'myyoda-theme-mode'
const THEME_STYLE_CACHE_KEY = 'myyoda-theme-style'
const THEME_PACKS_CACHE_KEY = 'myyoda-theme-packs'
const THEME_ACTIVE_VARIANT_CACHE_KEY = 'myyoda-theme-active-variant'
const INTERFACE_VARIANT_CACHE_KEY = 'myyoda-interface-variant'

const DYNAMIC_THEME_VARIABLES = [
  '--background', '--foreground', '--content-area', '--sidebar-surface', '--tabbar-surface', '--tab-surface',
  '--sidebar-control-surface', '--sidebar-control-surface-hover', '--input-surface', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--accent', '--accent-foreground', '--ring', '--muted', '--muted-foreground',
  '--border', '--input', '--card', '--card-foreground', '--popover', '--popover-foreground', '--dialog', '--dialog-foreground',
  '--destructive', '--destructive-foreground', '--stop-hover-bg', '--tooltip', '--tooltip-foreground', '--tooltip-muted',
  '--code-bg', '--tab-indicator', '--theme-font-ui', '--theme-font-code', '--diff-added', '--diff-removed', '--skill',
  '--shell-bg-from', '--shell-bg-to', '--app-sidebar-background', '--app-sidebar-backdrop-filter',
  '--theme-mode', '--background-image', '--theme-background-alpha', '--app-background-overlay', '--app-shell-background', '--app-content-background',
  '--app-paper-background', '--app-navigator-background', '--app-input-background', '--app-popover-background',
  '--app-popover-solid', '--app-content-backdrop-filter',
] as const

function getCachedThemeMode(): ThemeMode {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY)
    if (cached === 'light' || cached === 'dark' || cached === 'system' || cached === 'special') return cached
  } catch {
    // localStorage 不可用时使用默认值。
  }
  return DEFAULT_THEME_MODE
}

function getCachedThemeStyle(): ThemeStyle {
  try {
    const cached = localStorage.getItem(THEME_STYLE_CACHE_KEY)
    if ((THEME_STYLES as readonly string[]).includes(cached ?? '')) return cached as ThemeStyle
  } catch {
    // localStorage 不可用时使用默认值。
  }
  return DEFAULT_THEME_STYLE
}

function getCachedPacks(): Record<ThemeVariant, ThemePack> {
  try {
    const raw = localStorage.getItem(THEME_PACKS_CACHE_KEY)
    if (raw) {
      const state = normalizeThemeState({ packs: JSON.parse(raw) })
      return state.packs
    }
  } catch {
    // localStorage 不可用时使用默认值。
  }
  return {
    light: { codeThemeId: 'myyoda', theme: DEFAULT_CHROME_THEMES.light },
    dark: { codeThemeId: 'myyoda', theme: DEFAULT_CHROME_THEMES.dark },
  }
}

function getCachedThemeActiveVariant(): ThemeVariant {
  try {
    const cached = localStorage.getItem(THEME_ACTIVE_VARIANT_CACHE_KEY)
    if (cached === 'light' || cached === 'dark') return cached
  } catch {
    // localStorage 不可用时使用默认值。
  }
  return 'light'
}

function getCachedInterfaceVariant(): InterfaceVariant {
  try {
    const cached = localStorage.getItem(INTERFACE_VARIANT_CACHE_KEY)
    if (cached === 'classic' || cached === 'modern') return cached
  } catch {
    // localStorage 不可用时使用默认值。
  }
  return DEFAULT_INTERFACE_VARIANT
}

function cacheThemeMode(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_CACHE_KEY, mode) } catch { /* 忽略缓存失败 */ }
}

function cacheThemeStyle(style: ThemeStyle): void {
  try { localStorage.setItem(THEME_STYLE_CACHE_KEY, style) } catch { /* 忽略缓存失败 */ }
}

function cacheThemePacks(packs: Record<ThemeVariant, ThemePack>): void {
  try { localStorage.setItem(THEME_PACKS_CACHE_KEY, JSON.stringify(packs)) } catch { /* 忽略缓存失败 */ }
}

function cacheInterfaceVariant(variant: InterfaceVariant): void {
  try { localStorage.setItem(INTERFACE_VARIANT_CACHE_KEY, variant) } catch { /* 忽略缓存失败 */ }
}

function cacheThemeActiveVariant(variant: ThemeVariant): void {
  try { localStorage.setItem(THEME_ACTIVE_VARIANT_CACHE_KEY, variant) } catch { /* 忽略缓存失败 */ }
}

export const themeModeAtom = atom<ThemeMode>(getCachedThemeMode())
export const themeStyleAtom = atom<ThemeStyle>(getCachedThemeStyle())
export const themePacksAtom = atom<Record<ThemeVariant, ThemePack>>(getCachedPacks())
// style==='custom' 时，用户实际选中/浏览的变体——只由用户点击驱动（设置页的标签、预设卡片
// 自带的 variant），不能用 systemIsDark 代替。否则单变体专属预设（如 Haze 只支持 dark）在
// 系统当前是浅色模式时，会读到从未写入过的另一侧 pack：UI 上选中态打勾，但视觉毫无变化。
export const themeActiveVariantAtom = atom<ThemeVariant>(getCachedThemeActiveVariant())
export const interfaceVariantAtom = atom<InterfaceVariant>(getCachedInterfaceVariant())
export const systemIsDarkAtom = atom<boolean>(true)

export const resolvedThemeAtom = atom<'light' | 'dark'>((get) => {
  const mode = get(themeModeAtom)
  if (mode === 'system') return get(systemIsDarkAtom) ? 'dark' : 'light'
  if (mode === 'special') {
    const style = get(themeStyleAtom)
    if (style === 'custom') return get(themeActiveVariantAtom)
    return style.endsWith('-light') ? 'light' : 'dark'
  }
  return mode
})

const ALL_THEME_STYLE_CLASSES = THEME_STYLES
  .filter((style) => style !== 'default' && style !== 'custom')
  .map((style) => `theme-${style}`)

function clearDynamicThemeVariables(): void {
  for (const name of DYNAMIC_THEME_VARIABLES) document.documentElement.style.removeProperty(name)
  document.documentElement.classList.remove('translucent-windows', 'theme-scenic')
}

function applyThemePack(variant: ThemeVariant, pack: ThemePack): void {
  const build = buildThemeCssVariables(pack, variant, {
    electron: Boolean(window.electronAPI),
    isMac: navigator.userAgent.includes('Mac'),
  })
  const root = document.documentElement
  for (const [name, value] of Object.entries(build.variables)) {
    if ((name === '--theme-font-ui' || name === '--theme-font-code') && value.length === 0) {
      root.style.removeProperty(name)
    } else {
      root.style.setProperty(name, value)
    }
  }
  root.classList.toggle('translucent-windows', build.material === 'translucent')
  root.classList.toggle('theme-scenic', build.variables['--theme-mode'] === 'scenic')
}

export function applyThemeToDOM(
  themeMode: ThemeMode,
  themeStyle: ThemeStyle = DEFAULT_THEME_STYLE,
  themePacks: Record<ThemeVariant, ThemePack> = DEFAULT_THEME_STATE.packs,
  systemIsDark = true,
  // style==='custom' 时优先用这个（用户实际选中/浏览的变体），不传时才退回 systemIsDark——
  // 仅用于兼容尚未接入 themeActiveVariantAtom 的极早期启动路径。
  activeVariant?: ThemeVariant,
): void {
  const html = document.documentElement
  const targetVariant: ThemeVariant =
    themeMode === 'special' && themeStyle !== 'custom'
      ? (themeStyle.endsWith('-light') ? 'light' : 'dark')
      : themeMode === 'special' && themeStyle === 'custom'
        ? (activeVariant ?? (systemIsDark ? 'dark' : 'light'))
        : themeMode === 'dark' || (themeMode === 'system' && systemIsDark)
          ? 'dark'
          : 'light'
  const targetIsDark = targetVariant === 'dark'
  const targetStyleClass = themeMode === 'special' && themeStyle !== 'default' && themeStyle !== 'custom'
    ? `theme-${themeStyle}`
    : null
  const currentStyleClass = ALL_THEME_STYLE_CLASSES.find((className) => html.classList.contains(className)) ?? null

  const useCustomThemePack = themeStyle === 'custom'
  html.classList.toggle('theme-custom', useCustomThemePack)
  if (currentStyleClass !== targetStyleClass) {
    if (currentStyleClass) html.classList.remove(currentStyleClass)
    if (targetStyleClass) html.classList.add(targetStyleClass)
  }
  if (html.classList.contains('dark') !== targetIsDark) html.classList.toggle('dark', targetIsDark)

  if (useCustomThemePack) {
    applyThemePack(targetVariant, resolveThemePack({ mode: themeMode, style: themeStyle, packs: themePacks }, targetVariant))
  } else {
    clearDynamicThemeVariables()
  }
}

export function applyInterfaceVariantToDOM(variant: InterfaceVariant = DEFAULT_INTERFACE_VARIANT): void {
  const html = document.documentElement
  const targetClass = variant === 'classic' ? 'ui-classic' : 'ui-modern'
  const currentClass = html.classList.contains('ui-classic') ? 'ui-classic' : html.classList.contains('ui-modern') ? 'ui-modern' : null
  if (currentClass === targetClass) return
  if (currentClass) html.classList.remove(currentClass)
  html.classList.add(targetClass)
}

export async function initializeTheme(
  setThemeMode: (mode: ThemeMode) => void,
  setSystemIsDark: (isDark: boolean) => void,
  setThemeStyle?: (style: ThemeStyle) => void,
  setInterfaceVariant?: (variant: InterfaceVariant) => void,
  setThemePacks?: (packs: Record<ThemeVariant, ThemePack>) => void,
  setThemeActiveVariant?: (variant: ThemeVariant) => void,
): Promise<() => void> {
  const interfaceVariantEpoch = captureInterfaceVariantUpdateEpoch()
  const settings = await window.electronAPI.getSettings()
  const packs = normalizeThemeState({ packs: settings.themePacks }).packs
  setThemeMode(settings.themeMode)
  setThemeStyle?.(settings.themeStyle ?? DEFAULT_THEME_STYLE)
  setThemePacks?.(packs)
  cacheThemeMode(settings.themeMode)
  cacheThemeStyle(settings.themeStyle ?? DEFAULT_THEME_STYLE)
  cacheThemePacks(packs)

  if (canApplyHydratedInterfaceVariant(interfaceVariantEpoch)) {
    const interfaceVariant = settings.interfaceVariant ?? DEFAULT_INTERFACE_VARIANT
    setInterfaceVariant?.(interfaceVariant)
    cacheInterfaceVariant(interfaceVariant)
    // 主题设置从主进程异步返回时，React atom 可能与首屏缓存相同，导致依赖 interfaceVariant 的 effect 不重跑；
    // 这里直接校正 DOM，避免持久化为 classic 却继续保留上一轮 ui-modern 的工作台布局。
    applyInterfaceVariantToDOM(interfaceVariant)
  }

  const isDark = await window.electronAPI.getSystemTheme()
  setSystemIsDark(isDark)
  // themeActiveVariant 只有在从未持久化过时才用当前系统深浅色兜底，一旦用户点过任何预设/
  // 标签，就必须原样沿用持久化值，不能每次启动都被系统外观重新决定。
  const activeVariant: ThemeVariant = settings.themeStyle && settings.themeStyle !== 'default' && settings.themeStyle !== 'custom'
    ? (settings.themeStyle.endsWith('-dark') ? 'dark' : 'light')
    : settings.themeActiveVariant === 'light' || settings.themeActiveVariant === 'dark'
      ? settings.themeActiveVariant
      : (isDark ? 'dark' : 'light')
  setThemeActiveVariant?.(activeVariant)
  cacheThemeActiveVariant(activeVariant)

  const cleanupSystem = window.electronAPI.onSystemThemeChanged(setSystemIsDark)
  const cleanupThemeSettings = window.electronAPI.onThemeSettingsChanged((payload) => {
    const mode = payload.themeMode === 'light' || payload.themeMode === 'dark' || payload.themeMode === 'special' ? payload.themeMode : 'system'
    const style = payload.themeStyle && (THEME_STYLES as readonly string[]).includes(payload.themeStyle) ? payload.themeStyle as ThemeStyle : DEFAULT_THEME_STYLE
    const nextPacks = normalizeThemeState({ packs: payload.themePacks }).packs
    setThemeMode(mode)
    setThemeStyle?.(style)
    setThemePacks?.(nextPacks)
    cacheThemeMode(mode)
    cacheThemeStyle(style)
    cacheThemePacks(nextPacks)
    const nextActiveVariant: ThemeVariant = style !== 'default' && style !== 'custom'
      ? (style.endsWith('-dark') ? 'dark' : 'light')
      : payload.themeActiveVariant === 'light' || payload.themeActiveVariant === 'dark'
        ? payload.themeActiveVariant
        : getCachedThemeActiveVariant()
    setThemeActiveVariant?.(nextActiveVariant)
    cacheThemeActiveVariant(nextActiveVariant)
    if (payload.interfaceVariant === 'classic' || payload.interfaceVariant === 'modern') {
      setInterfaceVariant?.(payload.interfaceVariant)
      cacheInterfaceVariant(payload.interfaceVariant)
    }
  })
  return () => { cleanupSystem(); cleanupThemeSettings() }
}

export async function updateThemeMode(mode: ThemeMode): Promise<void> {
  cacheThemeMode(mode)
  await window.electronAPI.updateSettings({ themeMode: mode })
}

export async function updateThemeStyle(style: ThemeStyle): Promise<void> {
  cacheThemeStyle(style)
  await window.electronAPI.updateSettings({ themeStyle: style })
}

export async function updateThemeActiveVariant(variant: ThemeVariant): Promise<void> {
  cacheThemeActiveVariant(variant)
  await window.electronAPI.updateSettings({ themeActiveVariant: variant })
}

export async function updateThemePack(variant: ThemeVariant, patch: Partial<ThemePack>): Promise<void> {
  const current = getCachedPacks()
  const next: Record<ThemeVariant, ThemePack> = {
    ...current,
    [variant]: normalizeThemePack({ ...current[variant], ...patch, theme: { ...current[variant].theme, ...(patch.theme ?? {}) } }, variant),
  }
  cacheThemePacks(next)
  await window.electronAPI.updateSettings({ themePacks: next })
}

export async function updateInterfaceVariant(variant: InterfaceVariant): Promise<void> {
  markInterfaceVariantUpdated()
  cacheInterfaceVariant(variant)
  await window.electronAPI.updateSettings({ interfaceVariant: variant })
}

/**
 * 原子化保存一次完整主题选择，避免连续 IPC 更新互相覆盖旧的 interfaceVariant。
 * 目前用于选择固定现代工作台的 Craft 预设。
 */
export async function updateThemeSelection(selection: {
  themeMode: ThemeMode
  themeStyle: ThemeStyle
  themeActiveVariant: ThemeVariant
  themePacks: Record<ThemeVariant, ThemePack>
  interfaceVariant?: InterfaceVariant
}): Promise<void> {
  if (selection.interfaceVariant) markInterfaceVariantUpdated()
  cacheThemeMode(selection.themeMode)
  cacheThemeStyle(selection.themeStyle)
  cacheThemeActiveVariant(selection.themeActiveVariant)
  cacheThemePacks(selection.themePacks)
  if (selection.interfaceVariant) cacheInterfaceVariant(selection.interfaceVariant)
  await window.electronAPI.updateSettings({
    themeMode: selection.themeMode,
    themeStyle: selection.themeStyle,
    themeActiveVariant: selection.themeActiveVariant,
    themePacks: selection.themePacks,
    ...(selection.interfaceVariant ? { interfaceVariant: selection.interfaceVariant } : {}),
  })
}

export function getCachedThemeState(): ThemeState {
  return normalizeThemeState({ mode: getCachedThemeMode(), style: getCachedThemeStyle(), packs: getCachedPacks() })
}
