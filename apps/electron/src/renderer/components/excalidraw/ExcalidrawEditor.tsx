/**
 * ExcalidrawEditor - 全功能画板编辑器
 *
 * 集成 @excalidraw/excalidraw React 组件，支持：
 * - 从 IPC 加载/保存 .excalidraw 文件
 * - 60 秒自动保存
 * - Cmd/Ctrl+S 手动保存
 * - 导出到任意路径
 * - 标题编辑
 */

import * as React from 'react'
import { ArrowLeft, PenTool, Save, Download, Loader2 } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { activeViewAtom } from '@/atoms/active-view'
import { currentAgentWorkspaceIdAtom, agentWorkspacesAtom } from '@/atoms/agent-atoms'

/** Excalidraw imperative API 类型（内联定义以避免额外的类型导入） */
interface ExcalidrawImperativeAPI {
  getSceneElements: () => readonly Record<string, unknown>[]
  getAppState: () => Record<string, unknown>
  getFiles: () => Record<string, { dataURL: string; mimeType: string; id: string; created?: number }>
}

// Lazy load the heavy Excalidraw component
const Excalidraw = React.lazy(() =>
  import('@excalidraw/excalidraw').then((m) => ({ default: m.Excalidraw })),
)

export function ExcalidrawEditor(): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)

  const workspaceSlug = React.useMemo(() => {
    if (!currentWorkspaceId) return null
    return workspaces.find((w) => w.id === currentWorkspaceId)?.slug ?? null
  }, [currentWorkspaceId, workspaces])

  const [slug, setSlug] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('未命名画布')
  const [initialData, setInitialData] = React.useState<{
    elements: Record<string, unknown>[]
    appState: Record<string, unknown>
    files: Record<string, unknown>
  } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')
  const [isNew, setIsNew] = React.useState(true)

  const excalidrawRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const statusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // Store handler ref to avoid stale closures
  const handleSaveRef = React.useRef<(auto: boolean) => Promise<void>>(async () => {})

  // 加载数据
  React.useEffect(() => {
    if (!workspaceSlug) return

    const editingSlug = sessionStorage.getItem('excalidraw:editingSlug')
    if (!editingSlug) {
      setLoading(false)
      setIsNew(true)
      return
    }

    setSlug(editingSlug)
    sessionStorage.removeItem('excalidraw:editingSlug')

    window.electronAPI
      .readExcalidrawFile(workspaceSlug, editingSlug)
      .then((data) => {
        if (data) {
          setIsNew(false)
          setTitle(
            editingSlug
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase()),
          )
          setInitialData({
            elements: (data.elements || []) as Record<string, unknown>[],
            appState: (data.appState as Record<string, unknown>) || { viewBackgroundColor: '#ffffff' },
            files: (data.files as Record<string, unknown>) || {},
          })
        }
      })
      .catch((err) => console.error('[ExcalidrawEditor] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [workspaceSlug])

  function showStatus(msg: string, autoClear = true): void {
    setSaveStatus(msg)
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    if (autoClear) {
      statusTimerRef.current = setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  async function handleSave(auto: boolean): Promise<void> {
    if (!excalidrawRef.current || !workspaceSlug) return

    const elements = excalidrawRef.current.getSceneElements()
    const appState = excalidrawRef.current.getAppState()
    const files = excalidrawRef.current.getFiles()

    setSaving(true)

    try {
      let currentSlug = slug

      if (isNew || !currentSlug) {
        const result = await window.electronAPI.createExcalidrawFile(
          workspaceSlug,
          title.trim() || '未命名画布',
        )
        currentSlug = result.slug
        setSlug(result.slug)
        setIsNew(false)
      }

      await window.electronAPI.writeExcalidrawFile(workspaceSlug, currentSlug, {
        elements: elements as unknown[],
        appState: { viewBackgroundColor: appState.viewBackgroundColor },
        files: files as unknown as Record<string, unknown>,
      })

      showStatus(auto ? '已自动保存' : '已保存 ✓')
    } catch (err) {
      console.error('[ExcalidrawEditor] 保存失败:', err)
      showStatus('保存失败', false)
    } finally {
      setSaving(false)
    }
  }

  // Keep handleSaveRef in sync
  handleSaveRef.current = handleSave

  // 自动保存（每 60 秒）
  React.useEffect(() => {
    if (!workspaceSlug || !slug || isNew) return

    autoSaveTimerRef.current = setInterval(() => {
      void handleSaveRef.current(true)
    }, 60_000)

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [workspaceSlug, slug, isNew])

  // 键盘快捷键
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSaveRef.current(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleExport(): Promise<void> {
    if (!workspaceSlug || !slug) return

    try {
      if (excalidrawRef.current) {
        const elements = excalidrawRef.current.getSceneElements()
        const appState = excalidrawRef.current.getAppState()
        const files = excalidrawRef.current.getFiles()
        await window.electronAPI.writeExcalidrawFile(workspaceSlug, slug, {
          elements: elements as unknown[],
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          files: files as unknown as Record<string, unknown>,
        })
      }

      const exportPath = await window.electronAPI.exportExcalidrawFile(workspaceSlug, slug)
      if (exportPath) {
        showStatus(`已导出到 ${exportPath}`)
      }
    } catch (err) {
      console.error('[ExcalidrawEditor] 导出失败:', err)
      showStatus('导出失败', false)
    }
  }

  const handleBack = React.useCallback(() => {
    sessionStorage.removeItem('excalidraw:editingSlug')
    setActiveView('excalidraw-gallery')
  }, [setActiveView])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/30">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 titlebar-no-drag shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="text-foreground/50 hover:text-foreground transition-colors shrink-0"
            onClick={handleBack}
            aria-label="返回画廊"
          >
            <ArrowLeft size={18} />
          </button>
          <PenTool size={16} className="text-foreground/60 shrink-0" />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent border-b border-transparent focus:border-primary outline-none text-[14px] font-medium text-foreground px-1 py-0.5 min-w-[120px] max-w-[300px] placeholder:text-foreground/30"
            placeholder="未命名画布…"
            spellCheck={false}
          />
          {isNew && (
            <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
              新建
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveStatus && (
            <span
              className={`text-[12px] ${
                saveStatus.includes('失败') ? 'text-red-500' : 'text-emerald-600'
              }`}
            >
              {saveStatus}
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium bg-foreground/[0.06] text-foreground/60 hover:bg-foreground/[0.1] hover:text-foreground transition-colors disabled:opacity-40"
            onClick={handleExport}
            disabled={isNew || !slug}
          >
            <Download size={14} />
            导出…
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
        </div>
      </div>

      {/* Excalidraw 编辑器 */}
      <div className="flex-1 min-h-0">
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-foreground/30">
              <Loader2 size={24} className="animate-spin" />
            </div>
          }
        >
          <Excalidraw
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            excalidrawAPI={(api: any) => {
              excalidrawRef.current = api as ExcalidrawImperativeAPI
            }}
            initialData={
              initialData
                ? {
                    elements: initialData.elements as never[],
                    appState: initialData.appState as never,
                    files: initialData.files as never,
                  }
                : undefined
            }
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                saveAsImage: true,
                loadScene: false,
                export: false,
              },
            }}
          />
        </React.Suspense>
      </div>
    </div>
  )
}
