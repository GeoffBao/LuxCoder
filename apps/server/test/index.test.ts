/**
 * 服务端入口测试：health 探活
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { closeDb } from '../src/db'
import { app } from '../src/index'

describe('服务端入口', () => {
  afterEach(() => {
    closeDb()
    delete process.env.MYYODA_SERVER_DB
  })

  test('GET /api/health 返回 ok', async () => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; service: string }
    expect(body.ok).toBe(true)
    expect(body.service).toBe('myyoda-server')
  })

  test('未知 API 路由返回 404', async () => {
    process.env.MYYODA_SERVER_DB = ':memory:'
    const res = await app.request('/api/not-exist')
    expect(res.status).toBe(404)
  })
})
