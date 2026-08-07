import type { ThemeCanvas, ThemePack, ThemeSemanticColors, ThemeSurfaces, ThemeVariant } from '../../types'
import themeHazeScenic from '@/assets/theme-previews/theme-haze-scenic.jpg'

export interface CraftThemePreset {
  id: string
  name: string
  description: string
  supportedModes: readonly ThemeVariant[]
  shikiTheme: Partial<Record<ThemeVariant, string>>
  /** Craft 预设统一使用现代工作台，不在卡片内暴露 classic/modern 分叉。 */
  interfacePolicy: 'modern'
  mode?: 'solid' | 'scenic'
  backgroundImage?: string
}

/** Scenic 主题的专属表面/遮罩覆盖；缺省时回退到通用 Scenic 值。 */
interface ScenicOverrides {
  surfaces?: ThemeSurfaces
  backgroundOverlayColor?: string
}

interface CraftThemeColors {
  background: string
  foreground: string
  accent: string
  info: string
  success: string
  destructive: string
  popoverSolid?: string
}

interface CraftPresetEntry extends Omit<CraftThemePreset, 'interfacePolicy'> {
  colors: Partial<Record<ThemeVariant, CraftThemeColors>>
  scenicOverrides?: ScenicOverrides
}

// 每个双模式预设的 light/dark 配色分别取自该主题官方调色板（如 Catppuccin Latte/Mocha、Nord、
// Solarized、GitHub、One Dark/Light、Gruvbox、Rosé Pine Dawn/主色）；两个 MyYoda 原创预设
// （default/pierre）的深色变体按现有浅色配色的思路手工设计协调值。单模式预设（dracula/ghostty/
// night-owl/tokyo-night/haze）只填一份配色，不受此约束。
const PRESETS: readonly CraftPresetEntry[] = [
  {
    id: 'catppuccin', name: 'Catppuccin', description: '柔和的粉彩色主题', supportedModes: ['light', 'dark'], shikiTheme: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
    colors: {
      light: { background: '#eff1f5', foreground: '#4c4f69', accent: '#8839ef', info: '#df8e1d', success: '#40a02b', destructive: '#d20f39' },
      dark: { background: '#1e1e2e', foreground: '#cdd6f4', accent: '#cba6f7', info: '#f9e2af', success: '#a6e3a1', destructive: '#f38ba8' },
    },
  },
  {
    id: 'default', name: '现代简约', description: '干净的紫色中性主题', supportedModes: ['light', 'dark'], shikiTheme: { light: 'github-light', dark: 'github-dark' },
    colors: {
      light: { background: '#faf9fb', foreground: '#1a1625', accent: '#8b5cf6', info: '#d97706', success: '#16a34a', destructive: '#dc2626' },
      dark: { background: '#17151f', foreground: '#ece7f5', accent: '#a78bfa', info: '#fbbf24', success: '#22c55e', destructive: '#f87171' },
    },
  },
  {
    id: 'dracula', name: 'Dracula', description: '深紫色与明亮强调色', supportedModes: ['dark'], shikiTheme: { light: 'github-light', dark: 'dracula' },
    colors: { dark: { background: '#282a36', foreground: '#f8f8f2', accent: '#bd93f9', info: '#ffb86c', success: '#50fa7b', destructive: '#ff5555' } },
  },
  {
    id: 'ghostty', name: 'Ghostty', description: 'Ghostty terminal 的暗色主题', supportedModes: ['dark'], shikiTheme: { light: 'github-light', dark: 'vitesse-dark' },
    colors: { dark: { background: '#292c33', foreground: '#ffffff', accent: '#83a5d6', info: '#e0af68', success: '#b7bd73', destructive: '#c55757' } },
  },
  {
    id: 'github', name: 'GitHub', description: '清晰、专业的开发主题', supportedModes: ['light', 'dark'], shikiTheme: { light: 'github-light', dark: 'github-dark' },
    colors: {
      light: { background: '#ffffff', foreground: '#1f2328', accent: '#0969da', info: '#bf8700', success: '#1a7f37', destructive: '#cf222e' },
      dark: { background: '#0d1117', foreground: '#e6edf3', accent: '#58a6ff', info: '#d29922', success: '#3fb950', destructive: '#f85149' },
    },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', description: '复古、自然的泥土色调', supportedModes: ['light', 'dark'], shikiTheme: { light: 'github-light', dark: 'vitesse-dark' },
    colors: {
      light: { background: '#fbf1c7', foreground: '#3c3836', accent: '#458588', info: '#d79921', success: '#98971a', destructive: '#cc241d' },
      dark: { background: '#282828', foreground: '#ebdbb2', accent: '#83a598', info: '#fabd2f', success: '#b8bb26', destructive: '#fb4934' },
    },
  },
  {
    // Craft-agents-oss 原版 Scenic 玻璃主题：全窗背景图 + 半透明玻璃面板。之前依赖远程 Pexels
    // URL（即使网络可达，打包后的可靠性也无法保证），现在把同一张图打包进本地 assets，
    // 效果不变但不再依赖任何网络请求。
    id: 'haze', name: 'Haze', description: 'Scenic 玻璃主题，保留桌面背景氛围', supportedModes: ['dark'], shikiTheme: { dark: 'github-dark' }, mode: 'scenic', backgroundImage: themeHazeScenic,
    colors: { dark: { background: '#1e1814', foreground: '#f5f2ef', accent: '#f2a668', info: '#fbbf24', success: '#22c55e', destructive: '#ef4444', popoverSolid: '#4a3c34' } },
    // 通用 Scenic 表面偏冷黑，Haze 的夕阳建筑背景需要暖灰褐玻璃才协调。
    // 表面层级从背景到交互核心自然递进：侧栏/顶栏最透、内容区次之、输入框稍实、弹层最实，
    // 背景遮罩尽量轻，保证壁纸在玻璃面板后若隐若现而非被压成纯色。
    scenicOverrides: {
      surfaces: {
        paper: 'rgba(58, 48, 42, 0.50)',
        navigator: 'rgba(62, 52, 46, 0.44)',
        input: 'rgba(58, 48, 42, 0.58)',
        popover: 'rgba(66, 56, 50, 0.84)',
        popoverSolid: '#4a3c34',
      },
      backgroundOverlayColor: 'rgba(18, 10, 6, 0.20)',
    },
  },
  {
    id: 'night-owl', name: 'Night Owl', description: '降低蓝光的夜猫子主题', supportedModes: ['dark'], shikiTheme: { light: 'github-light', dark: 'night-owl' },
    colors: { dark: { background: '#011627', foreground: '#d6deeb', accent: '#82aaff', info: '#ecc48d', success: '#addb67', destructive: '#ef5350' } },
  },
  {
    id: 'nord', name: 'Nord', description: '冷静的北极蓝灰色调', supportedModes: ['light', 'dark'], shikiTheme: { light: 'github-light', dark: 'nord' },
    colors: {
      light: { background: '#eceff4', foreground: '#2e3440', accent: '#5e81ac', info: '#ebcb8b', success: '#a3be8c', destructive: '#bf616a' },
      dark: { background: '#2e3440', foreground: '#d8dee9', accent: '#88c0d0', info: '#ebcb8b', success: '#a3be8c', destructive: '#bf616a' },
    },
  },
  {
    id: 'one-dark-pro', name: 'One Dark Pro', description: 'Atom 风格的平衡对比度', supportedModes: ['light', 'dark'], shikiTheme: { light: 'one-light', dark: 'one-dark-pro' },
    colors: {
      light: { background: '#fafafa', foreground: '#383a42', accent: '#4078f2', info: '#c18401', success: '#50a14f', destructive: '#e45649' },
      dark: { background: '#282c34', foreground: '#abb2bf', accent: '#61afef', info: '#e5c07b', success: '#98c379', destructive: '#e06c75' },
    },
  },
  {
    id: 'pierre', name: 'Pierre', description: '为 Diff 阅读优化的清爽主题', supportedModes: ['light', 'dark'], shikiTheme: { light: 'github-light', dark: 'github-dark' },
    colors: {
      light: { background: '#ffffff', foreground: '#24292f', accent: '#009fff', info: '#fe8c2c', success: '#0dbe4e', destructive: '#fc2b73' },
      dark: { background: '#14171c', foreground: '#e3e6ea', accent: '#33b1ff', info: '#ff9d4d', success: '#2ed573', destructive: '#ff5c8a' },
    },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', description: 'Soho 氛围，温暖而优雅', supportedModes: ['light', 'dark'], shikiTheme: { light: 'rose-pine-dawn', dark: 'rose-pine' },
    colors: {
      light: { background: '#faf4ed', foreground: '#575279', accent: '#907aa9', info: '#ea9d34', success: '#286983', destructive: '#b4637a' },
      dark: { background: '#191724', foreground: '#e0def4', accent: '#c4a7e7', info: '#f6c177', success: '#31748f', destructive: '#eb6f92' },
    },
  },
  {
    id: 'solarized', name: 'Solarized', description: '经过科学设计的精准色彩', supportedModes: ['light', 'dark'], shikiTheme: { light: 'solarized-light', dark: 'solarized-dark' },
    colors: {
      light: { background: '#fdf6e3', foreground: '#657b83', accent: '#268bd2', info: '#b58900', success: '#859900', destructive: '#dc322f' },
      dark: { background: '#002b36', foreground: '#839496', accent: '#268bd2', info: '#b58900', success: '#859900', destructive: '#dc322f' },
    },
  },
  {
    id: 'tokyo-night', name: 'Tokyo Night', description: '东京夜色', supportedModes: ['dark'], shikiTheme: { light: 'github-light', dark: 'tokyo-night' },
    colors: { dark: { background: '#1a1b26', foreground: '#c0caf5', accent: '#7aa2f7', info: '#e0af68', success: '#9ece6a', destructive: '#f7768e' } },
  },
  {
    id: 'vitesse', name: 'Vitesse', description: '极简、干净的开发主题', supportedModes: ['light', 'dark'], shikiTheme: { light: 'vitesse-light', dark: 'vitesse-dark' },
    colors: {
      light: { background: '#ffffff', foreground: '#393a34', accent: '#1e754f', info: '#b58900', success: '#1e754f', destructive: '#ab5959' },
      dark: { background: '#121212', foreground: '#dbd7ca', accent: '#4d9375', info: '#e6cc77', success: '#4d9375', destructive: '#cb7676' },
    },
  },
] as const

