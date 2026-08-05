/**
 * 组织与成员管理路由
 *
 * 鉴权：全部走 requireAuth（401）；成员角色相关操作需 admin（403）。
 */

import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { getAuthUser, requireAuth, type AuthUser } from '../auth/middleware'

export const orgRoutes = new Hono()
orgRoutes.use('*', requireAuth)

interface OrgRow {
  id: string
  name: string
  slug: string
  invite_code: string
  created_at: string
}

interface MemberRow {
  id: string
  org_id: string
  user_id: string
  role: string
  created_at: string
  email?: string
  display_name?: string
}

/** 生成随机邀请码（8 位大写字母数字） */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** 从 slug 生成唯一组织 slug */
function generateUniqueSlug(name: string): string {
  const db = getDb()
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org'
  let slug = base
  let n = 2
  while (db.query('SELECT id FROM organizations WHERE slug = ?').get(slug)) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

/** 查询用户在某组织中的角色；不在组织返回 null */
export function getMemberRole(orgId: string, userId: string): string | null {
  const db = getDb()
  const row = db.query('SELECT role FROM members WHERE org_id = ? AND user_id = ?').get(orgId, userId) as { role: string } | undefined
  return row?.role ?? null
}

/** 查询用户是哪些组织的成员（含角色） */
function listMemberships(userId: string): Array<{ orgId: string; orgName: string; role: string }> {
  const db = getDb()
  const rows = db
    .query(
      `SELECT o.id AS org_id, o.name AS org_name, m.role AS role
       FROM members m JOIN organizations o ON o.id = m.org_id
       WHERE m.user_id = ? ORDER BY o.created_at`,
    )
    .all(userId) as Array<{ org_id: string; org_name: string; role: string }>
  return rows.map((r) => ({ orgId: r.org_id, orgName: r.org_name, role: r.role }))
}

// ── 创建组织 ──────────────────────────────────────────────

orgRoutes.post('/', async (c) => {
  const auth = getAuthUser(c) as AuthUser
  const body = (await c.req.json().catch(() => null)) as { name?: string } | null
  const name = body?.name?.trim()
  if (!name) {
    return c.json({ error: '组织名称为必填项' }, 400)
  }

  const db = getDb()
  const orgId = randomUUID()
  const memberId = randomUUID()
  const now = new Date().toISOString()
  const inviteCode = generateInviteCode()

  db.run('INSERT INTO organizations (id, name, slug, invite_code, created_at) VALUES (?, ?, ?, ?, ?)', [
    orgId, name, generateUniqueSlug(name), inviteCode, now,
  ])
  db.run('INSERT INTO members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', [
    memberId, orgId, auth.userId, 'admin', now,
  ])

  return c.json(
    { org: { id: orgId, name, slug: generateUniqueSlug(name), inviteCode }, role: 'admin' },
    201,
  )
})

// ── 我的组织与角色 ────────────────────────────────────────

orgRoutes.get('/me', (c) => {
  const auth = getAuthUser(c) as AuthUser
  return c.json({ memberships: listMemberships(auth.userId) })
})

// ── 凭邀请码加入组织 ──────────────────────────────────────

orgRoutes.post('/join', async (c) => {
  const auth = getAuthUser(c) as AuthUser
  const body = (await c.req.json().catch(() => null)) as { inviteCode?: string } | null
  const inviteCode = body?.inviteCode?.trim().toUpperCase()
  if (!inviteCode) {
    return c.json({ error: '邀请码为必填项' }, 400)
  }

  const db = getDb()
  const org = db.query('SELECT id, name FROM organizations WHERE invite_code = ?').get(inviteCode) as { id: string; name: string } | undefined
  if (!org) {
    return c.json({ error: '邀请码无效' }, 400)
  }
  const existing = db.query('SELECT id FROM members WHERE org_id = ? AND user_id = ?').get(org.id, auth.userId)
  if (existing) {
    return c.json({ error: '你已是该组织成员' }, 409)
  }

  db.run('INSERT INTO members (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', [
    randomUUID(), org.id, auth.userId, 'member', new Date().toISOString(),
  ])
  return c.json({ org: { id: org.id, name: org.name }, role: 'member' })
})

// ── 成员列表 / 角色管理 ───────────────────────────────────

orgRoutes.get('/:orgId/members', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  if (!getMemberRole(orgId, auth.userId)) {
    return c.json({ error: '你不在该组织中' }, 403)
  }
  const db = getDb()
  const rows = db
    .query(
      `SELECT m.id AS id, u.id AS user_id, u.email AS email, u.display_name AS display_name, m.role AS role
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = ? ORDER BY m.created_at`,
    )
    .all(orgId) as Array<{ id: string; user_id: string; email: string; display_name: string; role: string }>
  return c.json({
    members: rows.map((r) => ({ id: r.id, userId: r.user_id, email: r.email, displayName: r.display_name, role: r.role })),
  })
})

orgRoutes.patch('/:orgId/members/:memberId', async (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const memberId = c.req.param('memberId')
  if (getMemberRole(orgId, auth.userId) !== 'admin') {
    return c.json({ error: '仅管理员可修改成员角色' }, 403)
  }
  const body = (await c.req.json().catch(() => null)) as { role?: string } | null
  const role = body?.role
  if (role !== 'admin' && role !== 'member') {
    return c.json({ error: '角色必须是 admin 或 member' }, 400)
  }
  const db = getDb()
  const row = db.query('SELECT id FROM members WHERE id = ? AND org_id = ?').get(memberId, orgId)
  if (!row) {
    return c.json({ error: '成员不存在' }, 404)
  }
  db.run('UPDATE members SET role = ? WHERE id = ?', [role, memberId])
  return c.json({ ok: true, memberId, role })
})

orgRoutes.delete('/:orgId/members/:memberId', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const orgId = c.req.param('orgId')
  const memberId = c.req.param('memberId')
  if (getMemberRole(orgId, auth.userId) !== 'admin') {
    return c.json({ error: '仅管理员可移除成员' }, 403)
  }
  const db = getDb()
  const row = db.query('SELECT id, user_id FROM members WHERE id = ? AND org_id = ?').get(memberId, orgId) as { id: string; user_id: string } | undefined
  if (!row) {
    return c.json({ error: '成员不存在' }, 404)
  }
  if (row.user_id === auth.userId) {
    return c.json({ error: '不能移除自己' }, 400)
  }
  db.run('DELETE FROM members WHERE id = ?', [memberId])
  return c.json({ ok: true })
})
