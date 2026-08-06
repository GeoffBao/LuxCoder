import { useAtomValue } from 'jotai'
import { Archive, Bot, GitBranch, MessageSquare } from 'lucide-react'
import * as React from 'react'
import { agentSessionsAtom } from '@/atoms/agent-atoms'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import { formatRelativeUpdatedAt } from '../AgentSessionItem'
import { collectTaskFamilySessions } from './task-family-model'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export interface TaskFamilySheetProps {
  taskSlug: string
  orchestratorSessionId?: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 点击某条家族会话：打开该会话 */
  onOpenSession: (sessionId: string) => void
}

/**
 * 任务家族会话面板
 *
 * 对齐 craft 的"一个任务的全部会话"心智：同一 taskSlug 下的 orchestrator + 子任务 +
 * 历史 run 关联会话统一列出，每条可点击打开。纯渲染层聚合，零新增 IPC。
 */
export function TaskFamilySheet({
  taskSlug,
  orchestratorSessionId,
  title,
  open,
  onOpenChange,
  onOpenSession,
}: TaskFamilySheetProps): React.ReactElement {
  const sessions = useAtomValue(agentSessionsAtom)
  const family = React.useMemo(
    () => collectTaskFamilySessions(sessions, taskSlug, orchestratorSessionId),
    [sessions, taskSlug, orchestratorSessionId],
  )
  const activeCount = family.filter((entry) => !entry.session.archived).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="z-[9999] w-[min(92vw,420px)] overflow-y-auto p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b border-border/50 px-4 py-3">
          <SheetTitle className="text-sm font-semibold">任务会话</SheetTitle>
          <SheetDescription asChild>
            <div className="text-xs text-muted-foreground">
              <span className="line-clamp-1">{title}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/70">{taskSlug}</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-3">
          {family.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
              暂无关联会话
            </div>
          ) : (
            <div className="space-y-1">
              {family.map((entry) => {
                const session = entry.session
                const updated = session.updatedAt ?? session.createdAt
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/70',
                      session.archived && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md',
                        entry.isOrchestrator ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                      title={entry.isOrchestrator ? '编排会话' : entry.isSubtask ? '子任务会话' : '关联会话'}
                    >
                      {entry.isOrchestrator ? <Bot className="size-3.5" /> : entry.isSubtask ? <GitBranch className="size-3.5" /> : <MessageSquare className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-foreground">{session.title || '未命名会话'}</span>
                        {session.archived && <Archive className="size-3 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        {session.sessionStatus && <StatusBadge status={session.sessionStatus} />}
                        {typeof updated === 'number' && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeUpdatedAt(updated, Date.now())}
                          </span>
                        )}
                        {typeof session.messageCount === 'number' && session.messageCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <MessageSquare className="size-2.5" />
                            {session.messageCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground/70">
            {family.length > 0
              ? `${family.length} 个关联会话 · ${activeCount} 个未归档`
              : '该任务暂未产生可追溯会话（如只保存了 spec 尚未运行）。'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
