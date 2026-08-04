/**
 * API Key 管理路由
 *
 * - POST /api/auth/api-key  生成（覆盖旧 Key）
 * - GET  /api/auth/api-key  查询当前 Key
 * - DELETE /api/auth/api-key 吊销
 */

import { Hono } from 'hono'
import { getAuthUser, requireAuth, type AuthUser } from './middleware'
import { createApiKeyForUser, getApiKeyForUser, revokeApiKeyForUser } from './api-key-service'

export const apiKeyRoutes = new Hono()
apiKeyRoutes.use('*', requireAuth)

apiKeyRoutes.post('/api-key', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const apiKey = createApiKeyForUser(auth.userId)
  return c.json({ apiKey }, 201)
})

apiKeyRoutes.get('/api-key', (c) => {
  const auth = getAuthUser(c) as AuthUser
  const apiKey = getApiKeyForUser(auth.userId)
  return c.json({ apiKey })
})

apiKeyRoutes.delete('/api-key', (c) => {
  const auth = getAuthUser(c) as AuthUser
  revokeApiKeyForUser(auth.userId)
  return c.json({ ok: true })
})
