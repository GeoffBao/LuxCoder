/**
 * ExcalidrawView - Excalidraw 画布路由视图
 *
 * 根据 activeView 渲染画廊或编辑器（lazy load 编辑器以减小首屏体积）。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { activeViewAtom } from '@/atoms/active-view'
import { currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { ExcalidrawGallery } from './ExcalidrawGallery'

const ExcalidrawEditor = React.lazy(() =>
  import('./ExcalidrawEditor').then((m) => ({ default: m.ExcalidrawEditor })),
)

export function ExcalidrawView(): React.ReactElement | null {
  const activeView = useAtomValue(activeViewAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)

  if (activeView === 'excalidraw-gallery') {
    return <ExcalidrawGallery />
  }

  if (activeView === 'excalidraw-editor') {
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-full text-foreground/40">加载中…</div>}>
        {/*
          key 绑定当前 workspace：编辑器打开期间若通过 Tab 切换器/快捷键切到另一 workspace
          的会话（activeView 不变，组件本不会卸载），强制重新挂载以重置全部本地状态，
          避免画布仍可视化显示旧 workspace 内容、保存时把旧内容写进新 workspace 的文件。
        */}
        <ExcalidrawEditor key={currentWorkspaceId ?? 'none'} />
      </React.Suspense>
    )
  }

  return null
}
