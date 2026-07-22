/**
 * UserAvatar - 用户头像组件
 *
 * - 支持内置头像与自定义图片
 * - 支持 data:image/* URL（渲染为图片）
 * - 可配置大小
 * - 圆角 20%，柔和边框
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { getBuiltinAvatarSrc } from '@/lib/builtin-avatars'

interface UserAvatarProps {
  /** 头像内容（内置头像 ID 或 data:image/* URL） */
  avatar: string
  /** 尺寸（像素），默认 35 */
  size?: number
  className?: string
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

/** 判断是否为图片 URL（data:image 或 http） */
function isImageUrl(avatar: string): boolean {
  return avatar.startsWith('data:image') || avatar.startsWith('http')
}

export function UserAvatar({
  avatar,
  size = 35,
  className,
  onClick,
}: UserAvatarProps): React.ReactElement {
  const builtinAvatarSrc = getBuiltinAvatarSrc(avatar)
  const imageSrc = builtinAvatarSrc ?? (isImageUrl(avatar) ? avatar : undefined)

  if (imageSrc) {
    return (
      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-[20%] border-[0.5px] border-foreground/10',
          onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
          className
        )}
        style={{ width: size, height: size }}
        onClick={onClick}
      >
        <img
          src={imageSrc}
          alt="用户头像"
          className="size-full object-cover"
        />
      </div>
    )
  }

  // 兼容旧配置中的 emoji 头像。
  const fontSize = Math.round(size * 0.5)
  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-center rounded-[20%]',
        'bg-foreground/[0.04] dark:bg-foreground/[0.08] border-[0.5px] border-foreground/10',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
      style={{ width: size, height: size, fontSize }}
      onClick={onClick}
    >
      {avatar}
    </div>
  )
}
