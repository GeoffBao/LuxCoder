/**
 * AppearanceSettings - 外观设置页。
 *
 * "主题模式"只有浅色/深色/跟随系统三个标签；浅色、深色标签下面各自挂着「MyYoda 精选」
 * （旧版具名主题）+「更多预设」（迁移自 Craft 的预设）两组卡片，只显示当前标签对应的那个
 * 变体。MyYoda 精选旁提供 classic/modern 选择，Craft 更多预设固定使用现代工作台。
 * 均为完整预设、一键切换，不提供逐字段手动编辑。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Check } from 'lucide-react'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSegmentedControl,
} from './primitives'
import {
  themeModeAtom,
  themeStyleAtom,
  themePacksAtom,
  themeActiveVariantAtom,
  interfaceVariantAtom,
  systemIsDarkAtom,
  updateInterfaceVariant,
  updateThemeSelection,
  applyThemeToDOM,
  applyInterfaceVariantToDOM,
} from '@/atoms/theme'
import { markdownFontSizeAtom, updateMarkdownFontSize } from '@/atoms/markdown-font-size'
import { previewModePreferenceAtom, type PreviewModePreference } from '@/atoms/preview-atoms'
import { cn } from '@/lib/utils'
import type { InterfaceVariant, MarkdownFontSize, ThemeMode, ThemePack, ThemeStyle, ThemeVariant } from '../../../types'
import { CRAFT_THEME_PRESETS, getCraftThemePack, type CraftThemePreset } from '@/theme/theme.logic'

import themeCloudDancer from '@/assets/theme-previews/theme-cloud-dancer.webp'
import themeOceanLight from '@/assets/theme-previews/theme-ocean-light.webp'
import themeForestMorning from '@/assets/theme-previews/theme-forest-morning.webp'
import themeOceanDark from '@/assets/theme-previews/theme-ocean-dark.webp'
import themeForestNight from '@/assets/theme-previews/theme-forest-night.webp'
import themeMorandiNight from '@/assets/theme-previews/theme-morandi-night.webp'
import themeTerminalDark from '@/assets/theme-previews/theme-terminal-dark.png'

const THEME_MODE_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const INTERFACE_VARIANT_OPTIONS: { value: InterfaceVariant; label: string }[] = [
  { value: 'classic', label: '经典' },
  { value: 'modern', label: '现代' },
]

const MARKDOWN_FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

const PREVIEW_MODE_OPTIONS: { value: PreviewModePreference; label: string }[] = [
  { value: 'tab', label: '标签页' },
  { value: 'split', label: '侧边分屏' },
]

const SPECIAL_STYLES: readonly SpecialStyle[] = [
  { id: 'slate-light', name: '云朵舞者', variant: 'light', image: themeCloudDancer, imageScale: 1.3 },
  { id: 'ocean-light', name: '晴空碧海', variant: 'light', image: themeOceanLight },
  { id: 'forest-light', name: '森息晨光', variant: 'light', image: themeForestMorning, imageScale: 1.45 },
  { id: 'ocean-dark', name: '远山暮霭', variant: 'dark', image: themeOceanDark },
  { id: 'forest-dark', name: '森息夜语', variant: 'dark', image: themeForestNight },
  { id: 'slate-dark', name: '莫兰迪夜', variant: 'dark', image: themeMorandiNight, imageScale: 1.15, objectPosition: '44% 58%' },
  { id: 'terminal-dark', name: '旧屏微光', variant: 'dark', image: themeTerminalDark, tooltip: '该主题包含轻微终端闪烁动画' },
]

interface SpecialStyle {
  id: Exclude<ThemeStyle, 'default' | 'custom'>
  name: string
  variant: ThemeVariant
  image: string
  objectPosition?: string
  imageScale?: number
  tooltip?: string
}

const isMac = navigator.userAgent.includes('Mac')
const ZOOM_HINT = isMac ? '使用 ⌘+ 放大、⌘- 缩小、⌘0 恢复默认大小' : '使用 Ctrl++ 放大、Ctrl+- 缩小、Ctrl+0 恢复默认大小'

export function AppearanceSettings(): React.ReactElement {
  const [themeMode, setThemeMode] = useAtom(themeModeAtom)
  const [themeStyle, setThemeStyle] = useAtom(themeStyleAtom)
  const [themePacks, setThemePacks] = useAtom(themePacksAtom)
  const [interfaceVariant, setInterfaceVariant] = useAtom(interfaceVariantAtom)
  const systemIsDark = useAtomValue(systemIsDarkAtom)
  const [markdownFontSize, setMarkdownFontSize] = useAtom(markdownFontSizeAtom)
  const [previewModePref, setPreviewModePref] = useAtom(previewModePreferenceAtom)
  const isCustomActive = themeMode === 'special' && themeStyle === 'custom'
  // "主题模式"标签不再单列"主题风格"选项：选中某个预设时 themeMode 内部仍是 'special'
  // （legacy 主题的 CSS class 应用逻辑依赖这个值），标签显示哪个变体则由 themeActiveVariantAtom
  // 直接控制——这个 atom 同时也是 applyThemeToDOM 实际渲染哪个 ThemePack 的依据（见
  // atoms/theme.ts），不能用 systemIsDark 代替：否则单变体专属预设（如 Haze 只支持 dark）
  // 在系统是浅色模式时会读到从未写入过的浅色 pack——UI 上选中态打勾，但视觉毫无变化。
  const [activeVariant, setActiveVariant] = useAtom(themeActiveVariantAtom)
  const displayMode: ThemeMode = themeMode === 'system' ? 'system' : activeVariant

  const handleThemeModeChange = React.useCallback((value: string) => {
    const mode = value as ThemeMode
    if (mode === 'light' || mode === 'dark') {
      setActiveVariant(mode)
    }
    // 点浅色/深色/跟随系统始终强制拉回纯默认外观（themeStyle='default'），和下面预设网格
    // 里的选择彻底解耦——标签只表示"想看哪个变体"，不表示"要不要用预设"。
    setThemeMode(mode)
    setThemeStyle('default')
    void updateThemeSelection({
      themeMode: mode,
      themeStyle: 'default',
      themeActiveVariant: mode === 'light' || mode === 'dark' ? mode : activeVariant,
      themePacks,
    })
    applyThemeToDOM(mode, 'default', themePacks, systemIsDark, activeVariant)
  }, [activeVariant, setActiveVariant, setThemeMode, setThemeStyle, themePacks, systemIsDark])

  const handleStyleSelect = React.useCallback((style: ThemeStyle, variant: ThemeVariant) => {
    setActiveVariant(variant)
    setThemeMode('special')
    setThemeStyle(style)
    void updateThemeSelection({
      themeMode: 'special',
      themeStyle: style,
      themeActiveVariant: variant,
      themePacks,
    })
    applyThemeToDOM('special', style, themePacks, systemIsDark, variant)
  }, [setActiveVariant, setThemeMode, setThemeStyle, themePacks, systemIsDark])

  const handlePresetSelect = React.useCallback((presetId: string) => {
    const preset = CRAFT_THEME_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const nextPacks: Record<ThemeVariant, ThemePack> = { ...themePacks }
    for (const variant of preset.supportedModes) {
      const pack = getCraftThemePack(presetId, variant)
      if (pack) nextPacks[variant] = pack
    }
    // 预设网格已经按 displayMode 过滤，能点到的卡片必然属于当前正在浏览的变体；
    // 单变体预设（如 Haze）借此直接锁定 activeVariant，不用等 resolveColors 猜。
    const nextVariant = preset.supportedModes.includes(activeVariant) ? activeVariant : (preset.supportedModes[0] ?? activeVariant)
    setActiveVariant(nextVariant)
    setThemePacks(nextPacks)
    setThemeMode('special')
    setThemeStyle('custom')
    const nextInterfaceVariant: InterfaceVariant = preset.interfacePolicy === 'modern' ? 'modern' : interfaceVariant
    setInterfaceVariant(nextInterfaceVariant)
    void updateThemeSelection({
      themeMode: 'special',
      themeStyle: 'custom',
      themeActiveVariant: nextVariant,
      themePacks: nextPacks,
      interfaceVariant: nextInterfaceVariant,
    })
    applyThemeToDOM('special', 'custom', nextPacks, systemIsDark, nextVariant)
    applyInterfaceVariantToDOM(nextInterfaceVariant)
  }, [activeVariant, interfaceVariant, setActiveVariant, setInterfaceVariant, setThemeMode, setThemePacks, setThemeStyle, systemIsDark, themePacks])

  const isPresetSelected = React.useCallback((presetId: string) => {
    if (!isCustomActive || displayMode === 'system') return false
    const presetPack = getCraftThemePack(presetId, displayMode)
    if (!presetPack) return false
    const activeTheme = themePacks[displayMode].theme
    return activeTheme.accent === presetPack.theme.accent && activeTheme.canvas.background === presetPack.theme.canvas.background
  }, [displayMode, isCustomActive, themePacks])

  const legacyStylesForDisplay = displayMode === 'system' ? [] : SPECIAL_STYLES.filter((style) => style.variant === displayMode)
  const handleInterfaceVariantChange = React.useCallback((value: string) => {
    const next = value as InterfaceVariant
    setInterfaceVariant(next)
    void updateInterfaceVariant(next)
    applyInterfaceVariantToDOM(next)
  }, [setInterfaceVariant])
  const presetsForDisplay = displayMode === 'system' ? [] : CRAFT_THEME_PRESETS.filter((preset) => preset.supportedModes.includes(displayMode))
  const isCraftPresetActive = isCustomActive && presetsForDisplay.some((preset) => isPresetSelected(preset.id))

  return (
    <div className="space-y-6">
      <SettingsSection title="外观设置" description="个性化界面外观、主题风格与显示设置。">
        <SettingsCard>
          <SettingsSegmentedControl label="主题模式" description="选择浅色、深色，或跟随系统；每个变体下面都可以直接挑一套主题风格" value={displayMode} onValueChange={handleThemeModeChange} options={THEME_MODE_OPTIONS} />

          {displayMode !== 'system' ? (
            <div className="border-t border-border px-4 py-3 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">MyYoda 精选</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">经典布局与现代工作台均可使用</div>
                  </div>
                  <div className="shrink-0">
                    <div className="mb-1 text-right text-[10px] font-medium text-muted-foreground">界面风格</div>
                    <InlineSegmentedControl
                      value={interfaceVariant}
                      onValueChange={handleInterfaceVariantChange}
                      options={INTERFACE_VARIANT_OPTIONS}
                      disabled={isCraftPresetActive}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                  {legacyStylesForDisplay.map((style) => (
                    <StyleCard key={style.id} style={style} isSelected={themeMode === 'special' && themeStyle === style.id} onSelect={() => handleStyleSelect(style.id, style.variant)} />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">更多预设</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">Craft 风格预设统一使用现代工作台</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">现代工作台</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {presetsForDisplay.map((preset) => (
                    <PresetCard key={preset.id} preset={preset} pack={getCraftThemePack(preset.id, displayMode)} isSelected={isPresetSelected(preset.id)} onSelect={() => handlePresetSelect(preset.id)} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <SettingsRow label="界面缩放" description={ZOOM_HINT} />
          <SettingsSegmentedControl label="Markdown 字号" description="调整 AI 回复与 Markdown 编辑器的正文字号" value={markdownFontSize} onValueChange={(value) => { const next = value as MarkdownFontSize; setMarkdownFontSize(next); void updateMarkdownFontSize(next) }} options={MARKDOWN_FONT_SIZE_OPTIONS} />
          <SettingsSegmentedControl label="Agent 预览展开方式" description="点击文件、工具结果「预览」按钮时的默认展开位置" value={previewModePref} onValueChange={(value) => setPreviewModePref(value as PreviewModePreference)} options={PREVIEW_MODE_OPTIONS} />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}

function StyleCard({ style, isSelected, onSelect }: { style: SpecialStyle; isSelected: boolean; onSelect: () => void }): React.ReactElement {
  return (
    <button type="button" onClick={onSelect} title={style.tooltip} className="group flex flex-col items-center gap-2 focus-visible:outline-none">
      <div className={cn('relative h-[183px] w-[99px] overflow-hidden rounded-lg transition-[border-color,box-shadow,opacity] duration-fast', isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : 'ring-1 ring-border/50 group-hover:ring-border group-focus-visible:ring-2 group-focus-visible:ring-primary')}>
        <div className="h-full w-full" style={style.imageScale ? { transform: `scale(${style.imageScale})` } : undefined}>
          <img src={style.image} alt={style.name} loading="lazy" decoding="async" className="h-full w-full object-cover" style={style.objectPosition ? { objectPosition: style.objectPosition } : undefined} draggable={false} />
        </div>
        {isSelected ? <div className="absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-full bg-primary"><Check className="size-2.5 text-primary-foreground" /></div> : null}
      </div>
      <span className={cn('text-xs font-medium transition-colors', isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{style.name}</span>
    </button>
  )
}

function InlineSegmentedControl({
  value,
  onValueChange,
  options,
  disabled = false,
}: {
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  disabled?: boolean
}): React.ReactElement {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onValueChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PresetCard({ preset, pack, isSelected, onSelect }: { preset: CraftThemePreset; pack: ThemePack | null; isSelected: boolean; onSelect: () => void }): React.ReactElement {
  return (
    <button type="button" title={preset.description} onClick={onSelect} className={cn('flex items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors', isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50')}>
      <span
        className="size-6 shrink-0 rounded-full border border-border/60"
        style={pack ? { background: `linear-gradient(135deg, ${pack.theme.canvas.background} 50%, ${pack.theme.accent} 50%)` } : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs font-medium', isSelected ? 'text-foreground' : 'text-muted-foreground')}>{preset.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground/70">{preset.mode === 'scenic' ? 'Scenic' : 'Solid'}</span>
      </span>
      {isSelected ? <Check className="size-3 shrink-0 text-primary" /> : null}
    </button>
  )
}
