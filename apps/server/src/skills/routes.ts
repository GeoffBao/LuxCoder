/**
 * Skills 仓库与分发路由
 *
 * 鉴权：requireAuth；发布/新版本/撤销仅 admin；列表/详情/下载需组织成员。
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { getAuthUser, requireAuth, type AuthUser } from '../auth/middleware'
import { getMemberRole } from '../orgs/routes'
import {
  loadSkillZip,
  parseSkillZip,
  removeSkillStorage,
  storeSkillZip,
} from './service'

export const skillRoutes = new Hono()
skillRoutes.use('*', requireAuth)

interface SkillRow {
  id: string
  org_id: string
  slug: string
  name: string
  description: string
  published: number
  created_at: string
  updated_at: string
}

interface VersionRow {
  id: string
  skill_id: string
  version: string
  content_hash: string
  tarball_path: string
  created_at: string
}

/** 读取 zip 文件字节（multipart file） */
async function readZipFromRequest(c: Context): Promise<{ zip: Uint8Array } | { error: Response }> {
  try {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) {
      return { error: c.json({ error: '缺少 file 字段（zip 文件）' }, 400) }
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return { zip: bytes }
  } catch {
    return { error: c.json({ error: '无法解析上传内容' }, 400) }
  }
}

// ── 发布 Skill ────────────────────────────────────────────

skillRoutes.post('/:orgId/skills', async (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  if (getMemberRole(orgId, auth.userId) !== 'admin') {
    return c.json({ error: '仅组织管理员可发布 Skill' }, 403)
  }

  const parsed = await readZipFromRequest(c)
  if ('error' in parsed) return parsed.error

  let manifest
  try {
    manifest = parseSkillZip(parsed.zip).manifest
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }

  const db = getDb()
  const existing = db.query('SELECT id FROM skills WHERE org_id = ? AND slug = ?').get(orgId, manifest.slug)
  if (existing) {
    return c.json({ error: `组织内已存在同名 Skill: ${manifest.slug}` }, 409)
  }

  const skillId = randomUUID()
  const now = new Date().toISOString()
  db.run(
    'INSERT INTO skills (id, org_id, slug, name, description, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    [skillId, orgId, manifest.slug, manifest.name, manifest.description ?? '', now, now],
  )

  const { contentHash, archivePath } = storeSkillZip(orgId, skillId, manifest.version, parsed.zip)
  db.run(
    'INSERT INTO skill_versions (id, skill_id, version, content_hash, tarball_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), skillId, manifest.version, contentHash, archivePath, now],
  )

  return c.json({ skill: { id: skillId, slug: manifest.slug, name: manifest.name, version: manifest.version, description: manifest.description ?? '' } }, 201)
})

// ── 列表 ──────────────────────────────────────────────────

skillRoutes.get('/:orgId/skills', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  if (!getMemberRole(orgId, auth.userId)) {
    return c.json({ error: '你不在该组织中' }, 403)
  }
  const db = getDb()
  const rows = db
    .query(
      `SELECT s.id AS id, s.slug AS slug, s.name AS name, s.description AS description, s.updated_at AS updated_at,
              (SELECT sv.version FROM skill_versions sv WHERE sv.skill_id = s.id ORDER BY sv.created_at DESC LIMIT 1) AS latest_version
       FROM skills s
       WHERE s.org_id = ? AND s.published = 1
       ORDER BY s.created_at`,
    )
    .all(orgId) as Array<{ id: string; slug: string; name: string; description: string; updated_at: string; latest_version: string | null }>
  return c.json({
    skills: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.latest_version ?? '',
      updatedAt: r.updated_at,
    })),
  })
})

// ── 详情 + 版本列表 ───────────────────────────────────────

skillRoutes.get('/:orgId/skills/:slug', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const slug = c.req.param('slug')
  if (!getMemberRole(orgId, auth.userId)) {
    return c.json({ error: '你不在该组织中' }, 403)
  }
  const db = getDb()
  const skill = db.query('SELECT * FROM skills WHERE org_id = ? AND slug = ? AND published = 1').get(orgId, slug) as SkillRow | undefined
  if (!skill) {
    return c.json({ error: 'Skill 不存在或已撤销' }, 404)
  }
  const versions = db
    .query('SELECT version, content_hash, created_at FROM skill_versions WHERE skill_id = ? ORDER BY created_at')
    .all(skill.id) as Array<{ version: string; content_hash: string; created_at: string }>
  return c.json({
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      version: versions.at(-1)?.version ?? '',
      versions: versions.map((v) => ({ version: v.version, contentHash: v.content_hash, createdAt: v.created_at })),
    },
  })
})

