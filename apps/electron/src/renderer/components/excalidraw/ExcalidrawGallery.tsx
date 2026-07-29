/**
 * ExcalidrawGallery - 画板画廊页
 *
 * 列出当前 Workspace 下所有 .excalidraw 文件，以卡片网格展示，
 * 每个卡片包含 SVG 缩略图、标题、元素计数。
 */

import * as React from 'react'
import { PenTool, Plus, AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { activeViewAtom } from '@/atoms/active-view'
import { currentAgentWorkspaceIdAtom, agentWorkspacesAtom } from '@/atoms/agent-atoms'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ExcalidrawFileMeta {
  slug: string
  title: string
  elementCount: number
  background: string
  mtime: number
  error?: boolean
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ms).toLocaleDateString('zh-CN')
}

/**
 * SVG 缩略图生成器（前端版）
 *
 * 在渲染进程中实时计算 SVG 缩略图，避免额外 IPC 调用。
 * 只渲染矢量形状（矩形/椭圆/菱形/箭头/文字占位），不渲染嵌入图片。
 */
function buildThumbnailSvg(
  elements: unknown[],
  background: string,
): string {
  const W = 260
  const H = 160
  const PAD = 12

  if (!elements || elements.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${background || '#fff'}"/><text x="${W / 2}" y="${H / 2 + 5}" text-anchor="middle" font-size="12" fill="#ccc" font-family="sans-serif">empty</text></svg>`
  }

  // 只取前 200 个元素计算包围盒，避免性能问题
  const sample = elements.slice(0, 200)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const el of sample) {
    const e = el as Record<string, unknown>
    if (e.type === 'arrow' || e.type === 'line') {
      const points = (e.points as Array<[number, number]>) || [[0, 0]]
      for (const [px, py] of points) {
        minX = Math.min(minX, (e.x as number) + px)
        minY = Math.min(minY, (e.y as number) + py)
        maxX = Math.max(maxX, (e.x as number) + px)
        maxY = Math.max(maxY, (e.y as number) + py)
      }
    } else if (e.x !== undefined) {
      minX = Math.min(minX, e.x as number)
      minY = Math.min(minY, e.y as number)
      maxX = Math.max(maxX, (e.x as number) + ((e.width as number) || 0))
      maxY = Math.max(maxY, (e.y as number) + ((e.height as number) || 0))
    }
  }

  if (!isFinite(minX)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${background || '#fff'}"/></svg>`
  }

  const bw = maxX - minX || 1
  const bh = maxY - minY || 1
  const scale = Math.min((W - PAD * 2) / bw, (H - PAD * 2) / bh)
  const ox = PAD + ((W - PAD * 2) - bw * scale) / 2 - minX * scale
  const oy = PAD + ((H - PAD * 2) - bh * scale) / 2 - minY * scale

  const shapes: string[] = []
  for (const el of sample.slice(0, 50)) {
    const e = el as Record<string, unknown>
    const x = (e.x as number) * scale + ox
    const y = (e.y as number) * scale + oy
    const w = ((e.width as number) || 40) * scale
    const h = ((e.height as number) || 40) * scale
    const fill =
      e.backgroundColor && e.backgroundColor !== 'transparent'
        ? (e.backgroundColor as string)
        : 'none'
    const stroke = (e.strokeColor as string) || '#1c1c1c'
    const sw = Math.max(0.5, ((e.strokeWidth as number) || 1) * scale * 0.5).toFixed(1)

    switch (e.type) {
      case 'rectangle':
      case 'frame':
        shapes.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="1"/>`,
        )
        break
      case 'ellipse':
        shapes.push(
          `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
        )
        break
      case 'diamond': {
        const cx = (x + w / 2).toFixed(1)
        const cy = (y + h / 2).toFixed(1)
        shapes.push(
          `<polygon points="${cx},${y.toFixed(1)} ${(x + w).toFixed(1)},${cy} ${cx},${(y + h).toFixed(1)} ${x.toFixed(1)},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
        )
        break
      }
      case 'text':
        if (w > 2) {
          shapes.push(
            `<rect x="${x.toFixed(1)}" y="${(y + h * 0.3).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h * 0.2).toFixed(1)}" fill="${stroke}" opacity="0.35" rx="1"/>`,
          )
        }
        break
      case 'line':
      case 'arrow': {
        const pts = (e.points as Array<[number, number]>) || [
          [0, 0],
          [(e.width as number) || 40, (e.height as number) || 0],
        ]
        const first = pts[0]
        const last = pts[pts.length - 1]
        if (pts.length >= 2 && first && last) {
          const x1 = ((e.x as number) + first[0]) * scale + ox
          const y1 = ((e.y as number) + first[1]) * scale + oy
          const x2 = ((e.x as number) + last[0]) * scale + ox
          const y2 = ((e.y as number) + last[1]) * scale + oy
          shapes.push(
            `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"/>`,
          )
        }
        break
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${background || '#fff'}"/>${shapes.join('')}</svg>`
}

