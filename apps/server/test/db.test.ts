/**
 * 数据库层测试：迁移建表、外键级联、唯一约束
 */

import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { closeDb, getDb, migrate } from '../src/db'

describe('服务端数据库层', () => {
  beforeEach(() => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    closeDb()
  })

  afterEach(() => {
    closeDb()
    delete process.env.MYYODA_SERVER_DB
  })

  test('getDb 创建内存库并完成迁移', () => {
    const database = getDb()
    const tables = database
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tables).toContain('users')
    expect(tables).toContain('organizations')
    expect(tables).toContain('members')
    expect(tables).toContain('skills')
    expect(tables).toContain('skill_versions')
  })

  test('migrate 幂等：重复执行不报错', () => {
    const database = getDb()
    expect(() => migrate(database)).not.toThrow()
    expect(() => migrate(database)).not.toThrow()
  })

  test('users.email 唯一约束', () => {
    const database = getDb()
    database.run('INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)', [
      'u1', 'a@b.com', 'hash', 'A', new Date().toISOString(),
    ])
    expect(() =>
      database.run('INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)', [
        'u2', 'a@b.com', 'hash', 'B', new Date().toISOString(),
      ]),
    ).toThrow(/UNIQUE/)
  })

  test('members 级联删除：删除组织后成员随之消失', () => {
    const database = getDb()
    const now = new Date().toISOString()
    database.run('INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)', [
      'u1', 'a@b.com', 'hash', 'A', now,
    ])
    database.run('INSERT INTO organizations (id, name, slug, invite_code, created_at) VALUES (?, ?, ?, ?, ?)', [
      'o1', 'Org', 'org', 'INVITE1', now,
    ])
    database.run('INSERT INTO members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', [
      'm1', 'o1', 'u1', 'admin', now,
    ])
    database.run('DELETE FROM organizations WHERE id = ?', ['o1'])
    const count = database.query('SELECT COUNT(*) AS c FROM members').get() as { c: number }
    expect(count.c).toBe(0)
  })

  test('members 组织内用户唯一约束', () => {
    const database = getDb()
    const now = new Date().toISOString()
    database.run('INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)', [
      'u1', 'a@b.com', 'hash', 'A', now,
    ])
    database.run('INSERT INTO organizations (id, name, slug, invite_code, created_at) VALUES (?, ?, ?, ?, ?)', [
      'o1', 'Org', 'org', 'INVITE1', now,
    ])
    database.run('INSERT INTO members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', [
      'm1', 'o1', 'u1', 'admin', now,
    ])
    expect(() =>
      database.run('INSERT INTO members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', [
        'm2', 'o1', 'u1', 'member', now,
      ]),
    ).toThrow(/UNIQUE/)
  })

  test('skill_versions 版本唯一约束（同一 Skill 内）', () => {
    const database = getDb()
    const now = new Date().toISOString()
    database.run('INSERT INTO organizations (id, name, slug, invite_code, created_at) VALUES (?, ?, ?, ?, ?)', [
      'o1', 'Org', 'org', 'INVITE1', now,
    ])
    database.run('INSERT INTO skills (id, org_id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      's1', 'o1', 'my-skill', 'My Skill', now, now,
    ])
    database.run(
      'INSERT INTO skill_versions (id, skill_id, version, content_hash, tarball_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['v1', 's1', '1.0.0', 'hash1', '/tmp/s1-1.0.0.zip', now],
    )
    expect(() =>
      database.run(
        'INSERT INTO skill_versions (id, skill_id, version, content_hash, tarball_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['v2', 's1', '1.0.0', 'hash2', '/tmp/s1-1.0.0.zip', now],
      ),
    ).toThrow(/UNIQUE/)
  })

  test('不注入 MYYODA_SERVER_DB 时使用默认路径', async () => {
    delete process.env.MYYODA_SERVER_DB
    // 只验证 getDbPath 返回默认路径（不实际打开磁盘库避免副作用）
    const { getDbPath } = await import('../src/db')
    expect(getDbPath()).toContain('myyoda-server.db')
  })
})
