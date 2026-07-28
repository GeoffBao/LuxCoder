import { describe, expect, test } from 'bun:test'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import {
  buildCurrentSessionCompactionTool,
  canRunCurrentSessionCompaction,
  compactCurrentSessionAfterTurn,
  planPiCompactionContinuation,
  installCurrentSessionCompactionHooks,
} from './pi-agent-adapter'

function createToolSdk() {
  return {
    defineTool<T>(tool: T): T {
      return tool
    },
  } as unknown as typeof import('@earendil-works/pi-coding-agent')
}

describe('Pi current-session context compaction tool', () => {
  test('schedules compaction and terminates the calling turn', async () => {
    let requests = 0
    const tool = buildCurrentSessionCompactionTool(createToolSdk(), () => { requests += 1 }, undefined)

    const result = await tool.execute('tool-call-1', {}, undefined, undefined, undefined as never)

    expect(tool.name).toBe('CompactContext')
    expect(requests).toBe(1)
    expect(result.terminate).toBe(true)
    expect(result.details).toEqual(expect.objectContaining({ status: 'scheduled' }))
  })

  test('only permits compaction as the sole tool in its batch', () => {
    expect(canRunCurrentSessionCompaction(['CompactContext'])).toBe(true)
    expect(canRunCurrentSessionCompaction(['Write', 'CompactContext'])).toBe(false)
    expect(canRunCurrentSessionCompaction(['CompactContext', 'Write'])).toBe(false)
  })

  test('keeps compaction requests scoped to their own tool instances', async () => {
    let firstRequests = 0
    let secondRequests = 0
    const first = buildCurrentSessionCompactionTool(createToolSdk(), () => { firstRequests += 1 }, undefined)
    const second = buildCurrentSessionCompactionTool(createToolSdk(), () => { secondRequests += 1 }, undefined)

    await first.execute('tool-call-1', {}, undefined, undefined, undefined as never)

    expect(firstRequests).toBe(1)
    expect(secondRequests).toBe(0)
  })

  test('blocks every tool in a mixed batch containing CompactContext', async () => {
    const session = {
      agent: {},
    } as unknown as AgentSession
    installCurrentSessionCompactionHooks(session)

    const writeResult = await session.agent.beforeToolCall?.({
      toolCall: { name: 'Write' },
      assistantMessage: { content: [
        { type: 'toolCall', name: 'Write' },
        { type: 'toolCall', name: 'CompactContext' },
      ] },
    } as never, undefined)
    const compactResult = await session.agent.beforeToolCall?.({
      toolCall: { name: 'CompactContext' },
      assistantMessage: { content: [
        { type: 'toolCall', name: 'Write' },
        { type: 'toolCall', name: 'CompactContext' },
      ] },
    } as never, undefined)

    expect(writeResult).toMatchObject({ block: true })
    expect(compactResult).toMatchObject({ block: true })
  })

  test('continues the original task after compaction unless stopped or capped', () => {
    expect(planPiCompactionContinuation({ continuationCount: 0, abortRequested: false, runtimeLimitReached: false })).toMatchObject({ shouldContinue: true })
    expect(planPiCompactionContinuation({ continuationCount: 20, abortRequested: false, runtimeLimitReached: false })).toEqual({ shouldContinue: false, reason: 'continuation_limit' })
    expect(planPiCompactionContinuation({ continuationCount: 0, abortRequested: true, runtimeLimitReached: false })).toEqual({ shouldContinue: false, reason: 'aborted' })
    expect(planPiCompactionContinuation({ continuationCount: 0, abortRequested: false, runtimeLimitReached: true })).toEqual({ shouldContinue: false, reason: 'runtime_limit' })
  })

  test('compacts the supplied session after the tool turn settles', async () => {
    let compactCalls = 0
    const session = {
      sessionId: 'current-session',
      compact: async () => ({ summary: String(++compactCalls), firstKeptEntryId: 'entry-1', tokensBefore: 100 }),
    } as unknown as Pick<AgentSession, 'compact' | 'sessionId'>

    await expect(compactCurrentSessionAfterTurn(session, () => {})).resolves.toBe('compacted')
    expect(compactCalls).toBe(1)
  })

  test('reports no-op compaction without failing the session', async () => {
    const messages: unknown[] = []
    const session = {
      sessionId: 'current-session',
      compact: async () => { throw new Error('Nothing to compact (session too small)') },
    } as unknown as Pick<AgentSession, 'compact' | 'sessionId'>

    await expect(compactCurrentSessionAfterTurn(session, (message) => messages.push(message))).resolves.toBe('noop')
    expect(messages).toEqual([expect.objectContaining({ subtype: 'status', compact_result: 'noop', session_id: 'current-session' })])
  })

  test('surfaces unexpected compaction failures', async () => {
    const session = {
      sessionId: 'current-session',
      compact: async () => { throw new Error('provider unavailable') },
    } as unknown as Pick<AgentSession, 'compact' | 'sessionId'>

    await expect(compactCurrentSessionAfterTurn(session, () => {})).rejects.toThrow('provider unavailable')
  })
})