export const CRAFT_THEME_PRESETS: readonly CraftThemePreset[] = PRESETS.map(({ id, name, description, supportedModes, shikiTheme, mode, backgroundImage }) => ({
  id,
  name,
  description,
  supportedModes,
  shikiTheme,
  interfacePolicy: 'modern' as const,
  mode,
  backgroundImage,
}))

function resolveColors(preset: CraftPresetEntry, variant: ThemeVariant): CraftThemeColors | null {
  return preset.colors[variant] ?? preset.colors[preset.supportedModes[0] ?? variant] ?? null
}

function semanticColors(colors: CraftThemeColors): ThemeSemanticColors {
  return {
    diffAdded: colors.success,
    diffRemoved: colors.destructive,
    skill: colors.accent,
    info: colors.info,
    success: colors.success,
    destructive: colors.destructive,
  }
}

function buildSurfaces(preset: CraftPresetEntry, colors: CraftThemeColors): ThemeSurfaces {
  if (preset.mode === 'scenic') {
    return {
      // Craft Scenic 使用约 55% alpha 的全局 background；过高的不透明度会让图片只剩弹层可见。
      paper: 'rgba(25, 25, 29, 0.55)',
      navigator: 'rgba(12, 12, 16, 0.55)',
      input: 'rgba(0, 0, 0, 0.15)',
      popover: 'rgba(24, 24, 30, 0.84)',
      popoverSolid: colors.popoverSolid ?? '#2a2a2e',
      ...preset.scenicOverrides?.surfaces,
    }
  }
  return {
    paper: colors.background,
    navigator: colors.background,
    input: colors.background,
    popover: colors.background,
    popoverSolid: colors.popoverSolid ?? colors.background,
  }
}

export function getCraftThemePack(id: string, variant: ThemeVariant): ThemePack | null {
  const preset = PRESETS.find((item) => item.id === id)
  if (!preset || !preset.supportedModes.includes(variant)) return null
  const colors = resolveColors(preset, variant)
  if (!colors) return null
  const dark = variant === 'dark'
  const canvas: ThemeCanvas = {
    background: colors.background,
    shellFrom: dark ? '#0f1014' : '#eef1f5',
    shellTo: dark ? '#20232b' : '#fafbfc',
    mode: preset.mode ?? 'solid',
    backgroundImage: preset.backgroundImage ?? null,
    backgroundAlpha: preset.mode === 'scenic' ? 0.4 : 1,
    backgroundOverlayColor: preset.scenicOverrides?.backgroundOverlayColor,
  }
  return {
    codeThemeId: preset.shikiTheme[variant] ?? (dark ? 'github-dark' : 'github-light'),
    theme: {
      accent: colors.accent,
      contrast: 50,
      fonts: { ui: null, code: null },
      ink: colors.foreground,
      opaqueWindows: preset.mode !== 'scenic',
      semanticColors: semanticColors(colors),
      surface: colors.background,
      surfaces: buildSurfaces(preset, colors),
      canvas,
    },
  }
}
