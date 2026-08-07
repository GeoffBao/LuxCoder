/**
 * 服务端入口 — Hono app 组装与 Bun.serve 启动
 *
 * 路由按模块挂载（auth / orgs / skills），
 * 启动时初始化数据库并打印监听地址。
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { ensureDatabase } from './db'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true, service: 'myyoda-server' }))

// ── 路由模块 ─────────────────────────────────────────────
import { authRoutes } from './auth/routes'
import { apiKeyRoutes } from './auth/api-key-routes'
import { orgRoutes } from './orgs/routes'
import { skillRoutes } from './skills/routes'
app.route('/api/auth', authRoutes)
app.route('/api/auth', apiKeyRoutes)
app.route('/api/orgs', orgRoutes)
app.route('/api/orgs', skillRoutes)

export { app }

/** 仅直接运行时启动监听；测试 import 时不会启动 */
if (import.meta.main) {
  ensureDatabase()
  const port = Number.parseInt(process.env.PORT ?? '8787', 10)
  console.log(`[MyYoda Server] 启动中 http://localhost:${port}`)
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  })
  console.log(`[MyYoda Server] 已监听 http://localhost:${server.port}`)
}