// ── 发布新版本 ────────────────────────────────────────────

skillRoutes.post('/:orgId/skills/:slug/versions', async (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const slug = c.req.param('slug')
  if (getMemberRole(orgId, auth.userId) !== 'admin') {
    return c.json({ error: '仅组织管理员可发布版本' }, 403)
  }

  const parsed = await readZipFromRequest(c)
  if ('error' in parsed) return parsed.error

  let manifest
  try {
    manifest = parseSkillZip(parsed.zip).manifest
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400)
  }

  const db = getDb()
  const skill = db.query('SELECT * FROM skills WHERE org_id = ? AND slug = ? AND published = 1').get(orgId, slug) as SkillRow | undefined
  if (!skill) {
    return c.json({ error: 'Skill 不存在或已撤销' }, 404)
  }
  const dup = db.query('SELECT id FROM skill_versions WHERE skill_id = ? AND version = ?').get(skill.id, manifest.version)
  if (dup) {
    return c.json({ error: `版本 ${manifest.version} 已存在` }, 409)
  }

  const { contentHash, archivePath } = storeSkillZip(orgId, skill.id, manifest.version, parsed.zip)
  const now = new Date().toISOString()
  db.run(
    'INSERT INTO skill_versions (id, skill_id, version, content_hash, tarball_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), skill.id, manifest.version, contentHash, archivePath, now],
  )
  db.run('UPDATE skills SET name = ?, description = ?, updated_at = ? WHERE id = ?', [
    manifest.name, manifest.description ?? skill.description, now, skill.id,
  ])
  return c.json({ ok: true, slug, version: manifest.version })
})

// ── 下载 ──────────────────────────────────────────────────

skillRoutes.get('/:orgId/skills/:slug/download', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const slug = c.req.param('slug')
  if (!getMemberRole(orgId, auth.userId)) {
    return c.json({ error: '你不在该组织中' }, 403)
  }
  const db = getDb()
  const skill = db.query('SELECT * FROM skills WHERE org_id = ? AND slug = ? AND published = 1').get(orgId, slug) as SkillRow | undefined
  if (!skill) {
    return c.json({ error: 'Skill 不存在或已撤销' }, 404)
  }
  const requestedVersion = c.req.query('version')
  const versionRow = requestedVersion
    ? db.query('SELECT version FROM skill_versions WHERE skill_id = ? AND version = ?').get(skill.id, requestedVersion)
    : db.query('SELECT version FROM skill_versions WHERE skill_id = ? ORDER BY created_at DESC LIMIT 1').get(skill.id)
  if (!versionRow) {
    return c.json({ error: 'Skill 版本不存在' }, 404)
  }
  const version = (versionRow as { version: string }).version
  const zip = loadSkillZip(orgId, skill.id, version)
  if (!zip) {
    return c.json({ error: 'Skill 内容缺失' }, 500)
  }
  c.header('content-type', 'application/zip')
  c.header('content-disposition', `attachment; filename="${slug}-${version}.zip"`)
  return new Response(zip)
})

// ── 撤销（软删除） ────────────────────────────────────────

skillRoutes.delete('/:orgId/skills/:slug', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const slug = c.req.param('slug')
  if (getMemberRole(orgId, auth.userId) !== 'admin') {
    return c.json({ error: '仅组织管理员可撤销 Skill' }, 403)
  }
  const db = getDb()
  const skill = db.query('SELECT * FROM skills WHERE org_id = ? AND slug = ?').get(orgId, slug) as SkillRow | undefined
  if (!skill) {
    return c.json({ error: 'Skill 不存在' }, 404)
  }
  db.run('UPDATE skills SET published = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), skill.id])
  // 撤销后保留版本记录（便于审计/恢复），但移除本地内容目录
  removeSkillStorage(orgId, skill.id)
  return c.json({ ok: true, slug })
})
