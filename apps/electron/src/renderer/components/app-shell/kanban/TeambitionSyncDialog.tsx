/**
 * TeambitionSyncDialog — TB 待办手动添加对话框
 *
 * 一键更新拉取 TB「我的任务」（我执行且未完成，与 TB 系统视图一致）后：
 * - 未同步过的任务可勾选添加（不自动运行、不开会话窗口）
 * - 已同步过的任务置灰并标注「已添加」
 * - 顶部搜索框：按标题关键词或任务编号（uniqueId）本地过滤
 * - 任务多时仍流畅（列表简单渲染 + ScrollArea）
 */
import * as React from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface TeambitionSyncCandidate {
  id: string
  title: string
  projectId: string
  /** 是否已在本地看板（置灰显示） */
  alreadySynced?: boolean
  /** TB 任务编号 */
  uniqueId?: number
}

interface TeambitionSyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 候选任务（仅未同步的） */
  candidates: TeambitionSyncCandidate[]
  /** 已同步的任务标题（置灰展示） */
  alreadySynced: string[]
  /** 拉取中 */
  loading?: boolean
  /** 是否 Mock（未配置 TB MCP） */
  mock?: boolean
  /** 创建中 */
  creating?: boolean
  onRefresh: () => void
  /** 用户确认添加选中项 */
  onConfirm: (selected: TeambitionSyncCandidate[]) => void
}

export function TeambitionSyncDialog(props: TeambitionSyncDialogProps): React.ReactElement {
  const {
    open,
    onOpenChange,
    candidates,
    alreadySynced,
    loading = false,
    mock = false,
    creating = false,
    onRefresh,
    onConfirm,
  } = props
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [query, setQuery] = React.useState('')

  // 打开时重置选择与搜索
  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set())
      setQuery('')
    }
  }, [open])

  // 本地过滤：标题或编号包含关键词（大小写不敏感）
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((candidate) => {
      if (candidate.title.toLowerCase().includes(q)) return true
      if (candidate.uniqueId !== undefined && String(candidate.uniqueId).includes(q)) return true
      return false
    })
  }, [candidates, query])

  const allSelected = filtered.length > 0 && filtered.every((candidate) => selectedIds.has(candidate.id))
  const selectedCount = selectedIds.size
  const resultCount = filtered.length

  const toggleAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((candidate) => candidate.id)))
    }
  }

  const toggleOne = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = (): void => {
    const selected = candidates.filter((candidate) => selectedIds.has(candidate.id))
    if (selected.length === 0) return
    onConfirm(selected)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[10000] flex max-h-[70vh] w-[540px] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-2 pt-4">
          <DialogTitle className="text-base">从 Teambition 添加待办</DialogTitle>
          <DialogDescription className="text-xs">
            勾选要加入看板的 TB 任务（仅创建本地任务，不自动运行）
          </DialogDescription>
        </DialogHeader>

        {mock ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            未配置 Teambition MCP，无法拉取真实任务。请前往 MCP 设置配置 TB-Connect 后再试。
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在拉取 TB 待办…
          </div>
        ) : candidates.length === 0 && alreadySynced.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            TB 名下暂无未完成的待办任务
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* 搜索框 */}
            <div className="flex items-center gap-2 px-5 pb-2 pt-1">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="按标题或编号搜索（如 SIM、12247）"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || creating}>
                <RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} />
                刷新
              </Button>
            </div>
            <div className="flex items-center gap-2 border-b border-border/40 px-5 py-2 text-xs">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-foreground/70 hover:bg-foreground/[0.06]"
              >
                <span
                  className={cn(
                    'inline-flex size-3.5 items-center justify-center rounded border text-[10px] leading-none',
                    allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {allSelected ? '✓' : ''}
                </span>
                全选
              </button>
              <span className="ml-auto text-foreground/50">
                {query.trim()
                  ? `匹配 ${resultCount} 项 / 共 ${candidates.length} 项`
                  : selectedCount > 0
                    ? `已选 ${selectedCount} 项`
                    : `共 ${candidates.length} 项可添加`}
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 py-1">
                {filtered.length === 0 && query.trim() ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    没有匹配「{query.trim()}」的任务
                  </div>
                ) : (
                  filtered.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => toggleOne(candidate.id)}
                      className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/[0.05]"
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border text-xs leading-none',
                          selectedIds.has(candidate.id)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {selectedIds.has(candidate.id) ? '✓' : ''}
                      </span>
                      <span className="line-clamp-2 flex-1">{candidate.title}</span>
                      {candidate.uniqueId !== undefined && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/50">#{candidate.uniqueId}</span>
                      )}
                    </button>
                  ))
                )}
                {alreadySynced.length > 0 && (
                  <>
                    <div className="mt-2 border-t border-border/40 px-3 py-1.5 text-[11px] text-foreground/40">
                      已添加（{alreadySynced.length}）
                    </div>
                    {alreadySynced.map((title) => (
                      <div key={title} className="flex items-start gap-2 px-3 py-1.5 text-sm text-foreground/35">
                        <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border border-border/60 text-xs">
                          <X className="h-2.5 w-2.5" />
                        </span>
                        <span className="line-clamp-2 line-through">{title}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-border/40 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>
            关闭
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={creating || selectedCount === 0}>
            {creating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            添加 {selectedCount > 0 ? `${selectedCount} 项` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
