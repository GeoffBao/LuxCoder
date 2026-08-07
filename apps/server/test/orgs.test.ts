/**
 * 组织与成员管理测试
 *
 * 覆盖：创建组织、邀请码生成、凭码加入、我的组织/角色、成员列表、
 * 管理员/成员权限隔离（越权返回 403）。
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { closeDb, getDb } from '../src/db'
import { signToken } from '../src/auth/password'
import { createUser } from '../src/auth/routes'
import { orgRoutes } from '../src/orgs/routes'

/** 组合 app：模拟 index.ts 挂载 /api/orgs */
const testApp = new Hono()
testApp.route('/api/orgs', orgRoutes)

/** 便捷：注册用户并返回 { id, token } */
async function registerUser(email: string): Promise<{ id: string; token: string }> {
  const user = await createUser({ email, password: 'password123', displayName: email.split('@')[0] })
  const token = await signToken({ userId: user.id, email: user.email })
  return { id: user.id, token }
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('组织与成员管理', () => {
  beforeAll(() => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    closeDb()
  })

  test('POST /orgs 创建组织并成为管理员', async () => {
    const { token } = await registerUser('admin@b.com')
    const res = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Acme 团队' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { org: { name: string; slug: string; inviteCode: string }; role: string }
    expect(body.org.name).toBe('Acme 团队')
    expect(body.org.slug).toBeTruthy()
    expect(body.org.inviteCode).toMatch(/^[A-Z0-9]{8}$/)
    expect(body.role).toBe('admin')
  })

  test('POST /orgs 无 token 返回 401', async () => {
    const res = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Org' }),
    })
    expect(res.status).toBe(401)
  })

  test('POST /orgs 名称缺失返回 400', async () => {
    const { token } = await registerUser('admin2@b.com')
    const res = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  test('GET /orgs/me 返回我的组织与角色', async () => {
    const { token } = await registerUser('admin3@b.com')
    await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Me 团队' }),
    })
    const res = await testApp.request('/api/orgs/me', { headers: authHeaders(token) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { memberships: Array<{ orgId: string; orgName: string; role: string }> }
    expect(body.memberships.length).toBe(1)
    expect(body.memberships[0]?.orgName).toBe('Me 团队')
    expect(body.memberships[0]?.role).toBe('admin')
  })

  test('凭邀请码加入组织 + 成员列表', async () => {
    const admin = await registerUser('boss@b.com')
    const createRes = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ name: '加入团队' }),
    })
    const created = (await createRes.json()) as { org: { id: string; inviteCode: string } }

    const member = await registerUser('worker@b.com')
    const joinRes = await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({ inviteCode: created.org.inviteCode }),
    })
    expect(joinRes.status).toBe(200)
    const joined = (await joinRes.json()) as { org: { id: string }; role: string }
    expect(joined.org.id).toBe(created.org.id)
    expect(joined.role).toBe('member')

    const membersRes = await testApp.request(`/api/orgs/${created.org.id}/members`, { headers: authHeaders(admin.token) })
    expect(membersRes.status).toBe(200)
    const members = (await membersRes.json()) as { members: Array<{ email: string; role: string }> }
    expect(members.members.length).toBe(2)
    const roles = new Map(members.members.map((m) => [m.email, m.role]))
    expect(roles.get('boss@b.com')).toBe('admin')
    expect(roles.get('worker@b.com')).toBe('member')
  })

  test('凭错误邀请码加入返回 400', async () => {
    const member = await registerUser('worker2@b.com')
    const res = await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({ inviteCode: 'NOTVALID' }),
    })
    expect(res.status).toBe(400)
  })

  test('非成员查询成员列表返回 403', async () => {
    const admin = await registerUser('owner@b.com')
    const createRes = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ name: '隔离团队' }),
    })
    const created = (await createRes.json()) as { org: { id: string } }

    const outsider = await registerUser('outsider@b.com')
    const res = await testApp.request(`/api/orgs/${created.org.id}/members`, { headers: authHeaders(outsider.token) })
    expect(res.status).toBe(403)
  })

  test('管理员修改成员角色', async () => {
    const admin = await registerUser('promote-admin@b.com')
    const createRes = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ name: '晋升团队' }),
    })
    const created = (await createRes.json()) as { org: { id: string; inviteCode: string } }

    const member = await registerUser('promote-worker@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({ inviteCode: created.org.inviteCode }),
    })

    const db = getDb()
    const memberRow = db.query('SELECT id FROM members WHERE org_id = ? AND user_id = ?').get(created.org.id, member.id) as { id: string }
    const patchRes = await testApp.request(`/api/orgs/${created.org.id}/members/${memberRow.id}`, {
      method: 'PATCH',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(patchRes.status).toBe(200)

    const membersRes = await testApp.request(`/api/orgs/${created.org.id}/members`, { headers: authHeaders(admin.token) })
    const members = (await membersRes.json()) as { members: Array<{ email: string; role: string }> }
    const promoted = members.members.find((m) => m.email === 'promote-worker@b.com')
    expect(promoted?.role).toBe('admin')
  })

  test('普通成员修改角色返回 403', async () => {
    const admin = await registerUser('no-perm@b.com')
    const createRes = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ name: '权限团队' }),
    })
    const created = (await createRes.json()) as { org: { id: string; inviteCode: string } }

    const member = await registerUser('no-perm-worker@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({ inviteCode: created.org.inviteCode }),
    })

    const db = getDb()
    const memberRow = db.query('SELECT id FROM members WHERE org_id = ? AND user_id = ?').get(created.org.id, member.id) as { id: string }
    const patchRes = await testApp.request(`/api/orgs/${created.org.id}/members/${memberRow.id}`, {
      method: 'PATCH',
      headers: authHeaders(member.token),
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(patchRes.status).toBe(403)
  })

  test('管理员移除成员', async () => {
    const admin = await registerUser('kick-admin@b.com')
    const createRes = await testApp.request('/api/orgs', {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ name: '踢人团队' }),
    })
    const created = (await createRes.json()) as { org: { id: string; inviteCode: string } }

    const member = await registerUser('kick-worker@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: authHeaders(member.token),
      body: JSON.stringify({ inviteCode: created.org.inviteCode }),
    })

    const db = getDb()
    const memberRow = db.query('SELECT id FROM members WHERE org_id = ? AND user_id = ?').get(created.org.id, member.id) as { id: string }
    const delRes = await testApp.request(`/api/orgs/${created.org.id}/members/${memberRow.id}`, {
      method: 'DELETE',
      headers: authHeaders(admin.token),
    })
    expect(delRes.status).toBe(200)

    const membersRes = await testApp.request(`/api/orgs/${created.org.id}/members`, { headers: authHeaders(admin.token) })
    const members = (await membersRes.json()) as { members: Array<{ email: string }> }
    expect(members.members.some((m) => m.email === 'kick-worker@b.com')).toBe(false)
  })
})
