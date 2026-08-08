/**
 * ImportSkillDialog — 从其他空间批量导入 Skill
 *
 * 列出其他空间可用的 Skill（自动过滤已安装的同名项），
 * 勾选多个后一键批量导入到当前空间。导入完成后通过 toast 反馈结果。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles, FolderOpen, FileArchive, X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsCard } from '@/components/settings/primitives'
import { SectionTabs } from '@/components/ui/section-tabs'
import { cn } from '@/lib/utils'
import type { BulkImportSkillsResult, OtherWorkspaceSkillsGroup, SkillMeta } from '@yoda/shared'

function getFailureDescription(result: BulkImportSkillsResult): string | undefined {
  const failed = result.items.filter((item) => item.status === 'failed')
  if (failed.length === 0) return undefined

  const visible = failed.slice(0, 3).map((item) => `${item.slug}: ${item.reason ?? '未知原因'}`)
  const remaining = failed.length - visible.length
  return `${visible.join('；')}${remaining > 0 ? `；另有 ${remaining} 个失败项` : ''}`
}

interface ImportSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceSlug: string
  installedSkills: SkillMeta[]
  onImported: () => void
}

export function ImportSkillDialog({
  open,
  onOpenChange,
  workspaceSlug,
  installedSkills,
  onImported,
}: ImportSkillDialogProps): React.ReactElement {
  // 导入方式：从其他空间 / 从本地文件
  const [tab, setTab] = React.useState<'workspace' | 'local'>('workspace')
  const [localSource, setLocalSource] = React.useState<{ kind: 'zip' | 'folder'; path: string } | null>(null)
  const [localImporting, setLocalImporting] = React.useState(false)
  const [localResult, setLocalResult] = React.useState<BulkImportSkillsResult | null>(null)
  const localOperationRef = React.useRef(0)

  // 对话框关闭时重置本地导入状态
  React.useEffect(() => {
    if (open) return
    localOperationRef.current += 1
    setLocalImporting(false)
    setLocalResult(null)
    setLocalSource(null)
  }, [open])

  const [otherWorkspaces, setOtherWorkspaces] = React.useState<OtherWorkspaceSkillsGroup[]>([])
  const [selectedWorkspaceSlug, setSelectedWorkspaceSlug] = React.useState('')
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set())
  const [loadingWorkspaces, setLoadingWorkspaces] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const requestIdRef = React.useRef(0)
  const importOperationRef = React.useRef(0)
  const dialogScopeRef = React.useRef({ open, workspaceSlug })
  dialogScopeRef.current = { open, workspaceSlug }

  React.useEffect(() => {
    importOperationRef.current += 1
    setImporting(false)
  }, [workspaceSlug])

  React.useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!open || !workspaceSlug) {
      setOtherWorkspaces([])
      setSelectedWorkspaceSlug('')
      setSelectedKeys(new Set())
      setLoadingWorkspaces(false)
      return
    }

    // 每次打开或切换目标项目都丢弃旧列表，避免用户看到并操作过期来源。
    setOtherWorkspaces([])
    setSelectedWorkspaceSlug('')
    setSelectedKeys(new Set())
    setLoadingWorkspaces(true)

    void (async () => {
      try {
        const groups = await window.electronAPI.getOtherWorkspaceSkills(workspaceSlug)
        if (requestIdRef.current !== requestId) return
        setOtherWorkspaces(groups)
      } catch (error) {
        if (requestIdRef.current !== requestId) return
        console.error('[Agent 技能] 加载其他工作区 Skill 失败:', error)
        setOtherWorkspaces([])
        toast.error('加载其他空间 Skill 失败', {
          description: error instanceof Error ? error.message : '未知错误',
        })
      } finally {
        if (requestIdRef.current === requestId) setLoadingWorkspaces(false)
      }
    })()

    return () => {
      // 让尚未完成的请求失效，防止旧工作区响应覆盖新状态。
      if (requestIdRef.current === requestId) requestIdRef.current += 1
    }
  }, [open, workspaceSlug])

  const installedSlugs = React.useMemo(() => new Set(installedSkills.map((s) => s.slug)), [installedSkills])

  const availableWorkspaces = React.useMemo(
    () =>
      otherWorkspaces
        .map((w) => ({ ...w, skills: w.skills.filter((s) => !installedSlugs.has(s.slug)) }))
        .filter((w) => w.skills.length > 0),
    [otherWorkspaces, installedSlugs],
  )

  // 来源空间下拉默认选中第一个可用空间（保持当前值仍有效时不切换）
  React.useEffect(() => {
    if (!open || loadingWorkspaces || availableWorkspaces.length === 0) {
      if (!loadingWorkspaces) setSelectedWorkspaceSlug('')
      return
    }
    setSelectedWorkspaceSlug((current) =>
      availableWorkspaces.some((w) => w.workspaceSlug === current)
        ? current
        : availableWorkspaces[0]!.workspaceSlug,
    )
  }, [availableWorkspaces, loadingWorkspaces, open])

  const selectedWorkspace = React.useMemo(
    () => availableWorkspaces.find((w) => w.workspaceSlug === selectedWorkspaceSlug) ?? null,
    [availableWorkspaces, selectedWorkspaceSlug],
  )

  const selectedCount = React.useMemo(() => {
    if (!selectedWorkspace) return 0
    return selectedWorkspace.skills.filter((s) =>
      selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${s.slug}`),
    ).length
  }, [selectedWorkspace, selectedKeys])

  const toggleSelection = (sourceSlug: string, skillSlug: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      const key = `${sourceSlug}/${skillSlug}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleWorkspaceChange = (value: string): void => {
    setSelectedWorkspaceSlug(value)
    setSelectedKeys(new Set())
  }

  const handleDialogOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      importOperationRef.current += 1
      setImporting(false)
    }
    onOpenChange(nextOpen)
  }

  const isActiveImportOperation = (operationId: number, targetWorkspaceSlug: string): boolean => {
    return (
      importOperationRef.current === operationId &&
      dialogScopeRef.current.open &&
      dialogScopeRef.current.workspaceSlug === targetWorkspaceSlug
    )
  }

  const handleImport = async (): Promise<void> => {
    if (!workspaceSlug || importing || !selectedWorkspace || selectedCount === 0) return
    const operationId = ++importOperationRef.current
    const targetWorkspaceSlug = workspaceSlug
    const selections = selectedWorkspace.skills
      .filter((s) => selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${s.slug}`))
      .map((s) => ({ sourceSlug: selectedWorkspace.workspaceSlug, skillSlug: s.slug }))
    setImporting(true)
    try {
      const importResult = await window.electronAPI.batchImportSkillsFromWorkspaces(targetWorkspaceSlug, selections)
      if (!isActiveImportOperation(operationId, targetWorkspaceSlug)) return

      const failureDescription = getFailureDescription(importResult)
      if (importResult.imported > 0) {
        onImported()
        const detail =
          importResult.skipped > 0 && importResult.failed > 0
            ? `（跳过 ${importResult.skipped} 个、失败 ${importResult.failed} 个）`
            : importResult.skipped > 0
              ? `（跳过 ${importResult.skipped} 个）`
              : importResult.failed > 0
                ? `（失败 ${importResult.failed} 个）`
                : ''
        toast.success(`已导入 ${importResult.imported} 个 Skill${detail}`, {
          description: failureDescription,
        })
        handleDialogOpenChange(false)
      } else if (importResult.failed === 0) {
        toast.info(`没有新导入的 Skill，已跳过 ${importResult.skipped} 个同名项`)
      } else {
        toast.error(`导入失败 ${importResult.failed} 个${importResult.skipped > 0 ? `，跳过 ${importResult.skipped} 个` : ''}`, {
          description: failureDescription,
        })
      }
    } catch (error) {
      if (!isActiveImportOperation(operationId, targetWorkspaceSlug)) return
      console.error('[Agent 技能] 批量导入失败:', error)
      toast.error('批量导入失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      if (isActiveImportOperation(operationId, targetWorkspaceSlug)) setImporting(false)
    }
  }

  // ── 从本地 zip / 文件夹导入 ────────────────────────────

  const handlePickLocalSource = async (): Promise<void> => {
    const picked = await window.electronAPI.pickLocalSkillSource()
    if (!picked) return
    setLocalSource(picked)
    setLocalResult(null)
  }

  const handleLocalImport = async (): Promise<void> => {
    if (!workspaceSlug || !localSource || localImporting) return
    const operationId = ++localOperationRef.current
    setLocalImporting(true)
    try {
      const result = await window.electronAPI.importSkillsFromLocal(workspaceSlug, localSource.path)
      if (operationId !== localOperationRef.current) return
      setLocalResult(result)
      if (result.imported > 0) {
        onImported()
        const detail =
          result.skipped > 0 || result.failed > 0
            ? `（跳过 ${result.skipped} 个${result.failed > 0 ? `、失败 ${result.failed} 个` : ''}）`
            : ''
        toast.success(`已从本地导入 ${result.imported} 个 Skill${detail}`, {
          description: getFailureDescription(result),
        })
      } else if (result.failed > 0) {
        toast.error(`本地导入失败 ${result.failed} 个${result.skipped > 0 ? `，跳过 ${result.skipped} 个` : ''}`, {
          description: getFailureDescription(result),
        })
      } else {
        toast.info(`没有新导入的 Skill，已跳过 ${result.skipped} 个同名项`)
      }
    } catch (error) {
      if (operationId !== localOperationRef.current) return
      console.error('[Agent 技能] 本地导入失败:', error)
      toast.error('本地导入失败', { description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      if (operationId === localOperationRef.current) setLocalImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle>导入 Skill</DialogTitle>
          <DialogDescription>
            从其他空间批量导入，或从本地 zip 压缩包 / 文件夹导入到当前空间。已安装的同名 Skill 会自动跳过。
          </DialogDescription>
        </DialogHeader>

        {/* 导入方式切换：从其他空间 / 从本地文件 */}
        <div className="px-6 pb-4">
          <SectionTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'workspace', label: '从其他空间' },
              { value: 'local', label: '从本地文件' },
            ]}
          />
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-6">
          {tab === 'workspace' ? (
            <>
          {loadingWorkspaces ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" />
              正在加载其他空间 Skill...
            </div>
          ) : availableWorkspaces.length === 0 ? (
            <SettingsCard divided={false}>
              <div className="py-10 text-center text-sm text-muted-foreground">
                没有可导入的 Skill。其他空间暂无 Skill，或者它们都已经安装到当前空间了。
              </div>
            </SettingsCard>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">选择来源空间</div>
              <Select value={selectedWorkspaceSlug} onValueChange={handleWorkspaceChange} disabled={loadingWorkspaces || importing}>
                <SelectTrigger>
                  <SelectValue placeholder="选择来源空间" />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((w) => (
                    <SelectItem key={w.workspaceSlug} value={w.workspaceSlug}>
                      {w.workspaceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedWorkspace ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="truncate">{selectedWorkspace.workspaceName}</span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                  {selectedWorkspace.skills.length} 个
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedWorkspace.skills.map((skill) => {
                  const checked = selectedKeys.has(`${selectedWorkspace.workspaceSlug}/${skill.slug}`)
                  return (
                    <SettingsCard key={skill.slug} divided={false} className="overflow-hidden">
                      <button
                        type="button"
                        aria-pressed={checked}
                        aria-label={`${skill.name}${checked ? '，已选中' : '，未选中'}`}
                        disabled={importing}
                        onClick={() => toggleSelection(selectedWorkspace.workspaceSlug, skill.slug)}
                        className={cn(
                          'flex h-full w-full flex-col gap-3 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                          checked ? 'bg-accent/40' : 'hover:bg-accent/30',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className={cn(
                              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border/80 text-transparent',
                            )}
                          >
                            <Check size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">{skill.name}</span>
                              {skill.version ? (
                                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  v{skill.version}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{skill.slug}</div>
                          </div>
                          <Sparkles size={16} className="shrink-0 text-amber-500" />
                        </div>
                        <div className="line-clamp-3 min-h-[40px] text-sm leading-6 text-muted-foreground">
                          {skill.description ?? '暂无描述'}
                        </div>
                      </button>
                    </SettingsCard>
                  )
                })}
              </div>
            </>
          ) : null}
            </>
          ) : (
            /* 从本地文件导入：zip 压缩包或文件夹 */
            <div className="space-y-4">
              <SettingsCard divided={false} className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-medium text-foreground">选择本地 Skill 源</div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    支持 .zip 压缩包或文件夹，包内任意含 SKILL.md 的目录都会识别为一个 Skill（单 / 多 Skill 均可）；
                    与当前空间同名的 Skill 会自动跳过。
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handlePickLocalSource()} disabled={localImporting}>
                      <FolderOpen size={13} className="mr-1.5" />
                      选择 zip 或文件夹
                    </Button>
                    {localSource && (
                      <>
                        <span
                          className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-foreground/80"
                          title={localSource.path}
                        >
                          {localSource.kind === 'zip'
                            ? <FileArchive size={13} className="shrink-0 text-foreground/50" />
                            : <FolderOpen size={13} className="shrink-0 text-foreground/50" />}
                          <span className="truncate">{localSource.path}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="清除选择"
                          onClick={() => {
                            setLocalSource(null)
                            setLocalResult(null)
                          }}
                        >
                          <X size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </SettingsCard>

              {localResult ? (
                <SettingsCard divided={false} className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Upload size={13} className="text-foreground/50" />
                    导入结果（成功 {localResult.imported} · 跳过 {localResult.skipped} · 失败 {localResult.failed}）
                  </div>
                  {localResult.items.length > 0 ? (
                    <div className="space-y-1.5">
                      {localResult.items.map((item) => (
                        <div key={item.slug} className="flex items-center gap-2 text-xs">
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                              item.status === 'imported' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                              item.status === 'skipped' && 'bg-foreground/[0.06] text-foreground/60',
                              item.status === 'failed' && 'bg-destructive/10 text-destructive',
                            )}
                          >
                            {item.status === 'imported' ? '已导入' : item.status === 'skipped' ? '已跳过' : '失败'}
                          </span>
                          <span className="truncate font-medium text-foreground/85">{item.name}</span>
                          {item.reason ? <span className="truncate text-muted-foreground">{item.reason}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">未识别到任何 Skill</div>
                  )}
                </SettingsCard>
              ) : null}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-6 py-4">
          {tab === 'workspace' ? (
            <>
              <span className="text-xs text-muted-foreground">
                {loadingWorkspaces
                  ? '正在加载其他空间 Skill...'
                  : '勾选要导入的 Skill，已安装的同名 Skill 会自动过滤'}
              </span>
              <Button size="sm" onClick={() => void handleImport()} disabled={loadingWorkspaces || importing || selectedCount === 0}>
                {importing ? <Loader2 size={13} className="animate-spin" /> : null}
                {importing ? '导入中...' : `一键导入所选（${selectedCount}）`}
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {localSource
                  ? `已选择：${localSource.kind === 'zip' ? '压缩包' : '文件夹'}`
                  : '选择 zip 压缩包或文件夹后再导入'}
              </span>
              <Button
                size="sm"
                onClick={() => void handleLocalImport()}
                disabled={!localSource || localImporting}
              >
                {localImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} className="mr-1" />}
                {localImporting ? '导入中...' : '导入本地 Skill'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
