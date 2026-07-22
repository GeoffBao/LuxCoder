import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSafeSessionId, resolveSession } from './sessions'

describe('CLI resolveSession 路径护栏', () => {
  const root = mkdtempSync(join(tmpdir(), 'luxcoder-cli-sessions-'))
  const sessionsDir = join(root, 'agent-sessions')
  mkdirSync(sessionsDir, { recursive: true })
  const inside = join(sessionsDir, 'abc.jsonl')
  writeFileSync(inside, '{}\n', 'utf-8')
  const outside = join(root, 'secret.jsonl')
  writeFileSync(outside, '{}\n', 'utf-8')

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('拒绝含 .. 或路径分隔的 session id', () => {
    expect(isSafeSessionId('../etc/passwd')).toBe(false)
    expect(isSafeSessionId('a/b')).toBe(false)
    expect(isSafeSessionId('ok-id')).toBe(true)
  })

  test('允许 agent-sessions 内的 jsonl 路径', () => {
    const resolved = resolveSession(inside, { configDir: root })
    expect(resolved?.id).toBe('abc')
    expect(resolved?.filePath).toBe(inside)
  })

  test('拒绝 agent-sessions 外的绝对 jsonl 路径', () => {
    expect(resolveSession(outside, { configDir: root })).toBeUndefined()
  })

  test('拒绝穿越 id', () => {
    expect(resolveSession('../secret', { configDir: root })).toBeUndefined()
  })
})
