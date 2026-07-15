import { describe, expect, test } from 'bun:test'
import { buildClaimIdempotencyKey, resolveTeambitionSyncBadge } from '../teambition-view'

describe('Teambition view model', () => {
  test('相同 workspace/session/remote task 生成稳定认领幂等键', () => {
    expect(buildClaimIdempotencyKey('workspace-a', 'session-1', 'TW-1')).toBe(
      buildClaimIdempotencyKey('workspace-a', 'session-1', 'TW-1'),
    )
    expect(buildClaimIdempotencyKey('workspace-a', 'session-2', 'TW-1')).not.toBe(
      buildClaimIdempotencyKey('workspace-a', 'session-1', 'TW-1'),
    )
  })

  test('同步状态提供明确中文标签，重新授权不被误读为同步中', () => {
    expect(resolveTeambitionSyncBadge('pending').label).toBe('待同步')
    expect(resolveTeambitionSyncBadge('conflict').label).toBe('有冲突')
    expect(resolveTeambitionSyncBadge('stale').label).toBe('数据较旧')
    expect(resolveTeambitionSyncBadge('needs-reauth').label).toBe('需重新授权')
    expect(resolveTeambitionSyncBadge('synced').label).toBe('已同步')
  })
})
