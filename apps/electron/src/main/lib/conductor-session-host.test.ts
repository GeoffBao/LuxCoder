import { describe, expect, test } from 'bun:test'
import type {
  AgentMessage,
  AgentSessionMeta,
  AgentWorkspace,
} from '@luxagents/shared'
import {
  LuxAgentsConductorSessionHost,
  type ConductorSessionHostDependencies,
} from './conductor-session-host'
import type { SessionCompletionEvent } from './task-runner'

function createMeta(overrides: Partial<AgentSessionMeta> = {}): AgentSessionMeta {
  return {
    id: 'session-1',
    title: '原有标题',
    channelId: 'channel-1',
    workspaceId: 'workspace-1',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function createDependencies(): {
  deps: ConductorSessionHostDependencies
  sentInputs: Array<{ sessionId: string; userMessage: string }>
  callbacks: { onError: (error: string) => void; onComplete: (messages?: AgentMessage[], opts?: { stoppedByUser?: boolean }) => void }
  updates: Array<Record<string, unknown>>
  stopped: string[]
} {
  const sentInputs: Array<{ sessionId: string; userMessage: string }> = []
  const updates: Array<Record<string, unknown>> = []
  const stopped: string[] = []
  const persistedMessages: AgentMessage[] = []
  let callbacks: {
    onError: (error: string) => void
    onComplete: (messages?: AgentMessage[], opts?: { stoppedByUser?: boolean }) => void
    onTitleUpdated: (title: string) => void
  } | undefined
  const workspace: AgentWorkspace = {
    id: 'workspace-1',
    name: '测试工作区',
    slug: 'workspace-slug',
    createdAt: 1,
    updatedAt: 1,
  }
  const session = createMeta()

  const deps: ConductorSessionHostDependencies = {
    createAgentSession: () => session,
    getAgentSessionMeta: () => session,
    updateAgentSessionMeta: (_id, patch) => {
      updates.push(patch)
      Object.assign(session, patch)
      return session
    },
    getAgentSessionMessages: () => persistedMessages,
    getAgentWorkspace: () => workspace,
    getAgentSessionWorkspacePath: (slug, sessionId) => `/workspaces/${slug}/${sessionId}`,
    getOrchestrator: () => ({
      sendMessage: async (input, nextCallbacks) => {
        sentInputs.push({ sessionId: input.sessionId, userMessage: input.userMessage })
        callbacks = {
          onError: nextCallbacks.onError,
          onComplete: nextCallbacks.onComplete,
          onTitleUpdated: nextCallbacks.onTitleUpdated,
        }
      },
      stop: (sessionId) => {
        stopped.push(sessionId)
      },
    }),
  }

  return {
    deps,
    sentInputs,
    get callbacks() {
      if (!callbacks) throw new Error('测试回调尚未注册')
      return callbacks
    },
    updates,
    stopped,
  }
}

describe('LuxAgentsConductorSessionHost', () => {
  test('创建 session 时映射 OSS 选项并持久化 Conductor 元数据', async () => {
    const { deps, updates } = createDependencies()
    const host = new LuxAgentsConductorSessionHost(deps)

    await expect(host.createSession('workspace-1', {
      name: '节点标题',
      llmConnection: 'channel-1',
      model: 'model-1',
      permissionMode: 'allow-all',
      sessionStatus: 'in-progress',
      parentSessionId: 'parent-1',
      projectId: 'project-1',
      taskSlug: 'demo',
      taskRunId: 'run-1',
      taskNodeId: 'node-1',
      taskDraft: true,
    })).resolves.toEqual({ id: 'session-1' })

    expect(updates).toEqual([{
      permissionMode: 'bypassPermissions',
      sessionStatus: 'in-progress',
      parentSessionId: 'parent-1',
      projectId: 'project-1',
      taskSlug: 'demo',
      taskRunId: 'run-1',
      taskNodeId: 'node-1',
      taskDraft: true,
    }])
  })

  test('发送消息时映射 AgentSendInput，并将错误与完成回调合并为一次完成事件', async () => {
    const testDeps = createDependencies()
    const { deps, sentInputs } = testDeps
    const host = new LuxAgentsConductorSessionHost(deps)
    const events: Array<{ reason: string; finalText?: string }> = []
    host.onSessionComplete((event) => {
      events.push({ reason: event.reason, finalText: event.finalText })
    })

    const sending = host.sendMessage('session-1', '执行节点')
    await sending
    expect(sentInputs).toEqual([{ sessionId: 'session-1', userMessage: '执行节点' }])

    testDeps.callbacks.onError('执行失败')
    testDeps.callbacks.onComplete([
      { id: 'assistant-1', role: 'assistant', content: '最终结果', createdAt: 2 },
    ])
    testDeps.callbacks.onComplete([
      { id: 'assistant-2', role: 'assistant', content: '重复结果', createdAt: 3 },
    ])

    expect(events).toEqual([{ reason: 'error', finalText: '最终结果' }])
  })

  test('metadata helpers 使用专用字段，工作目录来自 workspace 元数据，取消调用 stop', async () => {
    const { deps, updates, stopped } = createDependencies()
    const host = new LuxAgentsConductorSessionHost(deps)

    await host.setSessionStatus('session-1', 'done')
    await host.setKanbanColumn('session-1', 'done')
    await host.setKanbanColumn('session-1', null)
    await host.setTaskNodeCount('session-1', 3)
    await host.setSessionProjectId('session-1', 'project-2')
    await host.cancelProcessing('session-1', true)

    expect(updates).toEqual([
      { sessionStatus: 'done' },
      { kanbanColumn: 'done' },
      { kanbanColumn: undefined },
      { taskNodeCount: 3 },
      { projectId: 'project-2' },
    ])
    expect(host.getSessionWorkingDirectory('session-1')).toBe('/workspaces/workspace-slug/session-1')
    expect(stopped).toEqual(['session-1'])
  })

  test('完成回调没有消息时回读持久化消息作为最终文本', async () => {
    const testDeps = createDependencies()
    const host = new LuxAgentsConductorSessionHost(testDeps.deps)
    const events: SessionCompletionEvent[] = []
    host.onSessionComplete((event) => events.push(event))

    const persisted = testDeps.deps.getAgentSessionMessages('session-1')
    persisted.push({ id: 'assistant-1', role: 'assistant', content: '持久化结果', createdAt: 2 })
    await host.sendMessage('session-1', '执行节点')
    testDeps.callbacks.onComplete([])

    expect(events).toHaveLength(1)
    expect(events[0]?.finalText).toBe('持久化结果')
  })
})
