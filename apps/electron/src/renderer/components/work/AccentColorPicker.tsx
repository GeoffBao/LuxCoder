/**
 * AccentColorPicker — 项目强调色选择器
 *
 * 用预设色板 Popover 替代裸 `<input type="color">`：点击色块直接触发系统原生取色弹窗，
 * 在不同操作系统下样式参差、和应用整体视觉脱节。这里用一组饱满预设色 + 自定义色兜底。
 */

import * as React from 'react'
import { Check, Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const PRESET_COLORS = [
  '#6366f1', // indigo（默认）
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#10b981', // emerald
  '#84cc16', // lime
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#f43f5e', // rose
  '#ec4899', // pink
  '#8b5cf6', // violet
] as const

/** 供其他组件（如看板列编辑弹层）复用同一套预设色板 */
export { PRESET_COLORS }

const DEFAULT_COLOR = PRESET_COLORS[0]

export interface AccentColorPickerProps {
  value: string
  onChange: (color: string) => void
  className?: string
}

export function AccentColorPicker({ value, onChange, className }: AccentColorPickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const customInputRef = React.useRef<HTMLInputElement>(null)
  const color = value || DEFAULT_COLOR

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="选择强调色"
          className={cn(
            'h-9 w-9 shrink-0 rounded-full border border-border/40 shadow-sm ring-2 ring-background transition-transform hover:scale-105 active:scale-95',
            className,
          )}
          style={{ backgroundColor: color }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              onClick={() => {
                onChange(preset)
                setOpen(false)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: preset }}
            >
              {preset.toLowerCase() === color.toLowerCase() && (
                <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
              )}
            </button>
          ))}
          <button
            type="button"
            aria-label="自定义颜色"
            title="自定义颜色"
            onClick={() => customInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border/70 text-muted-foreground transition-transform hover:scale-110 hover:text-foreground active:scale-95"
          >
            <Pipette className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          ref={customInputRef}
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </PopoverContent>
    </Popover>
  )
}
