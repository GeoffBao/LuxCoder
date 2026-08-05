/**
 * API Key 服务
 *
 * 每个用户可生成一个长期有效的 API Key（格式 lx_<random>），
 * 用于脚本/CI/轻量接入场景，绕过账号密码登录。
 * 认证中间件同时接受 JWT 与 API Key（Authorization: Bearer <key>）。
 */

import { randomBytes } from 'node:crypto'
import { getDb } from '../db'

/** 生成 API Key 前缀 + 随机部分 */
function generateApiKey(): string {
  return `lx_${randomBytes(24).toString('base64url')}`
}

/** 为用户生成新的 API Key（覆盖旧 Key） */
export function createApiKeyForUser(userId: string): string {
  const db = getDb()
  const apiKey = generateApiKey()
  db.run('UPDATE users SET api_key = ? WHERE id = ?', [apiKey, userId])
  return apiKey
}

/** 校验 API Key，返回对应用户信息；无效返回 null */
export function verifyApiKey(apiKey: string): { userId: string; email: string } | null {
  if (!apiKey.startsWith('lx_')) return null
  const db = getDb()
  const row = db
    .query('SELECT id, email FROM users WHERE api_key = ?')
    .get(apiKey) as { id: string; email: string } | undefined
  return row ? { userId: row.id, email: row.email } : null
}

/** 吊销用户的 API Key */
export function revokeApiKeyForUser(userId: string): void {
  const db = getDb()
  db.run('UPDATE users SET api_key = NULL WHERE id = ?', [userId])
}

/** 获取用户当前 API Key（可能为 null） */
export function getApiKeyForUser(userId: string): string | null {
  const db = getDb()
  const row = db.query('SELECT api_key FROM users WHERE id = ?').get(userId) as { api_key: string | null } | undefined
  return row?.api_key ?? null
}
