import type {
  AgentMessage,
  AgentSessionMeta,
  AgentSendInput,
  AgentWorkspace,
  LuxAgentsPermissionMode,
} from '@luxagents/shared'
import type {
  ConductorSessionHost,
  CreateSessionOptions,
  SessionCompletionEvent,
} from './task-runner'
import type { AgentSessionMetaUpdates } from './agent-session-manager'

export interface ConductorSessionCallbacks {
  onError: (error: string) => void
  onComplete: (
    messages?: AgentMessage[],
    options?: {
      stoppedByUser?: boolean
      startedAt?: number
      resultSubtype?: string
      resultErrors?: string[]
      backgroundTasksPending?: boolean
    },
  ) => void
  onTitleUpdated: (title: string) => void
  onRunStarted?: (options: { startedAt: number }) => void
}

export interface ConductorOrchestrator {
  sendMessage(input: AgentSendInput, callbacks: ConductorSessionCallbacks): Promise<void>
  stop(sessionId: string): void
}

export interface ConductorSessionHostDependencies {
  createAgentSession: (
    title?: string,
    channelId?: string,
    workspaceId?: string,
    modelId?: string,
  ) => AgentSessionMeta
  getAgentSessionMeta: (sessionId: string) => AgentSessionMeta | undefined
  updateAgentSessionMeta: (sessionId: string, updates: AgentSessionMetaUpdates) => AgentSessionMeta
  getAgentSessionMessages: (sessionId: string) => AgentMessage[]
  getAgentWorkspace: (workspaceId: string) => AgentWorkspace | undefined
  getAgentSessionWorkspacePath: (workspaceSlug: string, sessionId: string) => string
  getOrchestrator: () => ConductorOrchestrator
}

interface CompletionState {
  dispatched: boolean
  sawError: boolean
}

export class LuxAgentsConductorSessionHost implements ConductorSessionHost {
  private readonly listeners = new Set<(event: SessionCompletionEvent) => void>()
  private readonly completionStates = new Map<string, CompletionState>()

  constructor(private readonly deps: ConductorSessionHostDependencies) {}

  async createSession(workspaceId: string, options: CreateSessionOptions): Promise<{ id: string }> {
    const session = this.deps.createAgentSession(
      options.name,
      options.llmConnection,
      workspaceId,
      options.model,
    )

    const updates: AgentSessionMetaUpdates = {}
    const permissionMode = mapPermissionMode(options.permissionMode)
    if (permissionMode !== undefined) updates.permissionMode = permissionMode
    if (options.sessionStatus !== undefined) updates.sessionStatus = options.sessionStatus
    if (options.parentSessionId !== undefined) updates.parentSessionId = options.parentSessionId
    if (options.projectId !== undefined) updates.projectId = options.projectId
    if (options.taskSlug !== undefined) updates.taskSlug = options.taskSlug
    if (options.taskRunId !== undefined) updates.taskRunId = options.taskRunId
    if (options.taskNodeId !== undefined) updates.taskNodeId = options.taskNodeId
    if (options.taskDraft !== undefined) updates.taskDraft = options.taskDraft
    if (Object.keys(updates).length > 0) {
      this.deps.updateAgentSessionMeta(session.id, updates)
    }

    return { id: session.id }
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const meta = this.deps.getAgentSessionMeta(sessionId)
    if (!meta) throw new Error(`Agent 会话不存在: ${sessionId}`)
    if (!meta.channelId) throw new Error(`Agent 会话缺少 channelId: ${sessionId}`)

    const state: CompletionState = { dispatched: false, sawError: false }
    this.completionStates.set(sessionId, state)
    const dispatch = (
      reason: SessionCompletionEvent['reason'],
      messages?: AgentMessage[],
      tokenUsage?: SessionCompletionEvent['tokenUsage'],
    ): void => {
      if (state.dispatched) return
      state.dispatched = true
      const finalText = getFinalText(messages ?? [])
        ?? getFinalText(this.deps.getAgentSessionMessages(sessionId))
      this.dispatchCompletion({
        sessionId,
        workspaceId: meta.workspaceId ?? '',
        reason,
        ...(finalText !== undefined ? { finalText } : {}),
        ...(tokenUsage !== undefined ? { tokenUsage } : {}),
      })
    }

    try {
      const input: AgentSendInput = {
        sessionId,
        userMessage: message,
        channelId: meta.channelId,
        ...(meta.modelId !== undefined ? { modelId: meta.modelId } : {}),
        ...(meta.workspaceId !== undefined ? { workspaceId: meta.workspaceId } : {}),
        triggeredBy: 'work',
        ...(meta.permissionMode !== undefined ? { permissionModeOverride: meta.permissionMode } : {}),
      }
      await this.deps.getOrchestrator().sendMessage(input, {
        onError: () => {
          state.sawError = true
        },
        onComplete: (messages, options) => {
          const reason = state.sawError || isErrorCompletion(options)
            ? 'error'
            : options?.stoppedByUser
              ? 'interrupted'
              : 'complete'
          dispatch(reason, messages)
        },
        onTitleUpdated: () => { /* Conductor 不消费标题事件 */ },
      })
    } catch (error) {
      dispatch('error')
      throw error
    } finally {
      if (!state.dispatched && state.sawError) dispatch('error')
      this.completionStates.delete(sessionId)
    }
  }

