import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { mockElectronModule } from './__tests__/electron-mock'

mockElectronModule()

// 迁移函数依赖 process.env 与 electron app.isPackaged。
// 这里通过 mock electron 的 app.isPackaged 控制 prod/dev 分支，
// 但 migrateDirChain 是纯逻辑（不依赖 homedir），直接用隔离的临时目录验证。
describe('migrateDataDirIfNeeded', () => {
  let fakeHome: string

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'yoda-migrate-test-'))
  })

  afterEach(() => {
    // bun 测试不强制清理，这里省略递归删除以保持简单
  })

  test('migrateDirChain: 旧目录不存在 → 跳过', () => {
    const { migrateDirChain } = require('./migration-service')
    const newDir = join(fakeHome, '.yoda')
    mkdirSync(newDir, { recursive: true })
    const oldDir = join(fakeHome, '.does-not-exist')
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    // 无 flag 写入
    expect(existsSync(join(newDir, '.migrated-from-luxcoder'))).toBe(false)
  })

  test('migrateDirChain: 已有目标 flag → 跳过', () => {
    const { migrateDirChain } = require('./migration-service')
    const newDir = join(fakeHome, '.yoda')
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, '.migrated-from-luxcoder'), 'old', 'utf-8')
    const oldDir = join(fakeHome, '.luxcoder')
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'data.txt'), 'real data', 'utf-8')
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    // 不应覆盖已有 flag 目录内容
    expect(existsSync(join(newDir, 'data.txt'))).toBe(false)
  })

  test('migrateDirChain: 正常迁移 luxcoder → yoda', () => {
    const { migrateDirChain } = require('./migration-service')
    const oldDir = join(fakeHome, '.luxcoder')
    const newDir = join(fakeHome, '.yoda')
    mkdirSync(join(oldDir, 'agent-sessions'), { recursive: true })
    writeFileSync(join(oldDir, 'agent-sessions', 'abc.jsonl'), '{}', 'utf-8')
    writeFileSync(join(oldDir, 'channels.json'), '{}', 'utf-8')
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    expect(existsSync(join(newDir, 'agent-sessions', 'abc.jsonl'))).toBe(true)
    expect(existsSync(join(newDir, 'channels.json'))).toBe(true)
    expect(existsSync(join(newDir, '.migrated-from-luxcoder'))).toBe(true)
    // 原目录保留
    expect(existsSync(join(oldDir, 'channels.json'))).toBe(true)
  })

  test('migrateDirChain: 新目录有误迁移 flag + 误内容 → 覆盖', () => {
    const { migrateDirChain } = require('./migration-service')
    const oldDir = join(fakeHome, '.luxcoder')
    const newDir = join(fakeHome, '.yoda')
    // 旧目录：真实 luxcoder 数据
    mkdirSync(join(oldDir, 'agent-sessions'), { recursive: true })
    writeFileSync(join(oldDir, 'agent-sessions', 'real.jsonl'), '{}', 'utf-8')
    writeFileSync(join(oldDir, 'channels.json'), '{"real":true}', 'utf-8')
    // 新目录：今天误生成的 proma 拷贝（有 .migrated-from-proma flag + 内容）
    mkdirSync(join(newDir, 'agent-sessions'), { recursive: true })
    writeFileSync(join(newDir, 'agent-sessions', 'fake.jsonl'), '{}', 'utf-8')
    writeFileSync(join(newDir, 'channels.json'), '{"fake":true}', 'utf-8')
    writeFileSync(join(newDir, '.migrated-from-proma'), '2026-08-07T16:08:42.161Z', 'utf-8')
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    // 迁移应覆盖误目录，真实数据进入
    expect(existsSync(join(newDir, 'agent-sessions', 'real.jsonl'))).toBe(true)
    expect(readFileSync(join(newDir, 'channels.json'), 'utf-8')).toContain('"real"')
    // 误 flag 保留（无害），新 flag 写入
    expect(existsSync(join(newDir, '.migrated-from-luxcoder'))).toBe(true)
  })

  test('migrateDirChain: 新目录有真实用户数据（无误 flag）→ 跳过', () => {
    const { migrateDirChain } = require('./migration-service')
    const oldDir = join(fakeHome, '.luxcoder')
    const newDir = join(fakeHome, '.yoda')
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'channels.json'), '{}', 'utf-8')
    // 新目录：真实用户数据（无任何迁移 flag）
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, 'user-data.txt'), 'keep me', 'utf-8')
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    // 不覆盖用户数据
    expect(readFileSync(join(newDir, 'user-data.txt'), 'utf-8')).toBe('keep me')
    expect(existsSync(join(newDir, 'channels.json'))).toBe(false)
  })

  test('migrateDirChain: 目标 flag 目录为空 → 正常迁移', () => {
    const { migrateDirChain } = require('./migration-service')
    const oldDir = join(fakeHome, '.luxcoder')
    const newDir = join(fakeHome, '.yoda')
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'channels.json'), '{}', 'utf-8')
    mkdirSync(newDir, { recursive: true }) // 空目录
    migrateDirChain(oldDir, newDir, '.migrated-from-luxcoder')
    expect(existsSync(join(newDir, 'channels.json'))).toBe(true)
    expect(existsSync(join(newDir, '.migrated-from-luxcoder'))).toBe(true)
  })

  test('isDirEmptyOrOnlyMistakenFlag: 仅误 flag → 可覆盖', () => {
    const { isDirEmptyOrOnlyMistakenFlag } = require('./migration-service')
    const dir = join(fakeHome, 'flag-only')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.migrated-from-proma'), 'x', 'utf-8')
    expect(isDirEmptyOrOnlyMistakenFlag(dir, '.migrated-from-luxcoder')).toBe(true)
  })

  test('isDirEmptyOrOnlyMistakenFlag: 真实用户文件 → 不可覆盖', () => {
    const { isDirEmptyOrOnlyMistakenFlag } = require('./migration-service')
    const dir = join(fakeHome, 'real')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'user-data.txt'), 'keep', 'utf-8')
    expect(isDirEmptyOrOnlyMistakenFlag(dir, '.migrated-from-luxcoder')).toBe(false)
  })
})
