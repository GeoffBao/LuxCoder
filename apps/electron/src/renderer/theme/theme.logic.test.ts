import { describe, expect, test } from 'bun:test'
import type { ThemePack } from '../../types'
import {
  DEFAULT_THEME_STATE,
  buildThemeCssVariables,
  canApplyHydratedInterfaceVariant,
  captureInterfaceVariantUpdateEpoch,
  createThemeShareString,
  getLegacyThemePack,
  normalizeThemeState,
  markInterfaceVariantUpdated,
  parseThemeShareString,
  updateThemePackFromShareString,
  CRAFT_THEME_PRESETS,
  getCraftThemePack,
} from './theme.logic'

describe('界面风格初始化竞态', () => {
  test('用户切换后，旧的异步设置不能再覆盖界面风格', () => {
    const epoch = captureInterfaceVariantUpdateEpoch()
    expect(canApplyHydratedInterfaceVariant(epoch)).toBe(true)

    markInterfaceVariantUpdated()

    expect(canApplyHydratedInterfaceVariant(epoch)).toBe(false)
    expect(canApplyHydratedInterfaceVariant(captureInterfaceVariantUpdateEpoch())).toBe(true)
  })
})

const customPack = {
  codeThemeId: 'myyoda',
  theme: {
    ...DEFAULT_THEME_STATE.packs.light.theme,
    accent: '#408abf',
    ink: '#1b2632',
    surface: '#ecf2f7',
    canvas: { background: '#f4f7fa', shellFrom: '#dceaf4', shellTo: '#eaf2f8' },
  },
}

describe('ThemePack 归一化', () => {
  test('缺省状态回退到可用的浅色/深色主题包', () => {
    const state = normalizeThemeState(undefined)
    expect(state.mode).toBe('system')
    expect(state.packs.light.theme.canvas.background).toBe('#ffffff')
    expect(state.packs.dark.theme.canvas.background).toBe('#1a1612')
  })

  test('非法值不会破坏旧主题状态', () => {
    const state = normalizeThemeState({ mode: 'invalid', style: 'invalid', packs: { light: { theme: { accent: 'red' } } } })
    expect(state.mode).toBe('system')
    expect(state.style).toBe('default')
    expect(state.packs.light.theme.accent).toBe('#0a0a0a')
  })

  test('兼容上一轮未发布的 chromeThemes 持久化形状', () => {
    const state = normalizeThemeState({ chromeThemes: { dark: { accent: '#ff0000', surface: '#101010', ink: '#ffffff' } } })
    expect(state.packs.dark.theme.accent).toBe('#ff0000')
    expect(state.packs.dark.theme.canvas.background).toBe('#1a1612')
  })

  test('旧具名主题仍保留完整的画布个性', () => {
    const ocean = getLegacyThemePack('ocean-dark', 'dark')
    const terminal = getLegacyThemePack('terminal-dark', 'dark')
    expect(ocean.theme.canvas.background).toBe('#14191f')
    expect(terminal.theme.fonts.code).toBe('JetBrains Mono')
    expect(terminal.codeThemeId).toBe('matrix')
  })
})

describe('Craft 主题预设', () => {
  test('移植全部 Craft preset，Haze 作为 Scenic 深色主题可用，背景图打包在本地不依赖远程 URL', () => {
    expect(CRAFT_THEME_PRESETS).toHaveLength(15)
    const haze = getCraftThemePack('haze', 'dark')
    expect(haze?.theme.canvas.mode).toBe('scenic')
    expect(haze?.theme.canvas.backgroundImage).not.toBeNull()
    expect(haze?.theme.canvas.backgroundImage).not.toContain('pexels.com')
    expect(haze?.theme.surfaces?.popoverSolid).toBe('#4a3c34')
  })

  test('更多预设统一使用现代工作台策略', () => {
    expect(CRAFT_THEME_PRESETS.every((preset) => preset.interfacePolicy === 'modern')).toBe(true)
  })

  test('Haze 使用暖色调专属玻璃表面（区别于通用 Scenic 冷黑值）', () => {
    const haze = getCraftThemePack('haze', 'dark')
    const state = normalizeThemeState({ packs: { dark: haze } })
    expect(state.packs.dark.theme.surfaces?.paper).toBe('rgba(58, 48, 42, 0.50)')
    expect(state.packs.dark.theme.surfaces?.navigator).toBe('rgba(62, 52, 46, 0.44)')
    expect(state.packs.dark.theme.canvas.backgroundOverlayColor).toBe('rgba(18, 10, 6, 0.20)')
  })

  test('双模式预设的浅色/深色画布颜色彼此独立，不共用同一组数值', () => {
    const dualModePresetIds = CRAFT_THEME_PRESETS.filter((preset) => preset.supportedModes.length === 2).map((preset) => preset.id)
    expect(dualModePresetIds).toHaveLength(10)
    for (const id of dualModePresetIds) {
      const light = getCraftThemePack(id, 'light')
      const dark = getCraftThemePack(id, 'dark')
      expect(light?.theme.canvas.background).not.toBe(dark?.theme.canvas.background)
      expect(light?.theme.ink).not.toBe(dark?.theme.ink)
    }
  })
})

