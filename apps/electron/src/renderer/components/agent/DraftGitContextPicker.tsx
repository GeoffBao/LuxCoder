import * as React from 'react'
import { useAtomValue } from 'jotai'
import type { GitBranchInfo, GitExecutionMode } from '@luxcoder/shared'
import { GitBranch, Layers } from 'lucide-react'
import { serverKanbanProjectsAtom } from '@/atoms/project-atoms'
import { cn } from '@/lib/utils'
import {
  filterGitBranches,
  formatGitBranchSubtitle,
  getInitialGitExecutionMode,
  getProjectGitModeStorageKey,
} from './git-context-picker-model'

export interface DraftGitContextSelection {
  repoPath: string
  executionMode: GitExecutionMode
  branch: string
  newBranchName?: string
  slug?: string
}

export interface DraftGitContextPickerProps {
  sessionId: string
  projectId?: string
  isDraft: boolean
  className?: string
  onSelectionChange: (selection: DraftGitContextSelection | null) => void
}

export function DraftGitContextPicker({
  sessionId,
  projectId,
  isDraft,
  className,
  onSelectionChange,
}: DraftGitContextPickerProps): React.ReactElement | null {
  const projects = useAtomValue(serverKanbanProjectsAtom)
  const project = projectId ? projects.find((candidate) => candidate.id === projectId) : undefined
  const repoPath = project?.workingDirectory
  const [isGitRepo, setIsGitRepo] = React.useState(false)
  const [branches, setBranches] = React.useState<GitBranchInfo[]>([])
  const [mode, setMode] = React.useState<GitExecutionMode>('local')
  const [branch, setBranch] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [newBranchName, setNewBranchName] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!projectId) {
      setMode('local')
      return
    }
    const remembered = window.localStorage.getItem(getProjectGitModeStorageKey(projectId)) ?? undefined
    setMode(getInitialGitExecutionMode(remembered))
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    setBranches([])
    setBranch('')
    setIsGitRepo(false)
    setNewBranchName('')
    onSelectionChange(null)
    if (!isDraft || !repoPath) return

    setLoading(true)
    window.electronAPI.getGitRepoStatus(repoPath)
      .then(async (status) => {
        if (cancelled) return
        if (!status?.isRepo) {
          setIsGitRepo(false)
          onSelectionChange(null)
          return
        }
        setIsGitRepo(true)
        const nextBranches = await window.electronAPI.listGitBranches({ repoPath, sessionId })
        if (cancelled) return
        setBranches(nextBranches)
        const initialBranch = nextBranches.find((candidate) => candidate.current)?.name
          ?? status.branch
          ?? nextBranches[0]?.name
          ?? ''
        setBranch(initialBranch)
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[DraftGitContextPicker] 读取 Git 上下文失败:', error)
          setIsGitRepo(false)
          onSelectionChange(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isDraft, onSelectionChange, repoPath, sessionId])

  React.useEffect(() => {
    if (!isDraft || !repoPath || !isGitRepo || !branch) {
      onSelectionChange(null)
      return
    }
    onSelectionChange({
      repoPath,
      executionMode: mode,
      branch,
      newBranchName: newBranchName.trim() || undefined,
      slug: newBranchName.trim() || undefined,
    })
  }, [branch, isDraft, isGitRepo, mode, newBranchName, onSelectionChange, repoPath])

  const updateMode = React.useCallback((nextMode: GitExecutionMode) => {
    setMode(nextMode)
    if (projectId) {
      window.localStorage.setItem(getProjectGitModeStorageKey(projectId), nextMode)
    }
  }, [projectId])

  if (!isDraft || !repoPath || (!isGitRepo && !loading)) return null

  const visibleBranches = filterGitBranches(branches, query)
  const selectedBranch = branches.find((candidate) => candidate.name === branch)

  return (
    <div className={cn('px-3 pb-2 flex flex-wrap items-center gap-2 text-xs', className)}>
      <div className="inline-flex overflow-hidden rounded-md border border-border/70 bg-background/80">
        {(['local', 'worktree'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cn(
              'px-2.5 py-1 transition-colors',
              mode === candidate ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
            )}
            onClick={() => updateMode(candidate)}
          >
            {candidate === 'local' ? 'Local' : 'Worktree'}
          </button>
        ))}
      </div>

      <label className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2 py-1 text-muted-foreground">
        <GitBranch className="size-3.5" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索分支"
          className="w-24 bg-transparent outline-none placeholder:text-muted-foreground/50"
        />
      </label>

      <label className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2 py-1 text-muted-foreground">
        <Layers className="size-3.5" />
        <select
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          className="max-w-48 bg-transparent outline-none text-foreground"
          disabled={loading || visibleBranches.length === 0}
        >
          {visibleBranches.map((candidate) => (
            <option key={candidate.ref} value={candidate.name}>
              {candidate.current ? '✓ ' : ''}{candidate.name}{candidate.checkedOutPath ? ' · occupied' : ''}
            </option>
          ))}
        </select>
      </label>

      {mode === 'worktree' && (
        <input
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
          placeholder="可选：新分支名"
          className="h-7 w-36 rounded-md border border-border/70 bg-background/80 px-2 text-xs outline-none placeholder:text-muted-foreground/50"
        />
      )}

      {selectedBranch && (
        <span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
          {formatGitBranchSubtitle(selectedBranch)}
        </span>
      )}
    </div>
  )
}
