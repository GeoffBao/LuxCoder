import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  Archive,
  ArchiveRestore,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcoder/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { activeViewAtom } from '@/atoms/active-view'
import { kanbanItemsAtom } from '@/atoms/kanban-atoms'
import {
  codeMainViewAtom,
  pendingTaskEditorTargetAtom,
  workViewAtom,
} from '@/atoms/project-atoms'
import { useCreateSession } from '@/hooks/useCreateSession'
import { useExpertOptions } from '@/components/agent-experts/useExpertOptions'
import type { KanbanProject } from '../app-shell/kanban/types'
import {
  buildProjectUpdate,
  formatEffectiveCwdSummary,
  getProjectSessions,
  PROJECT_HOME_TABS,
  type EffectiveCwdSummary,
  type ProjectColumnDraft,
  type ProjectHomeTabId,
} from './project-view-model'

interface ProjectAssetView {
  filename: string
  sizeBytes: number
  mimeType: string
  uploadedAt: number
}

export interface ProjectInfoPageProps {
  workspaceRoot: string
  project: KanbanProject
  sessions: AgentSessionMeta[]
  onProjectChanged: (project: KanbanProject) => void
  onDeleted: (projectId: string) => void
  onOpenSession?: (sessionId: string) => void
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('文件编码失败'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

export function ProjectInfoPage({
  workspaceRoot,
  project,
  sessions,
  onProjectChanged,
  onDeleted,
  onOpenSession,
}: ProjectInfoPageProps): React.ReactElement {
  const { options: expertOptions } = useExpertOptions()
  const { createAgent } = useCreateSession()
  const setWorkView = useSetAtom(workViewAtom)
  const setCodeMainView = useSetAtom(codeMainViewAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setPendingTaskEditor = useSetAtom(pendingTaskEditorTargetAtom)
  const kanbanItems = useAtomValue(kanbanItemsAtom)

  const [tab, setTab] = React.useState<ProjectHomeTabId>('overview')
  const [assets, setAssets] = React.useState<ProjectAssetView[]>([])
  const [memory, setMemory] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [cwdInfo, setCwdInfo] = React.useState<EffectiveCwdSummary | null>(null)
  const [settingsDraft, setSettingsDraft] = React.useState({
    name: project.name,
    description: project.description ?? '',
    details: project.details ?? '',
    color: project.color ?? '',
    workingDirectory: project.workingDirectory ?? '',
    defaultExpertId: project.defaultExpertId ?? '',
  })
  const [columns, setColumns] = React.useState<ProjectColumnDraft[]>(project.kanbanColumns ?? [])
  const projectSessions = getProjectSessions(sessions, project.id)
  const slug = project.slug
  const expertLabel = expertOptions.find((item) => item.id === (project.defaultExpertId ?? ''))?.label
    ?? (project.defaultExpertId ? project.defaultExpertId : '未设置')
  const activeTasks = kanbanItems.filter((item) => item.isProcessing)
  const recentSessions = projectSessions.slice(0, 5)
  const recentAssets = assets.slice(0, 5)

  React.useEffect(() => {
    setSettingsDraft({
      name: project.name,
      description: project.description ?? '',
      details: project.details ?? '',
      color: project.color ?? '',
      workingDirectory: project.workingDirectory ?? '',
      defaultExpertId: project.defaultExpertId ?? '',
    })
    setColumns(project.kanbanColumns ?? [])
  }, [project])

  const refreshCwd = React.useCallback(async (): Promise<void> => {
    if (!slug) {
      setCwdInfo(null)
      return
    }
    try {
      const result = await window.electronAPI.projects.resolveEffectiveCwd(workspaceRoot, slug)
      setCwdInfo(result)
    } catch (cause) {
      console.error('[项目主页] 解析主目录失败:', cause)
      setCwdInfo(null)
    }
  }, [slug, workspaceRoot])

  React.useEffect(() => {
    void refreshCwd()
  }, [refreshCwd])

  const refreshAssets = React.useCallback(async (): Promise<void> => {
    if (!slug) return
    setAssets(await window.electronAPI.projects.listAssets(workspaceRoot, slug))
  }, [slug, workspaceRoot])

  React.useEffect(() => {
    if (tab !== 'assets' && tab !== 'overview') return
    void refreshAssets().catch((cause: unknown) => {
      toast.error('加载资产失败', { description: cause instanceof Error ? cause.message : String(cause) })
    })
  }, [refreshAssets, tab])

  React.useEffect(() => {
    if ((tab !== 'assets' && !settingsOpen) || !slug) return
    void window.electronAPI.projects.readMemory(workspaceRoot, slug).then(setMemory).catch((cause: unknown) => {
      toast.error('加载项目记忆失败', { description: cause instanceof Error ? cause.message : String(cause) })
    })
  }, [settingsOpen, slug, tab, workspaceRoot])

  const uploadFiles = async (files: File[]): Promise<void> => {
    if (!slug) return
    setBusy(true)
    try {
      for (const file of files) {
        await window.electronAPI.projects.uploadAsset(workspaceRoot, slug, {
          filename: file.name,
          base64: await readFileBase64(file),
        })
      }
      await refreshAssets()
      toast.success(`已上传 ${files.length} 个资产`)
    } catch (cause) {
      toast.error('上传资产失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const saveMemory = async (): Promise<void> => {
    if (!slug) return
    setBusy(true)
    try {
      await window.electronAPI.projects.writeMemory(workspaceRoot, slug, memory)
      toast.success('项目记忆已保存')
    } catch (cause) {
      toast.error('保存项目记忆失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async (): Promise<void> => {
    if (!slug || !settingsDraft.name.trim()) {
      toast.error('项目名称不能为空')
      return
    }
    setBusy(true)
    try {
      const updated = await window.electronAPI.projects.update(workspaceRoot, slug, buildProjectUpdate({
        ...settingsDraft,
        kanbanColumns: columns,
      }))
      onProjectChanged(updated)
      await refreshCwd()
      toast.success('项目设置已保存')
      setSettingsOpen(false)
    } catch (cause) {
      toast.error('保存项目设置失败', { description: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async (): Promise<void> => {
    if (!slug) return
    try {
      const updated = await window.electronAPI.projects.update(workspaceRoot, slug, {
        archivedAt: project.archivedAt ? undefined : Date.now(),
      })
      onProjectChanged(updated)
      toast.success(project.archivedAt ? '项目已取消归档' : '项目已归档')
    } catch (cause) {
      toast.error('更新归档状态失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const deleteProject = async (): Promise<void> => {
    if (!slug || !window.confirm(`确定删除项目「${project.name}」及其资产吗？`)) return
    try {
      await window.electronAPI.projects.delete(workspaceRoot, slug)
      onDeleted(project.id)
      toast.success('项目已删除')
    } catch (cause) {
      toast.error('删除项目失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const deleteAsset = async (filename: string): Promise<void> => {
    if (!slug) return
    try {
      await window.electronAPI.projects.deleteAsset(workspaceRoot, slug, filename)
      await refreshAssets()
      toast.success('资产已删除')
    } catch (cause) {
      toast.error('删除资产失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  const handleNewSession = async (): Promise<void> => {
    setCodeMainView('session')
    setActiveView('conversations')
    await createAgent({ projectId: project.id, draft: true })
  }

  const handleNewTask = (): void => {
    setPendingTaskEditor({ mode: 'create', initialProjectId: project.id })
    setWorkView('board')
  }

  const handleOpenBoard = (): void => {
    setWorkView('board')
  }

  const handleRelocate = async (): Promise<void> => {
    if (!slug) return
    const picked = await window.electronAPI.openFolderDialog()
    if (!picked?.path) return
    setBusy(true)
    try {
      const updated = await window.electronAPI.projects.relocateWorkingDirectory(
        workspaceRoot,
        slug,
        picked.path,
      )
      onProjectChanged(updated)
      await refreshCwd()
      toast.success('主目录已重新定位')
    } catch (cause) {
      toast.error('重新定位失败', {
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(false)
    }
  }

  const cwdLabel = cwdInfo ? formatEffectiveCwdSummary(cwdInfo) : (project.workingDirectory || '托管目录')

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col rounded-2xl bg-card shadow-sm">
      <header className="space-y-3 border-b border-border/50 p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{project.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{cwdLabel}</p>
            <p className="truncate text-xs text-muted-foreground">默认专家：{expertLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => { void handleNewSession() }}>
              <MessageSquare className="h-4 w-4" />
              新会话
            </Button>
            <Button size="sm" variant="secondary" onClick={handleNewTask}>
              <Plus className="h-4 w-4" />
              新建任务
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="项目更多操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[9999] w-44">
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { void handleRelocate() }}>
                  <FolderOpen className="h-4 w-4" />
                  重新定位主目录
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { void toggleArchive() }}>
                  {project.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  {project.archivedAt ? '取消归档' : '归档项目'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => { void deleteProject() }}
                >
                  <Trash2 className="h-4 w-4" />
                  删除项目
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {cwdInfo?.status === 'unavailable' && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>主目录不可用，运行 Agent / Task 前请重新定位。</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void handleRelocate() }}>
              重新定位
            </Button>
          </div>
        )}
      </header>

      <nav className="flex gap-1 border-b border-border/50 px-4 pt-2">
        {PROJECT_HOME_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'rounded-t-lg px-3 py-2 text-xs',
              tab === id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <OverviewCard title="进行中的任务">
              {activeTasks.length === 0 ? (
                <EmptyHint text="当前没有进行中的任务" />
              ) : (
                activeTasks.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={handleOpenBoard}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </button>
                ))
              )}
            </OverviewCard>
            <OverviewCard title="最近会话">
              {recentSessions.length === 0 ? (
                <EmptyHint text="还没有会话" />
              ) : (
                recentSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession?.(session.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  </button>
                ))
              )}
            </OverviewCard>
            <OverviewCard title="最近资料">
              {recentAssets.length === 0 ? (
                <EmptyHint text="暂无资料" />
              ) : (
                recentAssets.map((asset) => (
                  <div key={asset.filename} className="flex items-center gap-2 px-2 py-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{asset.filename}</span>
                  </div>
                ))
              )}
            </OverviewCard>
            <OverviewCard title="主目录状态">
              <p className="px-2 py-1 text-sm text-muted-foreground">{cwdLabel}</p>
              <p className="px-2 py-1 text-sm text-muted-foreground">默认专家：{expertLabel}</p>
            </OverviewCard>
          </div>
        )}

        {tab === 'sessions' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { void handleNewSession() }}>
                <Plus className="h-4 w-4" />
                新建会话
              </Button>
            </div>
            {projectSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpenSession?.(session.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-muted/35 px-3 py-3 text-left hover:bg-muted"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                <span className="text-[11px] text-muted-foreground">{session.sessionStatus ?? '待处理'}</span>
              </button>
            ))}
            {projectSessions.length === 0 && (
              <div className="rounded-xl bg-muted/35 p-10 text-center text-sm text-muted-foreground">
                该项目还没有会话
              </div>
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={handleOpenBoard}>
                <LayoutDashboard className="h-4 w-4" />
                打开看板
              </Button>
              <Button size="sm" onClick={handleNewTask}>
                <Plus className="h-4 w-4" />
                新建任务
              </Button>
            </div>
            {kanbanItems.length === 0 ? (
              <div className="rounded-xl bg-muted/35 p-10 text-center text-sm text-muted-foreground">
                该项目还没有任务
              </div>
            ) : (
              kanbanItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={handleOpenBoard}
                  className="flex w-full items-center gap-3 rounded-xl bg-muted/35 px-3 py-3 text-left hover:bg-muted"
                >
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.isProcessing ? '进行中' : item.columnId}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'assets' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                <Upload className="h-4 w-4" />
                上传资产
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    void uploadFiles(files)
                  }}
                />
              </label>
            </div>
            {assets.map((asset) => (
              <div key={asset.filename} className="flex items-center gap-3 rounded-xl bg-muted/35 px-3 py-2.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{asset.filename}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(asset.sizeBytes / 1024).toFixed(1)} KB · {asset.mimeType}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => { void deleteAsset(asset.filename) }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {assets.length === 0 && (
              <div className="rounded-xl bg-muted/35 p-10 text-center text-sm text-muted-foreground">
                暂无项目资产
              </div>
            )}

            <div className="space-y-3 border-t border-border/40 pt-4">
              <div>
                <h3 className="text-sm font-semibold">MEMORY.md</h3>
                <p className="text-xs text-muted-foreground">供项目内 Agent 共享的长期上下文。</p>
              </div>
              <Textarea
                value={memory}
                onChange={(event) => setMemory(event.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <Button disabled={busy || !slug} onClick={() => { void saveMemory() }}>
                <Save className="h-4 w-4" />
                保存记忆
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>项目设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium">
                项目名称
                <Input
                  value={settingsDraft.name}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium">
                强调色
                <Input
                  type="color"
                  value={settingsDraft.color || '#6366f1'}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, color: event.target.value }))}
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-xs font-medium">
              工作目录
              <Input
                value={settingsDraft.workingDirectory}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    workingDirectory: event.target.value,
                  }))
                }
                placeholder="绝对路径；留空则使用托管 workdir"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              默认专家
              <select
                value={settingsDraft.defaultExpertId}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    defaultExpertId: event.target.value,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-border/60 bg-background/40 px-3 py-1 text-sm"
              >
                <option value="">未设置</option>
                {expertOptions.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              描述
              <Input
                value={settingsDraft.description}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              项目说明
              <Textarea
                value={settingsDraft.details}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, details: event.target.value }))}
                rows={4}
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">自定义 Kanban 列</h3>
                  <p className="text-xs text-muted-foreground">留空时使用默认列。</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumns((current) => [...current, { id: `column-${Date.now()}`, name: '新列' }])}
                >
                  <Plus className="h-4 w-4" />
                  添加列
                </Button>
              </div>
              {columns.map((column, index) => (
                <div
                  key={column.id}
                  className="grid gap-2 rounded-xl bg-muted/35 p-3 sm:grid-cols-[1fr_120px_1fr_auto]"
                >
                  <Input
                    value={column.name}
                    onChange={(event) =>
                      setColumns((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="列名"
                  />
                  <Input
                    type="color"
                    value={column.color ?? '#64748b'}
                    onChange={(event) =>
                      setColumns((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, color: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    value={column.dropStatusId ?? ''}
                    onChange={(event) =>
                      setColumns((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, dropStatusId: event.target.value || undefined }
                            : item,
                        ),
                      )
                    }
                    placeholder="拖入时状态（可选）"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setColumns((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button disabled={busy || !slug} onClick={() => { void saveSettings() }}>
              <Save className="h-4 w-4" />
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function OverviewCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }): React.ReactElement {
  return <p className="px-2 py-3 text-sm text-muted-foreground">{text}</p>
}
