import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import type { AgentThinkingLevel } from '@luxcoder/shared'

/**
 * 可用的思考深度选项（UI 层面保留 5 档，minimal 合并到 low）
 */
export const UI_THINKING_LEVELS: Array<{ value: AgentThinkingLevel; cn: string; en: string }> = [
  { value: 'off', cn: '关闭', en: 'Off' },
  { value: 'low', cn: '低', en: 'Low' },
  { value: 'medium', cn: '中', en: 'Medium' },
  { value: 'high', cn: '高', en: 'High' },
  { value: 'xhigh', cn: '极高', en: 'X-High' },
] as const

const MAX_INDEX = UI_THINKING_LEVELS.length - 1 // 4

/** 将 AgentThinkingLevel 标准化为 UI 可用的索引 */
export function normalizeToUiIndex(level: AgentThinkingLevel | undefined): number {
  if (level === 'minimal') return 1 // minimal → low
  const idx = UI_THINKING_LEVELS.findIndex((l) => l.value === level)
  return idx >= 0 ? idx : 0 // 默认 off
}

/** 将 UI 索引转回 AgentThinkingLevel */
export function uiIndexToLevel(index: number): AgentThinkingLevel {
  return UI_THINKING_LEVELS[index]?.value ?? 'off'
}

/** 最近的整数（档位）索引 */
function snapToLevel(float: number): number {
  return Math.max(0, Math.min(Math.round(float), MAX_INDEX))
}

/** 浮点值 → 渐变色类名（插值过渡，避免跳变） */
function gradientForFloat(float: number): string {
  // 映射到 0–1 范围
  const t = Math.max(0, Math.min(float / MAX_INDEX, 1))

  if (t <= 0) return 'from-slate-400 to-slate-400'
  if (t <= 0.25) return 'from-blue-400/90 via-blue-500/70 to-indigo-400/60'
  if (t <= 0.5) return 'from-indigo-500/90 via-violet-500/70 to-violet-500/60'
  if (t <= 0.75) return 'from-violet-500/90 via-violet-600/70 to-purple-500/60'
  return 'from-purple-500 via-fuchsia-500 to-fuchsia-500'
}

/**
 * 思考深度滑块 — 连续滑动 + 松手吸附 + 渐变动效。
 *
 * 特性：
 * - 拖动时连续跟手（step=0.001），不跳变
 * - 松手时自动吸附到最近档位（onValueCommit 触发真正回调）
 * - 渐变填充轨道，颜色随深度过渡
 * - 档位圆点逐步亮起
 * - CSS transition 让 thumb / 填充区过渡丝滑
 */
interface ThinkingLevelSliderProps {
  value: number // UI 索引 0-4（已提交的值）
  onValueChange: (index: number) => void
  disabled?: boolean
  locale?: 'cn' | 'en'
  className?: string
}

export function ThinkingLevelSlider({
  value,
  onValueChange,
  disabled = false,
  locale = 'cn',
  className,
}: ThinkingLevelSliderProps): React.ReactElement {
  // 拖动中的连续浮点预览值（未吸附）
  const [preview, setPreview] = React.useState<number | null>(null)

  const displayValue = preview ?? value // 显示用：拖拽中跟随鼠标，否则用已提交值
  const committedIndex = snapToLevel(displayValue)
  const labels = UI_THINKING_LEVELS.map((l) => (locale === 'cn' ? l.cn : l.en))
  const currentLabel = labels[committedIndex] ?? 'Off'

  const handleValueChange = React.useCallback(([v]: number[]) => {
    if (v !== undefined) setPreview(v)
  }, [])

  const handleValueCommit = React.useCallback(
    ([v]: number[]) => {
      setPreview(null)
      if (v === undefined) return
      const snapped = snapToLevel(v)
      if (snapped !== value) {
        onValueChange(snapped)
      }
    },
    [value, onValueChange],
  )

  return (
    <div className={cn('space-y-2', className)}>
      {/* 当前值标签 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">思考深度</span>
        <span className="text-xs tabular-nums text-muted-foreground transition-opacity duration-150">
          {currentLabel}
        </span>
      </div>

      {/* Slider — 连续步进 + 松手吸附 */}
      <SliderPrimitive.Root
        value={[displayValue]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        min={0}
        max={MAX_INDEX}
        step={0.001}
        disabled={disabled}
        className="relative flex w-full touch-none select-none items-center pt-1"
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-primary/10">
          {/* 渐变填充 — 插值颜色，平滑过渡 */}
          <SliderPrimitive.Range
            className={cn(
              'absolute h-full rounded-full bg-gradient-to-r transition-[width] duration-75 ease-out',
              gradientForFloat(displayValue),
            )}
          />
          {/* 档位标注圆点 */}
          <div className="absolute inset-0 flex items-center justify-between px-0.5 pointer-events-none">
            {UI_THINKING_LEVELS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-all duration-150',
                  i <= committedIndex ? 'bg-white/70 scale-100' : 'bg-primary/20 scale-75',
                )}
              />
            ))}
          </div>
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-background bg-foreground shadow-lg transition-transform duration-75 active:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>

      {/* 档位标签 */}
      <div className="flex justify-between px-0.5">
        {UI_THINKING_LEVELS.map((l, i) => (
          <span
            key={l.value}
            className={cn(
              'text-[10px] transition-all duration-150',
              i === committedIndex
                ? 'text-foreground font-medium scale-100'
                : 'text-muted-foreground/60 scale-90',
            )}
          >
            {locale === 'cn' ? l.cn : l.en}
          </span>
        ))}
      </div>
    </div>
  )
}