export function ExcalidrawGallery(): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const [files, setFiles] = React.useState<ExcalidrawFileMeta[]>([])
  const [loading, setLoading] = React.useState(true)
  const [svgCache, setSvgCache] = React.useState<Map<string, string>>(new Map())
  const [renameTarget, setRenameTarget] = React.useState<ExcalidrawFileMeta | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<ExcalidrawFileMeta | null>(null)

  const workspaceSlug = React.useMemo(() => {
    if (!currentWorkspaceId) return null
    return workspaces.find((w) => w.id === currentWorkspaceId)?.slug ?? null
  }, [currentWorkspaceId, workspaces])

  // 加载文件列表
  React.useEffect(() => {
    if (!workspaceSlug) {
      setFiles([])
      setLoading(false)
      return
    }

    setLoading(true)
    window.electronAPI
      .listExcalidrawFiles(workspaceSlug)
      .then((list) => setFiles(list))
      .catch((err) => console.error('[ExcalidrawGallery] 加载失败:', err))
      .finally(() => setLoading(false))
  }, [workspaceSlug])

  // 生成缩略图（懒加载：避免一次性渲染大量 SVG 卡住）
  React.useEffect(() => {
    if (files.length === 0 || !workspaceSlug) return

    const cache = new Map(svgCache)
    let cancelled = false

    async function loadThumbnails(): Promise<void> {
      for (const file of files) {
        if (cancelled || cache.has(file.slug)) continue
        try {
          const data = await window.electronAPI.readExcalidrawFile(workspaceSlug!, file.slug)
          const svg = buildThumbnailSvg(data?.elements || [], file.background)
          cache.set(file.slug, svg)
        } catch {
          cache.set(file.slug, '')
        }
        if (!cancelled) setSvgCache(new Map(cache))
      }
    }

    void loadThumbnails()
    return () => {
      cancelled = true
    }
  }, [files, workspaceSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // 新建画布
  const handleCreate = React.useCallback(async () => {
    console.log('[ExcalidrawGallery] handleCreate, workspaceSlug:', workspaceSlug)
    if (!workspaceSlug) {
      toast.warning('请先选择一个工作区')
      return
    }
    try {
      // 自动后缀避免重名
      let title = `画布 ${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}`
      const existingTitles = new Set(files.map((f) => f.title))
      if (existingTitles.has(title)) {
        let i = 1
        while (existingTitles.has(`${title} (${i})`)) i++
        title = `${title} (${i})`
      }
      const { slug } = await window.electronAPI.createExcalidrawFile(
        workspaceSlug,
        title,
      )
      console.log('[ExcalidrawGallery] created file, slug:', slug)
      // 刷新列表
      const list = await window.electronAPI.listExcalidrawFiles(workspaceSlug)
      setFiles(list)
      // 直接跳转编辑器
      sessionStorage.setItem('excalidraw:editingSlug', slug)
      setActiveView('excalidraw-editor')
    } catch (err) {
      console.error('[ExcalidrawGallery] 新建失败:', err)
      toast.error(`新建失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }, [workspaceSlug, setActiveView])

  // 打开已有画布
  const handleOpen = React.useCallback(
    (fileSlug: string) => {
      sessionStorage.setItem('excalidraw:editingSlug', fileSlug)
      setActiveView('excalidraw-editor')
    },
    [setActiveView],
  )

  // 重命名
  const handleRenameStart = React.useCallback((file: ExcalidrawFileMeta) => {
    setRenameTarget(file)
    setRenameValue(file.title)
  }, [])

  const handleRenameConfirm = React.useCallback(async () => {
    if (!workspaceSlug || !renameTarget || !renameValue.trim()) return
    try {
      const result = await window.electronAPI.renameExcalidrawFile(
        workspaceSlug,
        renameTarget.slug,
        renameValue.trim(),
      )
      setFiles((prev) =>
        prev.map((f) =>
          f.slug === renameTarget.slug
            ? { ...f, title: result.title, slug: result.slug }
            : f,
        ),
      )
      setSvgCache((prev) => {
        const next = new Map(prev)
        if (prev.has(renameTarget.slug)) {
          next.set(result.slug, prev.get(renameTarget.slug)!)
          next.delete(renameTarget.slug)
        }
        return next
      })
      toast.success('已重命名')
    } catch (err) {
      toast.error(`重命名失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setRenameTarget(null)
    }
  }, [workspaceSlug, renameTarget, renameValue])

  // 删除
  const handleDeleteConfirm = React.useCallback(async () => {
    if (!workspaceSlug || !deleteTarget) return
    try {
      await window.electronAPI.deleteExcalidrawFile(workspaceSlug, deleteTarget.slug)
      setFiles((prev) => prev.filter((f) => f.slug !== deleteTarget.slug))
      setSvgCache((prev) => {
        const next = new Map(prev)
        next.delete(deleteTarget.slug)
        return next
      })
      toast.success('已删除')
    } catch (err) {
      toast.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setDeleteTarget(null)
    }
  }, [workspaceSlug, deleteTarget])

  if (!workspaceSlug) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-foreground/40 gap-3">
        <PenTool size={40} strokeWidth={1} />
        <p className="text-[14px]">请先选择一个工作区</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 titlebar-no-drag">
        <div className="flex items-center gap-2.5">
          <PenTool size={18} className="text-foreground/60" />
          <h1 className="text-[15px] font-semibold text-foreground">Excalidraw 画板</h1>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} />
          新建画布
        </button>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-foreground/30 text-[14px]">
          加载中…
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-foreground/40 gap-4">
          <PenTool size={48} strokeWidth={1} />
          <p className="text-[14px]">暂无画布，点击上方「新建画布」开始创作</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file) => (
              <ContextMenu key={file.slug}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    className="group flex flex-col rounded-lg border border-border/50 bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left overflow-hidden"
                    onClick={() => handleOpen(file.slug)}
                  >
                    {/* 缩略图 */}
                    <div className="relative w-full aspect-[13/8] bg-[#f8f8f8] dark:bg-[#1a1a1a] overflow-hidden">
                      {svgCache.has(file.slug) ? (
                        <div
                          className="w-full h-full"
                          dangerouslySetInnerHTML={{ __html: svgCache.get(file.slug)! }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PenTool size={24} className="text-foreground/15" />
                        </div>
                      )}
                      {file.error && (
                        <div className="absolute top-2 right-2 text-amber-500" title="文件可能损坏">
                          <AlertCircle size={14} />
                        </div>
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="px-3 py-2.5 flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {file.title || '未命名'}
                      </span>
                      <span className="text-[11px] text-foreground/40">
                        {file.elementCount} 个元素 · {relativeTime(file.mtime)}
                      </span>
                    </div>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem onClick={() => handleOpen(file.slug)}>
                    打开
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleRenameStart(file)}>
                    <Pencil size={13} className="mr-2" />
                    重命名
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-red-500 focus:text-red-500"
                    onClick={() => setDeleteTarget(file)}
                  >
                    <Trash2 size={13} className="mr-2" />
                    删除
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        </div>
      )}

      {/* 重命名对话框 */}
      <AlertDialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重命名画布</AlertDialogTitle>
            <AlertDialogDescription>
              输入新的画布名称
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm() }}
            className="w-full rounded-md border border-border px-3 py-2 text-[14px] outline-none focus:border-primary"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenameConfirm} disabled={!renameValue.trim()}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除画布</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.title}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
