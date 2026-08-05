/**
 * 认证路由：注册 / 登录
 */

import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { hashPassword, isValidEmail, signToken, verifyPassword } from './password'

export const authRoutes = new Hono()

interface RegisterInput {
  email?: string
  password?: string
  displayName?: string
}

interface LoginInput {
  email?: string
  password?: string
}

/** 创建用户记录并返回（内部函数，org 模块也复用） */
export async function createUser(input: { email: string; password: string; displayName?: string }) {
  const db = getDb()
  const id = randomUUID()
  const passwordHash = await hashPassword(input.password)
  const now = new Date().toISOString()
  db.run(
    'INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, input.email.toLowerCase(), passwordHash, input.displayName ?? '', now],
  )
  return { id, email: input.email.toLowerCase(), displayName: input.displayName ?? '' }
}

authRoutes.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => null)) as RegisterInput | null
  const email = body?.email?.trim()
  const password = body?.password
  const displayName = body?.displayName?.trim()

  if (!email || !password) {
    return c.json({ error: '邮箱和密码为必填项' }, 400)
  }
  if (!isValidEmail(email)) {
    return c.json({ error: '邮箱格式不正确' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: '密码长度至少 8 位' }, 400)
  }

  const db = getDb()
  const existing = db.query('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
  if (existing) {
    return c.json({ error: '该邮箱已注册' }, 409)
  }

  const user = await createUser({ email, password, displayName })
  const token = await signToken({ userId: user.id, email: user.email })
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, token }, 201)
})

authRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as LoginInput | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password) {
    return c.json({ error: '邮箱和密码为必填项' }, 400)
  }

  const db = getDb()
  const row = db
    .query('SELECT id, email, password_hash, display_name FROM users WHERE email = ?')
    .get(email) as { id: string; email: string; password_hash: string; display_name: string } | undefined
  if (!row) {
    return c.json({ error: '邮箱或密码错误' }, 401)
  }
  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) {
    return c.json({ error: '邮箱或密码错误' }, 401)
  }

  const token = await signToken({ userId: row.id, email: row.email })
  return c.json({ user: { id: row.id, email: row.email, displayName: row.display_name }, token })
})