  async setSessionStatus(sessionId: string, status: string): Promise<void> {
    this.deps.updateAgentSessionMeta(sessionId, { sessionStatus: status })
  }

  async setKanbanColumn(sessionId: string, column: string | null): Promise<void> {
    this.deps.updateAgentSessionMeta(sessionId, { kanbanColumn: column ?? undefined })
  }

  async setTaskNodeCount(sessionId: string, count: number): Promise<void> {
    this.deps.updateAgentSessionMeta(sessionId, { taskNodeCount: count })
  }

  async setSessionProjectId(sessionId: string, projectId: string): Promise<void> {
    this.deps.updateAgentSessionMeta(sessionId, { projectId })
  }

  async cancelProcessing(sessionId: string, _silent?: boolean): Promise<void> {
    this.deps.getOrchestrator().stop(sessionId)
  }

  onSessionComplete(listener: (event: SessionCompletionEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSessionFinalText(sessionId: string): string | undefined {
    return getFinalText(this.deps.getAgentSessionMessages(sessionId))
  }

  getSessionWorkingDirectory(sessionId: string): string | undefined {
    const meta = this.deps.getAgentSessionMeta(sessionId)
    if (!meta?.workspaceId) return undefined
    const workspace = this.deps.getAgentWorkspace(meta.workspaceId)
    return workspace
      ? this.deps.getAgentSessionWorkspacePath(workspace.slug, sessionId)
      : undefined
  }

  private dispatchCompletion(event: SessionCompletionEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch (error) {
        console.error('[Conductor] 完成监听器执行失败:', error)
      }
    }
  }
}

/** 在 Electron 主进程中延迟加载真实服务，避免纯逻辑测试触发 Electron 模块。 */
export async function createLuxAgentsConductorSessionHost(): Promise<LuxAgentsConductorSessionHost> {
  const [sessionManager, agentService, workspaceManager, configPaths] = await Promise.all([
    import('./agent-session-manager'),
    import('./agent-service'),
    import('./agent-workspace-manager'),
    import('./config-paths'),
  ])
  return new LuxAgentsConductorSessionHost({
    createAgentSession: sessionManager.createAgentSession,
    getAgentSessionMeta: sessionManager.getAgentSessionMeta,
    updateAgentSessionMeta: sessionManager.updateAgentSessionMeta,
    getAgentSessionMessages: sessionManager.getAgentSessionMessages,
    getAgentWorkspace: workspaceManager.getAgentWorkspace,
    getAgentSessionWorkspacePath: configPaths.getAgentSessionWorkspacePath,
    getOrchestrator: agentService.getOrchestrator,
  })
}

export const createConductorSessionHost = createLuxAgentsConductorSessionHost

function mapPermissionMode(mode: string | undefined): LuxAgentsPermissionMode | undefined {
  switch (mode) {
    case 'allow-all':
    case 'bypassPermissions':
      return 'bypassPermissions'
    case 'safe':
    case 'ask':
    case 'auto':
      return 'auto'
    case 'plan':
      return 'plan'
    default:
      return undefined
  }
}

function isErrorCompletion(options: { resultSubtype?: string; resultErrors?: string[] } | undefined): boolean {
  return Boolean(
    options?.resultErrors?.length
      || options?.resultSubtype?.startsWith('error'),
  )
}

function getFinalText(messages: AgentMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = getAssistantText(messages[index])
    if (text?.trim()) return text
  }
  return undefined
}

function getAssistantText(message: AgentMessage | undefined): string | undefined {
  if (!message) return undefined
  const raw = message as unknown as Record<string, unknown>
  if (raw.role === 'assistant' && typeof raw.content === 'string') return raw.content
  const nested = asRecord(raw.message)
  const blocks = nested?.content
  if (!Array.isArray(blocks)) return undefined
  const text = blocks
    .map((block) => {
      const record = asRecord(block)
      return record?.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
  return text || undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
