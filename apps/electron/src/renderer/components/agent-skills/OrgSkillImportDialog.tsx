/**
 * OrgSkillImportDialog — 从企业导入技能（SkillHub）
 *
 * 按 SkillHub API（GET /index.json + GET /{skill}/{file}）接入企业技能：
 * - 分类筛选（从技能名/描述推断）
 * - 单个导入 + 批量勾选导入
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Building2, Download, RefreshCw, Search, Star, Download as DownloadIcon, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { SkillHubSkill } from '@luxcoder/shared'
import { collectSkillCategories, inferSkillCategory } from '@/lib/skillhub-category'

interface OrgSkillImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: Array<{ slug: string }>
  onImported: () => void
}

export function OrgSkillImportDialog({ open, onOpenChange, workspaceSlug, installedSkills, onImported }: OrgSkillImportDialogProps): React.ReactElement {
  const [skills, setSkills] = React.useState<SkillHubSkill[]>([])
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [importing, setImporting] = React.useState<string | null>(null)
  const [importingBatch, setImportingBatch] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const installed = React.useMemo(
    () => new Set(installedSkills.map((s) => s.slug)),
    [installedSkills],
  )

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.skillhubFetchIndex()
      setSkills(data)
      setSelected(new Set())
    } catch (err) {
      console.error('[企业导入] 拉取技能失败:', err)
      setError((err as Error).message || '拉取企业技能失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return skills.filter((s) => {
      if (categoryFilter !== 'all' && inferSkillCategory(s.name, s.description) !== categoryFilter) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        ((s.display_name ?? s.displayName) ?? '').toLowerCase().includes(q)
      )
    })
  }, [skills, search, categoryFilter])

  const categories = React.useMemo(() => collectSkillCategories(skills), [skills])

  const toggleSelect = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleSelectAll = (): void => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((s) => s.name)))
    }
  }

  const handleImport = async (skill: SkillHubSkill): Promise<void> => {
    setImporting(skill.name)
    try {
      await window.electronAPI.skillhubInstallSkill(workspaceSlug, skill)
      toast.success(`已导入技能：${skill.displayName ?? skill.name}`)
      onImported()
    } catch (err) {
      console.error('[企业导入] 导入失败:', err)
      toast.error('导入失败', { description: (err as Error).message || undefined })
    } finally {
      setImporting(null)
    }
  }

  const handleBatchImport = async (): Promise<void> => {
    const targets = skills.filter((s) => selected.has(s.name))
    if (targets.length === 0) return
    setImportingBatch(true)
    let okCount = 0
    let failCount = 0
    for (const skill of targets) {
      try {
        await window.electronAPI.skillhubInstallSkill(workspaceSlug, skill)
        okCount++
      } catch (err) {
        console.error(`[企业导入] 导入 ${skill.name} 失败:`, err)
        failCount++
      }
    }
    setImportingBatch(false)
    setSelected(new Set())
    onImported()
    toast.success(`批量导入完成：成功 ${okCount}${failCount > 0 ? `，失败 ${failCount}` : ''}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-indigo-500" />
            从企业导入技能
          </DialogTitle>
          <DialogDescription>
            按企业 SkillHub 分类浏览、筛选，单个或批量导入到当前空间。
          </DialogDescription>
        </DialogHeader>

        {/* 工具条：搜索 + 分类筛选 + 刷新 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索技能 / 描述 / 发布者..."
              className="pl-8"
            />
          </div>

          {/* 分类筛选下拉 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors',
                  categoryFilter !== 'all'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 bg-content-area text-foreground/75 hover:bg-foreground/[0.04]'
                )}
              >
                <span>{categoryFilter === 'all' ? '全部分类' : categoryFilter}</span>
                <ChevronDown size={13} className="text-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 z-[9999]">
              <DropdownMenuLabel>分类</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setCategoryFilter('all')}>
                <span className="flex-1">全部分类</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{skills.length}</span>
              </DropdownMenuItem>
              {categories.map(({ category, count }) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                  className={cn(categoryFilter === category && 'bg-primary/10 text-primary')}
                >
                  <span className="flex-1">{category}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="刷新">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* 批量操作条 */}
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-indigo-600"
              checked={filtered.length > 0 && selected.size === filtered.length}
              onChange={() => toggleSelectAll()}
            />
            全选（{filtered.length}）
          </label>
          <span className="text-[12px] text-muted-foreground">已选 {selected.size} 项</span>
          <Button
            size="sm"
            disabled={selected.size === 0 || importingBatch}
            onClick={() => void handleBatchImport()}
            className="ml-auto shrink-0 bg-indigo-600 hover:bg-indigo-500"
          >
            {importingBatch ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            导入选中（{selected.size}）
          </Button>
        </div>

        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>重试</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {skills.length === 0 ? '企业暂无已发布的技能' : '没有匹配的技能'}
            </div>
          ) : (
            filtered.map((skill) => {
              const already = installed.has(skill.name)
              const isSelected = selected.has(skill.name)
              return (
                <div
                  key={skill.name}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    isSelected ? 'border-primary/40 bg-primary/[0.04]' : 'border-border/60',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="size-3.5 shrink-0 accent-indigo-600"
                      checked={isSelected}
                      disabled={already}
                      onChange={() => toggleSelect(skill.name)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{skill.name}</span>
                        {(skill.display_name ?? skill.displayName) && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">by {skill.display_name ?? skill.displayName}</span>
                        )}
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {inferSkillCategory(skill.name, skill.description)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description || '暂无描述'}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5"><DownloadIcon size={11} /> {skill.downloads}</span>
                        <span className="inline-flex items-center gap-0.5"><Star size={11} /> {skill.stars}</span>
                        {skill.files.length > 0 && <span className="text-muted-foreground/70">{skill.files.length} 文件</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? 'ghost' : 'outline'}
                    disabled={already || importing === skill.name}
                    onClick={() => void handleImport(skill)}
                    className="shrink-0"
                  >
                    {importing === skill.name
                      ? <RefreshCw size={14} className="animate-spin" />
                      : <Download size={14} />}
                    {already ? '已导入' : '导入'}
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
