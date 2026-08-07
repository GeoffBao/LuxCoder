/**
 * Skills 仓库与分发 API 测试
 *
 * 覆盖：发布 Skill（zip 上传）、列表、详情+版本、发布新版本、
 * 下载 zip、撤销（软删除）、非成员 403、成员可读。
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { unzipSync, zipSync } from 'fflate'
import { closeDb, getDb } from '../src/db'
import { signToken } from '../src/auth/password'
import { createUser } from '../src/auth/routes'
import { orgRoutes } from '../src/orgs/routes'
import { skillRoutes } from '../src/skills/routes'

/** 组合 app：模拟 index.ts 挂载 */
const testApp = new Hono()
testApp.route('/api/orgs', orgRoutes)
testApp.route('/api/orgs', skillRoutes)

/** 便捷：注册用户 */
async function registerUser(email: string): Promise<{ id: string; token: string }> {
  const user = await createUser({ email, password: 'password123', displayName: email.split('@')[0] })
  const token = await signToken({ userId: user.id, email: user.email })
  return { id: user.id, token }
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

/** 便捷：创建组织并返回 id + 邀请码 */
async function createOrg(token: string, name: string): Promise<{ orgId: string; inviteCode: string }> {
  const res = await testApp.request('/api/orgs', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as { org: { id: string; inviteCode: string } }
  return { orgId: body.org.id, inviteCode: body.org.inviteCode }
}

/** 便捷：构建 Skill zip（含 SKILL.md + 参考文件） */
function makeSkillZip(slug: string, version: string, extraFile = ''): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'SKILL.md': new TextEncoder().encode(
      `---\nname: ${slug}\nversion: ${version}\ndescription: 测试 Skill ${slug}\n---\n\n# ${slug}\n\n测试内容。\n`,
    ),
  }
  if (extraFile) files[extraFile] = new TextEncoder().encode(`file: ${extraFile}`)
  return zipSync(files, { level: 6 })
}

/** multipart 上传辅助 */
async function uploadZip(
  token: string,
  url: string,
  zip: Uint8Array,
  extraFields: Record<string, string> = {},
): Promise<Response> {
  const form = new FormData()
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v)
  form.append('file', new File([zip], 'skill.zip', { type: 'application/zip' }))
  return testApp.request(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })
}

describe('Skills 仓库与分发', () => {
  beforeAll(() => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    closeDb()
    process.env.MYYODA_SERVER_SKILLS_DIR = '/tmp/myyoda-server-test-skills'
  })

  test('发布 Skill 成功', async () => {
    const admin = await registerUser('skill-admin@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队')
    const res = await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('my-skill', '1.0.0'))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { skill: { slug: string; name: string; version: string } }
    expect(body.skill.slug).toBe('my-skill')
    expect(body.skill.version).toBe('1.0.0')
  })

  test('非组织成员发布返回 403', async () => {
    const admin = await registerUser('skill-admin2@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队2')
    const outsider = await registerUser('skill-outsider@b.com')
    const res = await uploadZip(outsider.token, `/api/orgs/${orgId}/skills`, makeSkillZip('x', '1.0.0'))
    expect(res.status).toBe(403)
  })

  test('普通成员发布返回 403（仅管理员可发布）', async () => {
    const admin = await registerUser('skill-admin3@b.com')
    const { orgId, inviteCode } = await createOrg(admin.token, '技能团队3')
    const member = await registerUser('skill-member@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })
    const res = await uploadZip(member.token, `/api/orgs/${orgId}/skills`, makeSkillZip('y', '1.0.0'))
    expect(res.status).toBe(403)
  })

  test('发布缺失 SKILL.md 的 zip 返回 400', async () => {
    const admin = await registerUser('skill-admin4@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队4')
    const badZip = zipSync({ 'README.txt': new TextEncoder().encode('no skill here') }, { level: 6 })
    const res = await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, badZip)
    expect(res.status).toBe(400)
  })

  test('发布同名 Skill 返回 409', async () => {
    const admin = await registerUser('skill-admin5@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队5')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('dup', '1.0.0'))
    const res = await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('dup', '1.0.0'))
    expect(res.status).toBe(409)
  })

  test('列表返回组织 Skills（含最新版本）', async () => {
    const admin = await registerUser('skill-admin6@b.com')
    const { orgId, inviteCode } = await createOrg(admin.token, '技能团队6')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('a', '1.0.0'))
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('b', '1.0.0'))

    const member = await registerUser('skill-reader@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })
    const res = await testApp.request(`/api/orgs/${orgId}/skills`, { headers: authHeaders(member.token) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { skills: Array<{ slug: string; version: string }> }
    expect(body.skills.length).toBe(2)
    const slugs = body.skills.map((s) => s.slug).sort()
    expect(slugs).toEqual(['a', 'b'])
  })

  test('发布新版本并可通过详情查看版本列表', async () => {
    const admin = await registerUser('skill-admin7@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队7')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('ver', '1.0.0'))
    const v2 = await uploadZip(admin.token, `/api/orgs/${orgId}/skills/ver/versions`, makeSkillZip('ver', '1.1.0'))
    expect(v2.status).toBe(200)

    const detail = await testApp.request(`/api/orgs/${orgId}/skills/ver`, { headers: authHeaders(admin.token) })
    const body = (await detail.json()) as { skill: { version: string; versions: Array<{ version: string }> } }
    expect(body.skill.version).toBe('1.1.0')
    expect(body.skill.versions.map((v) => v.version)).toEqual(['1.0.0', '1.1.0'])
  })

  test('下载 Skill zip 可解压还原', async () => {
    const admin = await registerUser('skill-admin8@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队8')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('dl', '1.0.0', 'REFERENCE.md'))

    const res = await testApp.request(`/api/orgs/${orgId}/skills/dl/download`, { headers: authHeaders(admin.token) })
    expect(res.status).toBe(200)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const unzipped = unzipSync(bytes)
    const skillMd = new TextDecoder().decode(unzipped['SKILL.md'])
    expect(skillMd).toContain('name: dl')
    expect(unzipped['REFERENCE.md']).toBeTruthy()
  })

  test('撤销 Skill 后列表不再出现，且不可下载', async () => {
    const admin = await registerUser('skill-admin9@b.com')
    const { orgId } = await createOrg(admin.token, '技能团队9')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('gone', '1.0.0'))

    const del = await testApp.request(`/api/orgs/${orgId}/skills/gone`, {
      method: 'DELETE',
      headers: authHeaders(admin.token),
    })
    expect(del.status).toBe(200)

    const list = await testApp.request(`/api/orgs/${orgId}/skills`, { headers: authHeaders(admin.token) })
    const listBody = (await list.json()) as { skills: Array<{ slug: string }> }
    expect(listBody.skills.some((s) => s.slug === 'gone')).toBe(false)

    const download = await testApp.request(`/api/orgs/${orgId}/skills/gone/download`, { headers: authHeaders(admin.token) })
    expect(download.status).toBe(404)
  })

  test('撤销 Skill 需管理员权限', async () => {
    const admin = await registerUser('skill-admin10@b.com')
    const { orgId, inviteCode } = await createOrg(admin.token, '技能团队10')
    await uploadZip(admin.token, `/api/orgs/${orgId}/skills`, makeSkillZip('protect', '1.0.0'))
    const member = await registerUser('skill-member10@b.com')
    await testApp.request('/api/orgs/join', {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })
    const res = await testApp.request(`/api/orgs/${orgId}/skills/protect`, {
      method: 'DELETE',
      headers: authHeaders(member.token),
    })
    expect(res.status).toBe(403)
  })
})
