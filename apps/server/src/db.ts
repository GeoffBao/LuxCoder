/**
 * 服务端 SQLite 数据库层（bun:sqlite 内置模块，零额外依赖）
 *
 * 数据文件默认存储于 <repo>/apps/server/data/myyoda-server.db，
 * 可通过环境变量 MYYODA_SERVER_DB 覆盖（测试/部署用）。
 */

import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_DB_PATH = join(import.meta.dir, '..', 'data', 'myyoda-server.db')

/** 获取数据库文件路径（测试可注入内存库） */
export function getDbPath(): string {
  return process.env.MYYODA_SERVER_DB ?? DEFAULT_DB_PATH
}

let db: Database | null = null

/** 获取全局单例数据库（首次调用时执行迁移） */
export function getDb(): Database {
  if (db) return db
  const path = getDbPath()
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  db = new Database(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

/** 关闭数据库（测试清理用） */
export function closeDb(): void {
  db?.close()
  db = null
}

/** 执行数据库迁移（幂等） */
export function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      api_key       TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      invite_code TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id       TEXT PRIMARY KEY,
      org_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      created_at TEXT NOT NULL,
      UNIQUE (org_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_members_org ON members(org_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

    CREATE TABLE IF NOT EXISTS skills (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      slug        TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      published   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      UNIQUE (org_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_skills_org ON skills(org_id);

    CREATE TABLE IF NOT EXISTS skill_versions (
      id           TEXT PRIMARY KEY,
      skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      version      TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tarball_path TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      UNIQUE (skill_id, version)
    );

    CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
  `)
}

/** 初始化数据库并在控制台打印位置（供 index.ts 启动时使用） */
export function ensureDatabase(): Database {
  const database = getDb()
  const path = getDbPath()
  if (path !== ':memory:') {
    console.log(`[MyYoda Server] 数据库已就绪: ${path}`)
  }
  return database
}