describe('ThemePack CSS projection', () => {
  test('把自定义背景、主题色和画布渐变投影为既有 CSS token', () => {
    const result = buildThemeCssVariables(customPack, 'light')
    expect(result.variables['--background']).toBe('210 37% 97%')
    expect(result.variables['--primary']).toBe('205 50% 50%')
    expect(result.variables['--shell-bg-from']).toBe('205 52% 91%')
    expect(result.variables['--shell-bg-to']).toBe('206 50% 95%')
  })

  test('Scenic 主题把画布、内容面板和弹窗表面分开投影', () => {
    const scenicPack = {
      ...customPack,
      theme: {
        ...customPack.theme,
        opaqueWindows: false,
        canvas: { ...customPack.theme.canvas, mode: 'scenic', backgroundImage: 'https://example.com/haze.jpg', backgroundAlpha: 0.4 },
        surfaces: {
          paper: 'rgba(20, 20, 24, 0.62)',
          navigator: 'rgba(12, 12, 16, 0.72)',
          input: 'rgba(0, 0, 0, 0.15)',
          popover: 'rgba(24, 24, 30, 0.78)',
          popoverSolid: '#2a2a2e',
        },
      },
    }
    const result = buildThemeCssVariables(scenicPack as ThemePack, 'dark', { electron: true, isMac: true })
    expect(result.material).toBe('translucent')
    expect(result.variables['--theme-mode']).toBe('scenic')
    expect(result.variables['--background-image']).toContain('haze.jpg')
    expect(result.variables['--app-content-background']).toBe('rgba(20, 20, 24, 0.62)')
    expect(result.variables['--app-popover-solid']).toBe('#2a2a2e')
  })

  test('自定义主题的 macOS 半透明材质可以启用，其他平台强制不透明', () => {
    const translucentPack = { ...customPack, theme: { ...customPack.theme, opaqueWindows: false } }
    expect(buildThemeCssVariables(translucentPack, 'light', { electron: true, isMac: true }).material).toBe('translucent')
    expect(buildThemeCssVariables(translucentPack, 'light', { electron: true, isMac: false }).material).toBe('opaque')
  })
})

describe('主题分享字符串', () => {
  test('可以 round-trip 自定义主题包', () => {
    const value = createThemeShareString('light', 'custom', customPack)
    const parsed = parseThemeShareString(value)
    expect(parsed.variant).toBe('light')
    expect(parsed.pack.theme.canvas.background).toBe('#f4f7fa')
  })

  test('导入后切换到 custom 且只替换目标变体', () => {
    const value = createThemeShareString('light', 'custom', customPack)
    const next = updateThemePackFromShareString(DEFAULT_THEME_STATE, value, 'light')
    expect(next.mode).toBe('special')
    expect(next.style).toBe('custom')
    expect(next.packs.light.theme.accent).toBe('#408abf')
    expect(next.packs.dark.theme.accent).toBe(DEFAULT_THEME_STATE.packs.dark.theme.accent)
  })

  test('拒绝错误的变体', () => {
    const value = createThemeShareString('dark', 'custom', customPack)
    expect(() => updateThemePackFromShareString(DEFAULT_THEME_STATE, value, 'light')).toThrow()
  })
})
