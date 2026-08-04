/**
 * JWT / API Key 双凭证鉴权 middleware
 *
 * 从 Authorization: Bearer <token> 解析用户，注入 c.set('auth', payload)。
 * 凭证可以是 JWT（账号登录）或 API Key（lx_ 前缀）。
 * 未携带或无效凭证返回 401。
 */

import type { Context, MiddlewareHandler } from 'hono'
import { verifyToken } from './password'
import { verifyApiKey } from './api-key-service'

export interface AuthUser {
  userId: string
  email: string
}

export function getAuthUser(c: Context): AuthUser | undefined {
  return c.get('auth') as AuthUser | undefined
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: '缺少认证信息，请先登录' }, 401)
  }
  const token = header.slice('Bearer '.length).trim()

  // API Key 优先（lx_ 前缀，快速短路）
  if (token.startsWith('lx_')) {
    const user = verifyApiKey(token)
    if (!user) {
      return c.json({ error: 'API Key 无效或已吊销' }, 401)
    }
    c.set('auth', { userId: user.userId, email: user.email })
    await next()
    return
  }

  // 否则按 JWT 校验
  const payload = await verifyToken(token)
  if (!payload) {
    return c.json({ error: '认证无效或已过期，请重新登录' }, 401)
  }
  c.set('auth', { userId: payload.userId, email: payload.email })
  await next()
}
