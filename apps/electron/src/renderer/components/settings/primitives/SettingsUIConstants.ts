/**
 * SettingsUIConstants - 设置界面统一样式 token
 *
 * 集中管理设置组件中使用的 Tailwind class，
 * 确保所有设置页面保持一致的视觉语言。
 */

/** 标签样式 */
export const LABEL_CLASS = 'text-sm text-foreground/90'

/** 描述文字样式 */
export const DESCRIPTION_CLASS = 'text-[13px] text-foreground/45'

/** 区块标题样式：层级靠字号，不靠加粗 */
export const SECTION_TITLE_CLASS = 'text-base font-medium text-foreground/90'

/** 区块描述样式 */
export const SECTION_DESCRIPTION_CLASS = 'text-[13px] text-foreground/45 mt-1'

/** 卡片容器样式：安静分组（极浅墨水填充 + hairline，见 globals.css .settings-card） */
export const CARD_CLASS = 'rounded-xl overflow-hidden settings-card'

/** 卡片内行样式 */
export const ROW_CLASS = 'flex items-center justify-between px-4 py-3'

/** 卡片内分隔线样式：hairline */
export const DIVIDER_CLASS = 'border-foreground/[0.06]'
