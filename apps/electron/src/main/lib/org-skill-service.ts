/**
 * 企业版组织 Skills 分发服务（客户端侧）
 *
 * 负责：
 * 1. 组织连接配置持久化（~/.myyoda/org-settings.json）
 * 2. 与服务端 REST API 通信（认证 header、错误归一化）
 * 3. 组织信息 / Skills 列表 / 成员列表查询
 * 4. 下载 Skill zip 并解压到工作区（复用 SkillImportSource 语义）
 *
 * 连接配置仅存单组织（当前版本）；未来可扩展多组织。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import type {
  OrganizationConnection,
  OrganizationInfo,
  OrganizationMember,
  OrganizationMembership,
  OrganizationSkill,
  OrganizationSkillDetail,
  SkillImportSource,
} from '@myyoda/shared'

const ORG_SETTINGS_FILE = 'org-settings.json'

// ===== 配置持久化 =====

function getOrgSettingsPath(): string {
  // 环境变量覆盖（测试/CI/可移植部署用）
  if (process.env.MYYODA_ORG_SETTINGS_PATH) {
    return process.env.MYYODA_ORG_SETTINGS_PATH
  }
  // 与 config-paths 一致：开发模式 .myyoda-dev，正式版本 .myyoda
  const dirName = process.env.MYYODA_DEV === '1' ? '.myyoda-dev' : '.myyoda'
  return join(homedir(), dirName, ORG_SETTINGS_FILE)
}

/** 读取组织连接配置；未连接返回 null */
export function getOrganizationConnection(): OrganizationConnection | null {
  try {
    const raw = readFileSync(getOrgSettingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as OrganizationConnection
    if (!parsed.serverUrl || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

/** 保存组织连接配置 */
export function setOrganizationConnection(conn: OrganizationConnection): void {
  const path = getOrgSettingsPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(conn, null, 2), 'utf-8')
}

/** 清除组织连接配置（登出） */
export function clearOrganizationConnection(): void {
  try {
    rmSync(getOrgSettingsPath(), { force: true })
  } catch {
    /* 忽略清除失败 */
  }
}

// ===== REST 客户端 =====

/** 统一 REST 错误 */
export class OrgApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'OrgApiError'
  }
}

interface OrgApiOptions {
  method?: string
  body?: unknown
  formData?: FormData
  /** 期望二进制响应（下载） */
  binary?: boolean
}

async function orgRequest(
  conn: OrganizationConnection,
  path: string,
  options: OrgApiOptions = {},
): Promise<unknown | Uint8Array> {
  const url = `${conn.serverUrl.replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    authorization: `Bearer ${conn.token}`,
  }
  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let res: Response
  try {
    res = await fetch(url, { method: options.method ?? 'GET', headers, body })
  } catch {
    throw new OrgApiError(`无法连接组织服务端: ${conn.serverUrl}`, 0)
  }

  if (res.status === 401) {
    throw new OrgApiError('组织登录已过期，请重新登录', 401)
  }
  if (!res.ok) {
    let message = `请求失败 (${res.status})`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* 非 JSON 响应 */
    }
    throw new OrgApiError(message, res.status)
  }

  if (options.binary) {
    return new Uint8Array(await res.arrayBuffer())
  }
  return res.json() as Promise<unknown>
}

// ===== 业务 API =====

/** 账号登录（JWT） */
export async function orgLogin(serverUrl: string, email: string, password: string): Promise<OrganizationConnection> {
  const url = `${serverUrl.replace(/\/+$/, '')}/api/auth/login`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new OrgApiError(`无法连接组织服务端: ${serverUrl}`, 0)
  }
  if (!res.ok) {
    let message = `登录失败 (${res.status})`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* 忽略 */
    }
    throw new OrgApiError(message, res.status)
  }
  const body = (await res.json()) as { token: string }
  const conn: OrganizationConnection = { serverUrl, authType: 'account', email, token: body.token }
  setOrganizationConnection(conn)
  return conn
}

/** 注册新账号并登录 */
export async function orgRegister(serverUrl: string, email: string, password: string, displayName?: string): Promise<OrganizationConnection> {
  const url = `${serverUrl.replace(/\/+$/, '')}/api/auth/register`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })
  } catch {
    throw new OrgApiError(`无法连接组织服务端: ${serverUrl}`, 0)
  }
  if (!res.ok) {
    let message = `注册失败 (${res.status})`
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) message = json.error
    } catch {
      /* 忽略 */
    }
    throw new OrgApiError(message, res.status)
  }
  const body = (await res.json()) as { token: string }
  const conn: OrganizationConnection = { serverUrl, authType: 'account', email, token: body.token }
  setOrganizationConnection(conn)
  return conn
}

/** API Key 模式连接（不校验密码，直接用服务端生成的 Key） */
export async function orgConnectWithApiKey(serverUrl: string, apiKey: string): Promise<OrganizationConnection> {
  const trimmed = apiKey.trim()
  if (!trimmed.startsWith('lx_')) {
    throw new OrgApiError('API Key 格式不正确，应以 lx_ 开头', 400)
  }
  // 用 API Key 做一次健康探测，确认服务端可达且 Key 有效
  const conn: OrganizationConnection = { serverUrl, authType: 'apikey', token: trimmed }
  try {
    await orgMe(conn)
  } catch (err) {
    if (err instanceof OrgApiError && err.status === 401) {
      throw new OrgApiError('API Key 无效或已吊销', 401)
    }
    throw err
  }
  setOrganizationConnection(conn)
  return conn
}

/** 获取我的组织与角色 */
export async function orgMe(conn: OrganizationConnection): Promise<OrganizationMembership[]> {
  const body = (await orgRequest(conn, '/api/orgs/me')) as { memberships: OrganizationMembership[] }
  return body.memberships
}

/** 创建组织 */
export async function orgCreate(conn: OrganizationConnection, name: string): Promise<OrganizationInfo> {
  const body = (await orgRequest(conn, '/api/orgs', { method: 'POST', body: { name } })) as {
    org: OrganizationInfo
    role: string
  }
  return body.org
}

/** 凭邀请码加入组织 */
export async function orgJoin(conn: OrganizationConnection, inviteCode: string): Promise<{ org: OrganizationInfo; role: string }> {
  const body = (await orgRequest(conn, '/api/orgs/join', { method: 'POST', body: { inviteCode } })) as {
    org: OrganizationInfo
    role: string
  }
  return body
}

/** 列出组织成员 */
export async function orgListMembers(conn: OrganizationConnection, orgId: string): Promise<OrganizationMember[]> {
  const body = (await orgRequest(conn, `/api/orgs/${orgId}/members`)) as { members: OrganizationMember[] }
  return body.members
}

/** 列出组织 Skills */
export async function orgListSkills(conn: OrganizationConnection, orgId: string): Promise<OrganizationSkill[]> {
  const body = (await orgRequest(conn, `/api/orgs/${orgId}/skills`)) as { skills: OrganizationSkill[] }
  return body.skills
}

/** 获取组织 Skill 详情（含版本） */
export async function orgGetSkill(conn: OrganizationConnection, orgId: string, slug: string): Promise<OrganizationSkillDetail> {
  const body = (await orgRequest(conn, `/api/orgs/${orgId}/skills/${slug}`)) as { skill: OrganizationSkillDetail }
  return body.skill
}

/** 下载 Skill zip 字节 */
export async function orgDownloadSkill(conn: OrganizationConnection, orgId: string, slug: string, version?: string): Promise<Uint8Array> {
  const query = version ? `?version=${encodeURIComponent(version)}` : ''
  const data = await orgRequest(conn, `/api/orgs/${orgId}/skills/${slug}/download${query}`, { binary: true })
  return data as Uint8Array
}

/** 从 zip 字节解压为 Skill 目录文件映射（复用现有 jszip） */
export async function extractSkillZip(zip: Uint8Array): Promise<Record<string, Uint8Array>> {
  const loaded = await JSZip.loadAsync(zip)
  const files: Record<string, Uint8Array> = {}
  for (const [name, entry] of Object.entries(loaded.files)) {
    if (entry.dir) continue
    files[name] = await entry.async('uint8array')
  }
  return files
}

/** 构建组织源 SkillImportSource（写入 .source.json 用） */
export function buildOrganizationImportSource(params: {
  organizationId: string
  organizationName: string
  organizationServerUrl: string
  organizationSkillSlug: string
  version: string
  contentHash: string
}): SkillImportSource {
  return {
    sourceType: 'organization',
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    organizationServerUrl: params.organizationServerUrl,
    organizationSkillSlug: params.organizationSkillSlug,
    importedAt: new Date().toISOString(),
    sourceVersion: params.version,
    sourceContentHash: params.contentHash,
  }
}
