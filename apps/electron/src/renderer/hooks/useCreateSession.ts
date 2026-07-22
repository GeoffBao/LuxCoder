/**
 * useCreateSession — 共享的创建 Chat 对话 / Agent 会话逻辑
 *
 * 从 LeftSidebar 提取，供 WelcomeView 模式切换和侧边栏共同使用。
 */

import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { AgentSessionMeta } from '@luxcoder/shared'
import {
  conversationsAtom,
  selectedModelAtom,
} from '@/atoms/chat-atoms'
import {
  agentSessionsAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  agentSessionChannelMapAtom,
  agentSessionModelMapAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { promptConfigAtom, selectedPromptIdAtom } from '@/atoms/system-prompt-atoms'
import { draftSessionIdsAtom } from '@/atoms/draft-session-atoms'
import {
  resolveCreateAgentWorkspaceId,
  shouldMarkDraft,
  type CreateAgentSessionFlowInput,
} from './create-agent-session-flow'
import { useOpenSession } from './useOpenSession'

export type CreateSessionOptions = CreateAgentSessionFlowInput

interface CreateSessionActions {
  /** 创建新 Chat 对话并打开标签页 */
  createChat: (options?: CreateSessionOptions) => Promise<string | undefined>
  /** 创建新 Agent 会话并打开标签页（默认 Draft；可绑定 projectId） */
  createAgent: (options?: CreateSessionOptions) => Promise<string | undefined>
}

export function useCreateSession(): CreateSessionActions {
  const openSession = useOpenSession()
  const setActiveView = useSetAtom(activeViewAtom)
  const setDraftSessionIds = useSetAtom(draftSessionIdsAtom)

  // Chat
  const setConversations = useSetAtom(conversationsAtom)
  const selectedModel = useAtomValue(selectedModelAtom)
  const promptConfig = useAtomValue(promptConfigAtom)
  const setSelectedPromptId = useSetAtom(selectedPromptIdAtom)

  // Agent
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const setSessionChannelMap = useSetAtom(agentSessionChannelMapAtom)
  const setSessionModelMap = useSetAtom(agentSessionModelMapAtom)

  const createChat = async (options?: CreateSessionOptions): Promise<string | undefined> => {
    try {
      const meta = await window.electronAPI.createConversation(
        undefined,
        selectedModel?.modelId,
        selectedModel?.channelId,
      )
      setConversations((prev) => [meta, ...prev])
      openSession('chat', meta.id, meta.title)
      setActiveView('conversations')
      if (promptConfig.defaultPromptId) {
        setSelectedPromptId(promptConfig.defaultPromptId)
      }
      // Chat 仍需显式 draft: true，避免误伤历史入口
      if (options?.draft) {
        setDraftSessionIds((prev: Set<string>) => { const next = new Set(prev); next.add(meta.id); return next })
      }
      return meta.id
    } catch (error) {
      console.error('[创建会话] 创建 Chat 对话失败:', error)
      return undefined
    }
  }

  const createAgent = async (options?: CreateSessionOptions): Promise<string | undefined> => {
    const input = options ?? {}
    const channelId = input.channelId ?? agentChannelId ?? undefined
    const modelId = input.modelId ?? agentModelId ?? undefined
    const workspaceId = resolveCreateAgentWorkspaceId(input, currentWorkspaceId)

    try {
      if (workspaceId && workspaceId !== currentWorkspaceId) {
        setCurrentWorkspaceId(workspaceId)
        window.electronAPI.updateSettings({ agentWorkspaceId: workspaceId }).catch(console.error)
      }

      let session: AgentSessionMeta = await window.electronAPI.createAgentSession(
        undefined,
        channelId,
        workspaceId,
        modelId,
      )

      if (input.projectId) {
        try {
          session = await window.electronAPI.sendSessionCommand(session.id, {
            kind: 'set_project_id',
            projectId: input.projectId,
          })
        } catch (error) {
          console.error('[创建会话] 新会话绑定项目失败:', error)
          toast.error('已创建会话，但绑定项目失败')
        }
      }

      setAgentSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])

      if (channelId) {
        setSessionChannelMap((prev) => {
          const map = new Map(prev)
          map.set(session.id, channelId)
          return map
        })
      }
      if (modelId) {
        setSessionModelMap((prev) => {
          const map = new Map(prev)
          map.set(session.id, modelId)
          return map
        })
      }

      openSession('agent', session.id, session.title)
      setActiveView('conversations')

      if (shouldMarkDraft(input)) {
        setDraftSessionIds((prev: Set<string>) => {
          const next = new Set(prev)
          next.add(session.id)
          return next
        })
      }

      return session.id
    } catch (error) {
      console.error('[创建会话] 创建 Agent 会话失败:', error)
      toast.error('新建会话失败')
      return undefined
    }
  }

  return { createChat, createAgent }
}
