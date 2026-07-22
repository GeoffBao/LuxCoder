import * as React from 'react'
import { Archive, ArchiveRestore, FileText, MessageSquare, Plus, Save, Settings, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcodex/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { KanbanProject } from '../app-shell/kanban/types'
import { useExpertOptions } from '@/components/agent-experts/useExpertOptions'
import { buildProjectUpdate, getProjectSessions, type ProjectColumnDraft } from './project-view-model'

type ProjectTab = 'sessions' | 'assets' | 'memory' | 'settings'

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
      if (typeof result !== 'string') { reject(new Error('文件编码失败')); return }
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
  const [tab, setTab] = React.useState<ProjectTab>('sessions')
  const [assets, setAssets] = React.useState<ProjectAssetView[]>([])
  const [memory, setMemory] = React.useState('')
  const [busy, setBusy] = React.useState(false)
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

  const refreshAssets = React.useCallback(async (): Promise<void> => {
    if (!slug) return
    setAssets(await window.electronAPI.projects.listAssets(workspaceRoot, slug))
  }, [slug, workspaceRoot])

  React.useEffect(() => {
    if (tab !== 'assets') return
    void refreshAssets().catch((cause: unknown) => toast.error('加载资产失败', { description: cause instanceof Error ? cause.message : String(cause) }))
  }, [refreshAssets, tab])

  React.useEffect(() => {
    if (tab !== 'memory' || !slug) return
    void window.electronAPI.projects.readMemory(workspaceRoot, slug).then(setMemory).catch((cause: unknown) => {
      toast.error('加载项目记忆失败', { description: cause instanceof Error ? cause.message : String(cause) })
    })
  }, [slug, tab, workspaceRoot])

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
    if (!slug || !settingsDraft.name.trim()) { toast.error('项目名称不能为空'); return }
    setBusy(true)
    try {
      const updated = await window.electronAPI.projects.update(workspaceRoot, slug, buildProjectUpdate({
        ...settingsDraft,
        kanbanColumns: columns,
      }))
      onProjectChanged(updated)
      toast.success('项目设置已保存')
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

  const tabs: Array<{ id: ProjectTab; label: string; icon: typeof MessageSquare }> = [
    { id: 'sessions', label: 'Sessions', icon: MessageSquare },
    { id: 'assets', label: 'Assets', icon: Upload },
    { id: 'memory', label: 'Memory', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col rounded-2xl bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b border-border/50 p-4">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }} />
        <div className="min-w-0"><h2 className="truncate font-semibold">{project.name}</h2><p className="truncate text-xs text-muted-foreground">{project.description || '项目工作区、资产与长期记忆'}</p></div>
      </header>
      <nav className="flex gap-1 border-b border-border/50 px-4 pt-2">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={cn('inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs', tab === id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'sessions' && (
          <div className="space-y-2">
            {projectSessions.map((session) => <button key={session.id} type="button" onClick={() => onOpenSession?.(session.id)} className="flex w-full items-center gap-3 rounded-xl bg-muted/35 px-3 py-3 text-left hover:bg-muted"><MessageSquare className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{session.title}</span><span className="text-[11px] text-muted-foreground">{session.sessionStatus ?? '待处理'}</span></button>)}
            {projectSessions.length === 0 && <div className="rounded-xl bg-muted/35 p-10 text-center text-sm text-muted-foreground">该项目还没有会话</div>}
          </div>
        )}
        {tab === 'assets' && (
          <div className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Upload className="h-4 w-4" />上传资产<input type="file" multiple className="hidden" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void uploadFiles(files) }} /></label>
            {assets.map((asset) => <div key={asset.filename} className="flex items-center gap-3 rounded-xl bg-muted/35 px-3 py-2.5"><FileText className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="truncate text-sm">{asset.filename}</div><div className="text-[11px] text-muted-foreground">{(asset.sizeBytes / 1024).toFixed(1)} KB · {asset.mimeType}</div></div><Button variant="ghost" size="icon-sm" onClick={() => void deleteAsset(asset.filename)}><Trash2 className="h-4 w-4" /></Button></div>)}
            {assets.length === 0 && <div className="rounded-xl bg-muted/35 p-10 text-center text-sm text-muted-foreground">暂无项目资产</div>}
          </div>
        )}
        {tab === 'memory' && <div className="space-y-3"><div><h3 className="text-sm font-semibold">MEMORY.md</h3><p className="text-xs text-muted-foreground">供项目内 Agent 共享的长期上下文。</p></div><Textarea value={memory} onChange={(event) => setMemory(event.target.value)} rows={18} className="font-mono text-xs" /><Button disabled={busy || !slug} onClick={() => void saveMemory()}><Save className="h-4 w-4" />保存记忆</Button></div>}
        {tab === 'settings' && (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">项目名称<Input value={settingsDraft.name} onChange={(event) => setSettingsDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="space-y-1.5 text-xs font-medium">强调色<Input type="color" value={settingsDraft.color || '#6366f1'} onChange={(event) => setSettingsDraft((current) => ({ ...current, color: event.target.value }))} /></label></div>
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
                placeholder="绝对路径；新会话可继承"
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
                className="flex h-9 w-full rounded-md border border-border/60 bg-background/40 px-3 py-1 text-sm shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
              >
                <option value="">未设置</option>
                {expertOptions.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] font-normal text-muted-foreground">任务未指定专家时，跑节点会注入该专家身份核</p>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">描述<Input value={settingsDraft.description} onChange={(event) => setSettingsDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="block space-y-1.5 text-xs font-medium">项目说明<Textarea value={settingsDraft.details} onChange={(event) => setSettingsDraft((current) => ({ ...current, details: event.target.value }))} rows={5} /></label>
            <div className="space-y-2"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">自定义 Kanban 列</h3><p className="text-xs text-muted-foreground">留空时使用默认列。</p></div><Button variant="outline" size="sm" onClick={() => setColumns((current) => [...current, { id: `column-${Date.now()}`, name: '新列' }])}><Plus className="h-4 w-4" />添加列</Button></div>{columns.map((column, index) => <div key={column.id} className="grid gap-2 rounded-xl bg-muted/35 p-3 sm:grid-cols-[1fr_120px_1fr_auto]"><Input value={column.name} onChange={(event) => setColumns((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="列名" /><Input type="color" value={column.color ?? '#64748b'} onChange={(event) => setColumns((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))} /><Input value={column.dropStatusId ?? ''} onChange={(event) => setColumns((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dropStatusId: event.target.value || undefined } : item))} placeholder="拖入时状态（可选）" /><Button variant="ghost" size="icon" onClick={() => setColumns((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy || !slug} onClick={() => void saveSettings()}><Save className="h-4 w-4" />保存设置</Button><Button variant="outline" onClick={() => void toggleArchive()}>{project.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{project.archivedAt ? '取消归档' : '归档项目'}</Button><Button variant="destructive" onClick={() => void deleteProject()}><Trash2 className="h-4 w-4" />删除项目</Button></div>
          </div>
        )}
      </div>
    </section>
  )
}
