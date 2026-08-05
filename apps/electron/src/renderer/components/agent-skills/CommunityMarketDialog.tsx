/**
 * CommunityMarketDialog — 技能市场（企业 SkillHub）
 *
 * 公司内网技能分发入口：GET /index.json 清单 + 逐文件下载安装。
 * 展示下载数/收藏数/发布者，一键安装到当前工作区。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Store, Download, RefreshCw, Search, Star, Download as DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { SkillHubSkill } from '@luxcoder/shared'

interface CommunityMarketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: Array<{ slug: string }>
  onImported: () => void
}

export function CommunityMarketDialog({ open, onOpenChange, workspaceSlug, installedSkills, onImported }: CommunityMarketDialogProps): React.ReactElement {
  const [skills, setSkills] = React.useState<SkillHubSkill[]>([])
  const [loading, setLoading] = React.useState(false)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
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
    } catch (err) {
      console.error('[技能市场] 拉取清单失败:', err)
      setError((err as Error).message || '拉取市场失败')
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
    if (!q) return skills
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.displayName ?? '').toLowerCase().includes(q),
    )
  }, [skills, search])

  const handleInstall = async (skill: SkillHubSkill): Promise<void> => {
    setInstalling(skill.name)
    try {
      await window.electronAPI.skillhubInstallSkill(workspaceSlug, skill)
      toast.success(`已安装 Skill：${skill.displayName ?? skill.name}`)
      onImported()
    } catch (err) {
      console.error('[技能市场] 安装失败:', err)
      toast.error('安装失败', { description: (err as Error).message || undefined })
    } finally {
      setInstalling(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-5 text-emerald-500" />
            社区市场
          </DialogTitle>
          <DialogDescription>
            公司内网技能市场，浏览同事发布的 Agent Skills，一键安装到当前工作区。
          </DialogDescription>
        </DialogHeader>

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
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="刷新">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>重试</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {skills.length === 0 ? '市场暂无可用的技能' : '没有匹配的技能'}
            </div>
          ) : (
            filtered.map((skill) => {
              const already = installed.has(skill.name)
              return (
                <div key={skill.name} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{skill.name}</span>
                      {skill.displayName && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">by {skill.displayName}</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description || '暂无描述'}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5"><DownloadIcon size={11} /> {skill.downloads}</span>
                      <span className="inline-flex items-center gap-0.5"><Star size={11} /> {skill.stars}</span>
                      {skill.files.length > 0 && <span className="text-muted-foreground/70">{skill.files.length} 文件</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? 'ghost' : 'default'}
                    disabled={already || installing === skill.name}
                    onClick={() => void handleInstall(skill)}
                    className={already ? '' : 'bg-emerald-600 hover:bg-emerald-500'}
                  >
                    {installing === skill.name
                      ? <RefreshCw size={14} className="animate-spin" />
                      : <Download size={14} />}
                    {already ? '已安装' : '安装'}
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
