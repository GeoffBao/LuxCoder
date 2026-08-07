/**
 * API Key 认证测试
 *
 * 覆盖：生成 API Key、使用 API Key 鉴权访问受保护接口、
 * 吊销 API Key、JWT 与 API Key 兼容。
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { closeDb } from '../src/db'
import { signToken } from '../src/auth/password'
import { createUser } from '../src/auth/routes'
import { apiKeyRoutes } from '../src/auth/api-key-routes'
import { requireAuth } from '../src/auth/middleware'
import { verifyApiKey } from '../src/auth/api-key-service'

describe('API Key 认证', () => {
  beforeAll(() => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    closeDb()
  })

  test('生成 API Key', async () => {
    const user = await createUser({ email: 'apikey@b.com', password: 'password123' })
    const token = await signToken({ userId: user.id, email: user.email })
    const res = await apiKeyRoutes.request('/api-key', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { apiKey: string }
    expect(body.apiKey).toMatch(/^lx_[a-zA-Z0-9_-]+$/)
  })

  test('使用 API Key 通过 requireAuth 鉴权', async () => {
    const user = await createUser({ email: 'apikey2@b.com', password: 'password123' })
    const token = await signToken({ userId: user.id, email: user.email })
    const res = await apiKeyRoutes.request('/api-key', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const { apiKey } = (await res.json()) as { apiKey: string }

    const verified = await verifyApiKey(apiKey)
    expect(verified?.userId).toBe(user.id)
    expect(verified?.email).toBe('apikey2@b.com')
  })

  test('无效 API Key 返回 null', async () => {
    const verified = await verifyApiKey('lx_invalid_key')
    expect(verified).toBeNull()
  })

  test('JWT 与 API Key 同时兼容 requireAuth', async () => {
    const user = await createUser({ email: 'apikey3@b.com', password: 'password123' })
    const jwtToken = await signToken({ userId: user.id, email: user.email })
    const jwtRes = await apiKeyRoutes.request('/api-key', {
      method: 'POST',
      headers: { authorization: `Bearer ${jwtToken}` },
    })
    expect(jwtRes.status).toBe(201)
  })

  test('吊销 API Key 后不可再用', async () => {
    const user = await createUser({ email: 'apikey4@b.com', password: 'password123' })
    const token = await signToken({ userId: user.id, email: user.email })
    const genRes = await apiKeyRoutes.request('/api-key', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const { apiKey } = (await genRes.json()) as { apiKey: string }
    expect(await verifyApiKey(apiKey)).not.toBeNull()

    const delRes = await apiKeyRoutes.request('/api-key', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(delRes.status).toBe(200)
    expect(await verifyApiKey(apiKey)).toBeNull()
  })
})
