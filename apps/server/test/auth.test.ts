/**
 * 认证模块测试：注册 / 登录 / JWT 鉴权 middleware
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { closeDb, getDb } from '../src/db'
import { signToken, verifyToken, hashPassword, verifyPassword } from '../src/auth/password'
import { authRoutes } from '../src/auth/routes'

describe('认证模块', () => {
  beforeAll(() => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    closeDb()
  })

  test('hashPassword / verifyPassword 往返', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  test('signToken / verifyToken 往返', async () => {
    const token = await signToken({ userId: 'u1', email: 'a@b.com' })
    expect(token).toBeTruthy()
    const payload = await verifyToken(token)
    expect(payload?.userId).toBe('u1')
    expect(payload?.email).toBe('a@b.com')
  })

  test('verifyToken 拒绝伪造 token', async () => {
    const result = await verifyToken('invalid.token.value')
    expect(result).toBeNull()
  })

  test('POST /api/auth/register 注册成功并返回 token', async () => {
    const res = await authRoutes.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123', displayName: 'Alice' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user: { email: string }; token: string }
    expect(body.user.email).toBe('a@b.com')
    expect(body.token).toBeTruthy()
  })

  test('POST /api/auth/register 重复邮箱返回 409', async () => {
    const res = await authRoutes.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123', displayName: 'Alice' }),
    })
    expect(res.status).toBe(409)
  })

  test('POST /api/auth/register 参数校验：邮箱格式错误返回 400', async () => {
    const res = await authRoutes.request('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'secret123' }),
    })
    expect(res.status).toBe(400)
  })

  test('POST /api/auth/login 成功', async () => {
    const res = await authRoutes.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'secret123' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token).toBeTruthy()
  })

  test('POST /api/auth/login 密码错误返回 401', async () => {
    const res = await authRoutes.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
    })
    expect(res.status).toBe(401)
  })

  test('POST /api/auth/login 用户不存在返回 401', async () => {
    const res = await authRoutes.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@b.com', password: 'secret123' }),
    })
    expect(res.status).toBe(401)
  })
})
