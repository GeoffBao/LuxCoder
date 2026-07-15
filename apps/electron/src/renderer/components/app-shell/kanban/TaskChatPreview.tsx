import { MessageSquareText } from 'lucide-react'
import { ModelChip } from './ModelChip'
import { StatusBadge } from './StatusBadge'
import { SubtaskRow } from './SubtaskRow'
import type { KanbanSubtask } from './types'

interface TaskChatPreviewProps {
  title: string
  status?: string
  model?: string
  userMessage: string
  assistantIntro?: string
  subtasks?: KanbanSubtask[]
}

export function TaskChatPreview({
  title,
  status,
  model,
  userMessage,
  assistantIntro,
  subtasks = [],
}: TaskChatPreviewProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <MessageSquareText className="h-4 w-4 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
        <StatusBadge status={status} />
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="ml-auto max-w-[80%] rounded-2xl bg-muted px-3.5 py-2 text-sm">{userMessage}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>任务编排</span><ModelChip model={model} /></div>
        {assistantIntro && <p className="text-sm leading-6">{assistantIntro}</p>}
        {subtasks.length > 0 && <div className="rounded-xl bg-card p-3 shadow-sm">{subtasks.map((subtask) => <SubtaskRow key={subtask.id} subtask={subtask} />)}</div>}
      </div>
    </div>
  )
}
