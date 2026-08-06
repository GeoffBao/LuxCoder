import { describe, expect, test } from 'bun:test'
import { normalizeAgentRuntime } from './agent-runtime-normalize'

describe('Agent runtime 归一化', () => {
  test('Given anthropic-oauth 渠道 When 归一化 Then 恒为 claude（不受全局开关影响）', () => {
    expect(normalizeAgentRuntime('pi', 'anthropic-oauth')).toBe('claude')
    expect(normalizeAgentRuntime('claude', 'anthropic-oauth')).toBe('claude')
    expect(normalizeAgentRuntime(undefined, 'anthropic-oauth')).toBe('claude')
  })

  test('Given openai-codex 渠道 When 归一化 Then 行为不受影响（回归用例）', () => {
    // CLAUDE_RUNTIME_ENABLED 当前为 false，全局强制 pi；此用例锁定这个既有行为
    // 不因为新增 anthropic-oauth 例外而被误改。
    expect(normalizeAgentRuntime('claude', 'openai-codex')).toBe('pi')
    expect(normalizeAgentRuntime('pi', 'openai-codex')).toBe('pi')
  })

  test('Given 未传 provider When 归一化 Then 行为与改动前一致', () => {
    expect(normalizeAgentRuntime('claude')).toBe('pi')
    expect(normalizeAgentRuntime('pi')).toBe('pi')
  })

  // 回归用例：agent-orchestrator.ts 曾经用"归一化后的旧值 vs 归一化后的新值"来判断要不要
  // 持久化 sessionMeta.agentRuntime——但 anthropic-oauth 会把任何输入强制归一化成同一个结果，
  // 旧值新值双双被强制成 'claude'，导致这个比较永远相等、永远不持久化，存量会话的
  // agentRuntime 字段永久卡在旧值（'pi'），而实际每轮都在按 claude 运行时执行。
  // fork/rewind 等按 sessionMeta.agentRuntime 原始值分发的逻辑因此一直走错分支
  // （试图用 Pi 的 entry-binding 机制分叉一个实际用 claude 原生 SDK 跑的会话，
  // 报错"该 Pi 历史消息尚无 entry ID 映射"）。持久化判断必须比较"原始存储值"
  // 与"本轮归一化后的生效值"，不能用两个都归一化过的值互相比较。
  test('Given anthropic-oauth 渠道且存量会话原始字段仍是 pi When 用双重归一化值判断是否需要纠正 Then 该判断法必然失效（回归：fork 会话报 entry ID 映射缺失）', () => {
    const storedRaw = 'pi'
    const effective = normalizeAgentRuntime(storedRaw, 'anthropic-oauth')
    const previousNormalized = normalizeAgentRuntime(storedRaw, 'anthropic-oauth')

    expect(effective).toBe('claude')
    // 错误判断法：两边都归一化，结果恒等，guard 永远不触发持久化。
    expect(previousNormalized).toBe(effective)
    // 正确判断法：原始存储值与生效值确实不同，必须以此为准触发持久化纠正。
    expect(storedRaw).not.toBe(effective)
  })
})
