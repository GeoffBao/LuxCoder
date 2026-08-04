/**
 * JWT 鉴权 middleware
 *
 * 从 Authorization: Bearer <token> 解析用户，注入 c.set('auth', payload)。
 * 未携带或无效 token 返回 401。
 */

import type { Context, MiddlewareHandler } from 'hono'
import { verifyToken } from './password'

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
  const payload = await verifyToken(token)
  if (!payload) {
    return c.json({ error: '认证无效或已过期，请重新登录' }, 401)
  }
  c.set('auth', { userId: payload.userId, email: payload.email })
  await next()
}
