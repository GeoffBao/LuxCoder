import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileUtf8Tail, readSessionMessages, DEFAULT_SESSION_READ_MAX_BYTES } from './read-fs'

describe('read-fs 尾部读取', () => {
  test('小文件整读', () => {
    const dir = mkdtempSync(join(tmpdir(), 'session-core-read-'))
    try {
      const file = join(dir, 's.jsonl')
      writeFileSync(file, '{"type":"user","message":{"content":[{"type":"text","text":"hi"}]}}\n', 'utf-8')
      const messages = readSessionMessages(file)
      expect(messages).toHaveLength(1)
      expect(messages[0]?.type).toBe('user')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('大文件只保留尾部完整行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'session-core-tail-'))
    try {
      const file = join(dir, 'big.jsonl')
      const head = 'A'.repeat(1000) + '\n'
      const line1 = JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'old' }] } }) + '\n'
      const line2 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'new' }] } }) + '\n'
      writeFileSync(file, head + line1 + line2, 'utf-8')

      const tail = readFileUtf8Tail(file, 80)
      expect(tail.includes('old')).toBe(false)
      expect(tail.includes('new')).toBe(true)
      expect(DEFAULT_SESSION_READ_MAX_BYTES).toBeGreaterThan(1024)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
