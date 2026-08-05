/**
 * CommunityMarketDialog — 技能市场（企业 SkillHub / 社区 n-skills）
 *
 * 统一的技能市场入口：
 * - 企业 SkillHub（默认）：公司内网技能分发，GET /index.json 清单 + 逐文件下载安装
 * - 社区 n-skills：开源社区技能，sources.yaml 清单 + tar.gz 安装
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Store, Download, RefreshCw, Search, Star, Download as DownloadIcon, Building2, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CommunitySkill, SkillHubSkill } from '@luxcoder/shared'

type MarketSource = 'enterprise' | 'community'

interface CommunityMarketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: Array<{ slug: string }>
  onImported: () => void
}

interface EnterpriseSkillItem {
  name: string
  files: string[]
  description?: string
  displayName?: string
  downloads: number
  stars: number
}

/** 统一市场条目（内部归一化，便于一个渲染器） */
interface MarketItem {
  key: string
  name: string
  displayName: string
  description: string
  meta: { label: string; value: string | number }[]
  raw: EnterpriseSkillItem | CommunitySkill
}

export function CommunityMarketDialog({ open, onOpenChange, workspaceSlug, installedSkills, onImported }: CommunityMarketDialogProps): React.ReactElement {
  const [source, setSource] = React.useState<MarketSource>('enterprise')
  const [skills, setSkills] = React.useState<MarketItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const installed = React.useMemo(
    () => new Set(installedSkills.map((s) => s.slug)),
    [installedSkills],
  )

  const load = React.useCallback(async (targetSource: MarketSource = source): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      let items: MarketItem[]
      if (targetSource === 'enterprise') {
        const data = await window.electronAPI.skillhubFetchIndex()
        items = data.map((s: SkillHubSkill) => ({
          key: s.name,
          name: s.name,
          displayName: s.displayName ?? s.name,
          description: s.description ?? '',
          meta: [
            { label: '下载', value: s.downloads },
            { label: '收藏', value: s.stars },
            { label: '文件', value: s.files.length },
          ],
          raw: { ...s, displayName: s.displayName, downloads: s.downloads, stars: s.stars },
        }))
      } else {
        const data = await window.electronAPI.communityFetchManifest()
        items = data.map((s: CommunitySkill) => ({
          key: s.name,
          name: s.name,
          displayName: s.displayName ?? s.name,
          description: s.description,
          meta: [
            ...(s.category ? [{ label: '分类', value: s.category }] : []),
            ...(s.license ? [{ label: '许可', value: s.license }] : []),
          ],
          raw: s,
        }))
      }
      setSkills(items)
    } catch (err) {
      console.error('[技能市场] 拉取清单失败:', err)
      setError((err as Error).message || '拉取市场失败')
    } finally {
      setLoading(false)
    }
  }, [source])

  React.useEffect(() => {
    if (!open) return
    void load()
  }, [open, source, load])

  const handleSourceChange = (next: MarketSource): void => {
    if (next === source) return
    setSource(next)
    setSearch('')
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return skills
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.displayName.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
    )
  }, [skills, search])

  const handleInstall = async (item: MarketItem): Promise<void> => {
    setInstalling(item.key)
    try {
      if (source === 'enterprise') {
        const raw = item.raw as EnterpriseSkillItem
        await window.electronAPI.skillhubInstallSkill(workspaceSlug, raw as unknown as SkillHubSkill)
      } else {
        await window.electronAPI.communityInstallSkill(workspaceSlug, item.raw as CommunitySkill)
      }
      toast.success(`已安装 Skill：${item.displayName}`)
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
            技能市场
          </DialogTitle>
          <DialogDescription>
            浏览并一键安装 Agent Skills 到当前工作区。
          </DialogDescription>
        </DialogHeader>

        {/* 市场源切换 */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => handleSourceChange('enterprise')}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors',
              source === 'enterprise' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Building2 size={13} />
            企业 SkillHub
          </button>
          <button
            type="button"
            onClick={() => handleSourceChange('community')}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors',
              source === 'community' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Globe size={13} />
            社区 n-skills
          </button>
        </div>

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
            filtered.map((item) => {
              const already = installed.has(item.name)
              return (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.displayName}</span>
                      {source === 'enterprise' && (item.raw as EnterpriseSkillItem).displayName && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          by {(item.raw as EnterpriseSkillItem).displayName}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description || '暂无描述'}</p>
                    {item.meta.length > 0 && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {item.meta.map((m) => (
                          <span key={m.label} className="inline-flex items-center gap-0.5">
                            {m.label === '下载' ? <DownloadIcon size={11} /> : m.label === '收藏' ? <Star size={11} /> : null}
                            {m.label}: {m.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={already ? 'ghost' : 'default'}
                    disabled={already || installing === item.key}
                    onClick={() => void handleInstall(item)}
                    className={already ? '' : 'bg-emerald-600 hover:bg-emerald-500'}
                  >
                    {installing === item.key
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
