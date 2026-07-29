/**
 * ExcalidrawView - Excalidraw 画板路由视图
 *
 * 根据 activeView 渲染画廊或编辑器（lazy load 编辑器以减小首屏体积）。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { activeViewAtom } from '@/atoms/active-view'
import { ExcalidrawGallery } from './ExcalidrawGallery'

const ExcalidrawEditor = React.lazy(() =>
  import('./ExcalidrawEditor').then((m) => ({ default: m.ExcalidrawEditor })),
)

export function ExcalidrawView(): React.ReactElement | null {
  const activeView = useAtomValue(activeViewAtom)

  if (activeView === 'excalidraw-gallery') {
    return <ExcalidrawGallery />
  }

  if (activeView === 'excalidraw-editor') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-full text-foreground/40">加载中…</div>}>
        <ExcalidrawEditor />
      </React.Suspense>
    )
  }

  return null
}
