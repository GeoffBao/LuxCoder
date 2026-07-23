/**
 * ChatHeader - 对话头部
 *
 * 复用 SessionHeader，右侧插入 Chat 特有的操作：
 * 系统提示词选择器 + 置顶 + 并排模式切换。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { Pin, Columns2 } from 'lucide-react'
import { conversationsAtom } from '@/atoms/chat-atoms'
import { useConversationParallelMode } from '@/hooks/useConversationSettings'
import type { ConversationMeta } from '@luxcoder/shared'
import { SystemPromptSelector } from './SystemPromptSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SessionHeader } from '@/components/tabs/SessionHeader'
import { cn } from '@/lib/utils'

interface ChatHeaderProps {
  conversation: ConversationMeta | null
}

export function ChatHeader({ conversation }: ChatHeaderProps): React.ReactElement | null {
  const setConversations = useSetAtom(conversationsAtom)
  const [parallelMode, setParallelMode] = useConversationParallelMode()

  if (!conversation) return null

  const handleRename = async (title: string): Promise<void> => {
    const updated = await window.electronAPI.updateConversationTitle(conversation.id, title)
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    )
  }

  return (
    <SessionHeader
      title={conversation.title}
      onRename={handleRename}
      actions={
        <>
          <SystemPromptSelector />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', conversation.pinned && 'bg-accent text-accent-foreground')}
                onClick={async () => {
                  try {
                    const updated = await window.electronAPI.togglePinConversation(conversation.id)
                    setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                  } catch (error) {
                    console.error('[ChatHeader] 切换置顶失败:', error)
                  }
                }}
              >
                <Pin className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{conversation.pinned ? '取消置顶' : '置顶对话'}</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', parallelMode && 'bg-accent text-accent-foreground')}
                onClick={() => setParallelMode(!parallelMode)}
              >
                <Columns2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{parallelMode ? '关闭并排模式' : '并排模式'}</p></TooltipContent>
          </Tooltip>
        </>
      }
    />
  )
}
