import * as React from 'react'

import { cn } from '@/lib/utils'

/** 匀速滚动速度（像素/秒），保证不同长度的标题滚动手感一致 */
const MARQUEE_SPEED_PX_PER_SEC = 45
/** 悬浮移出后回弹到起始位置的时长 */
const MARQUEE_RESET_MS = 150

export interface MarqueeTextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 展示的文本内容 */
  text: string
  /** 内层文字 span 的额外 className */
  textClassName?: string
}

/**
 * 参考 Claude 客户端侧边栏：悬浮时若文字被截断，匀速从右向左滚动展示完整内容；
 * 未溢出或未悬浮时保持普通的省略号截断，不影响原有布局。
 */
export function MarqueeText({ text, className, textClassName, onMouseEnter, onMouseLeave, ...rest }: MarqueeTextProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLSpanElement>(null)
  const textRef = React.useRef<HTMLSpanElement>(null)
  const [hovering, setHovering] = React.useState(false)
  const [overflowPx, setOverflowPx] = React.useState(0)

  const measure = (): void => {
    const container = containerRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    setOverflowPx(Math.max(0, textEl.scrollWidth - container.clientWidth))
  }

  const canScroll = overflowPx > 1
  const isScrolling = hovering && canScroll
  const travelDuration = overflowPx / MARQUEE_SPEED_PX_PER_SEC

  return (
    <span
      ref={containerRef}
      className={cn('inline-block max-w-full overflow-hidden whitespace-nowrap align-bottom', !isScrolling && 'text-ellipsis', className)}
      onMouseEnter={(event) => {
        measure()
        setHovering(true)
        onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        setHovering(false)
        onMouseLeave?.(event)
      }}
      {...rest}
    >
      <span
        ref={textRef}
        className={cn('inline-block', textClassName)}
        style={{
          transform: isScrolling ? `translateX(-${overflowPx}px)` : 'translateX(0)',
          transitionProperty: 'transform',
          transitionTimingFunction: 'linear',
          transitionDuration: isScrolling ? `${travelDuration}s` : `${MARQUEE_RESET_MS}ms`,
        }}
      >
        {text}
      </span>
    </span>
  )
}
