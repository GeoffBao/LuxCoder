/**
 * SkillHubMarketDialog — SkillHub 企业市场（内网）
 *
 * 拉取公司内网 SkillHub 技能清单（GET /index.json），浏览/搜索/安装技能。
 * 清单含 downloads/stars/display_name/description，安装后写入工作区 skills/。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Store, Download, RefreshCw, Search, Star, Download as DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { SkillHubSkill } from '@luxcoder/shared'

interface SkillHubMarketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: Array<{ slug: string }>
  onImported: () => void
}

export function SkillHubMarketDialog({ open, onOpenChange, workspaceSlug, installedSkills, onImported }: SkillHubMarketDialogProps): React.ReactElement {
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
      console.error('[SkillHub] 拉取清单失败:', err)
      setError((err as Error).message || '拉取 SkillHub 失败')
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
      toast.success(`已从 SkillHub 安装 Skill：${skill.displayName ?? skill.name}`)
      onImported()
    } catch (err) {
      console.error('[SkillHub] 安装失败:', err)
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
            SkillHub 企业市场
          </DialogTitle>
          <DialogDescription>
            公司内网技能市场，浏览/搜索同事发布的 Agent Skills，一键安装到当前工作区。
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
              {skills.length === 0 ? 'SkillHub 暂无可用的技能' : '没有匹配的技能'}
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
                      {skill.files.length > 0 && <Badge variant="outline" className="text-[10px]">{skill.files.length} 文件</Badge>}
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
