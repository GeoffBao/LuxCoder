/**
 * org-skill-service 客户端 REST 层测试
 *
 * 使用本地 mock Hono server 验证：
 * - 登录/注册保存连接配置
 * - 组织创建/加入/我的组织
 * - Skills 列表/详情/下载（含 zip 解压）
 * - 401 过期处理
 *
 * 通过 MYYODA_ORG_SETTINGS_PATH 隔离配置文件。
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import {
  buildOrganizationImportSource,
  clearOrganizationConnection,
  extractSkillZip,
  getOrganizationConnection,
  OrgApiError,
  orgCreate,
  orgDownloadSkill,
  orgGetSkill,
  orgJoin,
  orgListMembers,
  orgListSkills,
  orgLogin,
  orgMe,
  orgRegister,
  orgConnectWithApiKey,
} from './org-skill-service'
import type { OrganizationConnection } from '@myyoda/shared'

// ── Mock 服务端（真实 HTTP，Bun.serve） ───────────────────

const mock = new Hono()
const registeredTokens = new Map<string, string>()
let currentToken = ''

mock.post('/api/auth/register', async (c) => {
  const body = (await c.req.json()) as { email: string }
  const token = `token-${body.email}`
  registeredTokens.set(body.email, token)
  return c.json({ user: { email: body.email }, token })
})

mock.post('/api/auth/login', async (c) => {
  const body = (await c.req.json()) as { email: string }
  const token = registeredTokens.get(body.email)
  if (!token) return c.json({ error: '邮箱或密码错误' }, 401)
  return c.json({ user: { email: body.email }, token })
})

mock.use('/api/orgs/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? ''
  // 接受 JWT（currentToken）或 lx_ API Key
  if (auth === `Bearer ${currentToken}` || auth.startsWith('Bearer lx_')) {
    await next()
  } else {
    return c.json({ error: '认证无效或已过期' }, 401)
  }
})

mock.post('/api/orgs', async (c) => {
  const body = (await c.req.json()) as { name: string }
  return c.json({ org: { id: 'org-1', name: body.name, slug: 'org-1', inviteCode: 'ABC12345' }, role: 'admin' }, 201)
})

mock.post('/api/orgs/join', async (c) => {
  return c.json({ org: { id: 'org-1', name: '加入的组织' }, role: 'member' })
})

mock.get('/api/orgs/me', (c) => {
  return c.json({ memberships: [{ orgId: 'org-1', orgName: 'Mock Org', role: 'admin' }] })
})

mock.get('/api/orgs/org-1/members', (c) => {
  return c.json({ members: [{ id: 'm1', userId: 'u1', email: 'a@b.com', displayName: 'A', role: 'admin' }] })
})

mock.get('/api/orgs/org-1/skills', (c) => {
  return c.json({ skills: [{ id: 's1', slug: 'my-skill', name: 'My Skill', description: 'desc', version: '1.0.0', updatedAt: '2026-01-01T00:00:00.000Z' }] })
})

mock.get('/api/orgs/org-1/skills/my-skill', (c) => {
  return c.json({
    skill: {
      id: 's1', slug: 'my-skill', name: 'My Skill', description: 'desc', version: '1.1.0', updatedAt: '2026-01-02T00:00:00.000Z',
      versions: [{ version: '1.0.0', contentHash: 'h1', createdAt: '2026-01-01T00:00:00.000Z' }, { version: '1.1.0', contentHash: 'h2', createdAt: '2026-01-02T00:00:00.000Z' }],
    },
  })
})

mock.get('/api/orgs/org-1/skills/my-skill/download', async (c) => {
  const zip = zipSync({
    'SKILL.md': new TextEncoder().encode('---\nname: my-skill\nversion: 1.0.0\n---\n\n# Hi\n'),
    'REFERENCE.md': new TextEncoder().encode('ref'),
  }, { level: 6 })
  return new Response(zip, { headers: { 'content-type': 'application/zip' } })
})

// ── 测试 ─────────────────────────────────────────────────

const settingsPath = join(tmpdir(), `org-settings-${Date.now()}.json`)
let serverUrl = ''
let mockServer: ReturnType<typeof Bun.serve>

function conn(): OrganizationConnection {
  return { serverUrl, authType: 'account', email: 'a@b.com', token: 'token-a@b.com' }
}

describe('org-skill-service', () => {
  beforeAll(() => {
    process.env.MYYODA_ORG_SETTINGS_PATH = settingsPath
    mockServer = Bun.serve({ port: 0, fetch: mock.fetch })
    serverUrl = `http://localhost:${mockServer.port}`
    currentToken = 'token-a@b.com'
  })

  afterAll(() => {
    mockServer.stop(true)
    try { unlinkSync(settingsPath) } catch { /* 忽略 */ }
    delete process.env.MYYODA_ORG_SETTINGS_PATH
  })

  test('注册并保存连接配置', async () => {
    const saved = await orgRegister(serverUrl, 'a@b.com', 'password123', 'Alice')
    expect(saved.serverUrl).toBe(serverUrl)
    expect(saved.email).toBe('a@b.com')
    expect(saved.token).toBe('token-a@b.com')
    const loaded = getOrganizationConnection()
    expect(loaded?.token).toBe('token-a@b.com')
  })

  test('登录成功覆盖 token', async () => {
    const saved = await orgLogin(serverUrl, 'a@b.com', 'password123')
    expect(saved.token).toBe('token-a@b.com')
  })

  test('登录失败抛 OrgApiError(401)', async () => {
    try {
      await orgLogin(serverUrl, 'nobody@b.com', 'password123')
      expect.unreachable('应抛出 401')
    } catch (err) {
      expect(err).toBeInstanceOf(OrgApiError)
      expect((err as OrgApiError).status).toBe(401)
    }
  })

  test('创建组织返回组织信息', async () => {
    const org = await orgCreate(conn(), '新组织')
    expect(org.id).toBe('org-1')
    expect(org.inviteCode).toBe('ABC12345')
  })

  test('我的组织与角色', async () => {
    const memberships = await orgMe(conn())
    expect(memberships[0]?.orgName).toBe('Mock Org')
    expect(memberships[0]?.role).toBe('admin')
  })

  test('加入组织', async () => {
    const result = await orgJoin(conn(), 'ABC12345')
    expect(result.org.id).toBe('org-1')
    expect(result.role).toBe('member')
  })

  test('成员列表', async () => {
    const members = await orgListMembers(conn(), 'org-1')
    expect(members[0]?.email).toBe('a@b.com')
  })

  test('Skills 列表', async () => {
    const skills = await orgListSkills(conn(), 'org-1')
    expect(skills[0]?.slug).toBe('my-skill')
    expect(skills[0]?.version).toBe('1.0.0')
  })

  test('Skill 详情含版本', async () => {
    const skill = await orgGetSkill(conn(), 'org-1', 'my-skill')
    expect(skill.version).toBe('1.1.0')
    expect(skill.versions.length).toBe(2)
  })

  test('下载 Skill zip 并解压', async () => {
    const zip = await orgDownloadSkill(conn(), 'org-1', 'my-skill')
    const files = await extractSkillZip(zip)
    const skillMd = new TextDecoder().decode(files['SKILL.md'])
    expect(skillMd).toContain('name: my-skill')
    expect(files['REFERENCE.md']).toBeTruthy()
  })

  test('401 过期抛 OrgApiError', async () => {
    const expired: import('@myyoda/shared').OrganizationConnection = { serverUrl, authType: 'account', email: 'a@b.com', token: 'expired-token' }
    try {
      await orgListSkills(expired, 'org-1')
      expect.unreachable('应抛出 401')
    } catch (err) {
      expect(err).toBeInstanceOf(OrgApiError)
      expect((err as OrgApiError).status).toBe(401)
    }
  })

  test('登出清除连接配置', () => {
    clearOrganizationConnection()
    expect(getOrganizationConnection()).toBeNull()
  })

  test('API Key 模式连接成功（lx_ 前缀）', async () => {
    // mock server 的鉴权是 Bearer token-a@b.com；这里用 apikey 形式走同一通道
    const saved = await orgConnectWithApiKey(serverUrl, 'lx_testkey123')
    expect(saved.authType).toBe('apikey')
    expect(saved.token).toBe('lx_testkey123')
  })

  test('API Key 格式不正确抛 OrgApiError', async () => {
    try {
      await orgConnectWithApiKey(serverUrl, 'plain-key')
      expect.unreachable('应抛出格式错误')
    } catch (err) {
      expect(err).toBeInstanceOf(OrgApiError)
      expect((err as OrgApiError).status).toBe(400)
    }
  })

  test('buildOrganizationImportSource 生成组织源元数据', () => {
    const source = buildOrganizationImportSource({
      organizationId: 'org-1',
      organizationName: 'Mock Org',
      organizationServerUrl: serverUrl,
      organizationSkillSlug: 'my-skill',
      version: '1.0.0',
      contentHash: 'abc123',
    })
    expect(source.sourceType).toBe('organization')
    expect(source.organizationId).toBe('org-1')
    expect(source.organizationSkillSlug).toBe('my-skill')
    expect(source.sourceVersion).toBe('1.0.0')
  })
})
