import * as React from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { estimateTokenCount, MEMORY_TOKEN_CAP } from '@luxcoder/shared/projects'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { KanbanProject } from '@/components/app-shell/kanban/types'

interface ProjectKnowledgeTabProps {
  workspaceRoot: string
  project: KanbanProject
  onError: (message: string | null) => void
}

export function ProjectKnowledgeTab({ workspaceRoot, project, onError }: ProjectKnowledgeTabProps): React.ReactElement {
  const slug = project.slug
  const [memory, setMemory] = React.useState('')
  const [loaded, setLoaded] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!slug) return
    let cancelled = false
    window.electronAPI.projects.readMemory(workspaceRoot, slug)
      .then((content) => { if (!cancelled) { setMemory(content); setLoaded(true); setDirty(false) } })
      .catch(() => { if (!cancelled) { setMemory(''); setLoaded(true) } })
    return () => { cancelled = true }
  }, [workspaceRoot, slug])

  const handleSave = async (): Promise<void> => {
    if (!slug || busy) return
    setBusy(true)
    try {
      // Allow clearing: write empty string to save
      await window.electronAPI.projects.writeMemory(workspaceRoot, slug, memory)
      setDirty(false)
      onError(null)
      toast.success('Project Knowledge 已保存')
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause)
      onError(msg)
      toast.error('保存失败', { description: msg })
    } finally {
      setBusy(false)
    }
  }

  const tokens = React.useMemo(() => estimateTokenCount(memory), [memory])
  const overCap = tokens > MEMORY_TOKEN_CAP

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Project Knowledge</h2>
            <p className="text-xs text-muted-foreground">
              用于记录工程架构、技术决策、常用命令和注意事项。Agent 在该项目执行任务时会自动引用。
            </p>
          </div>
          <Button size="sm" disabled={!dirty || busy} onClick={() => void handleSave()}>
            <Save className="mr-1 h-3.5 w-3.5" />
            保存
          </Button>
        </div>
        <Textarea
          value={memory}
          onChange={(e) => { setMemory(e.target.value); setDirty(true) }}
          placeholder="例如：## 架构&#10;- 使用 React + TypeScript&#10;- API 网关地址: ...&#10;&#10;## 常用命令&#10;- bun run dev&#10;- bun test&#10;&#10;## 注意事项&#10;..."
          className="min-h-[300px] w-full resize-y font-mono text-sm"
          disabled={busy}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Markdown 格式 · 约 {tokens} tokens（上限 {MEMORY_TOKEN_CAP}）</span>
          {overCap && <span className="font-medium text-destructive">超出推荐上限</span>}
          {dirty && <span className="font-medium text-amber-500">未保存</span>}
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 px-1">
        <p><strong>提示</strong>：该内容存储在 <code>projects/{slug}/MEMORY.md</code> 中，可在任意编辑器中直接编辑。</p>
        <p><strong>Workspace 跨项目规则与偏好</strong>请写入 Workspace Context（Agent 技能 → Context），不要写在这里。</p>
      </div>
    </div>
  )
}
