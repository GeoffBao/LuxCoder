import { describe, expect, test } from 'bun:test'
import type { ProviderType } from '@myyoda/shared'
import { AnthropicAdapter } from './anthropic-adapter.ts'
import { setAppVersion } from './user-agent.ts'

function buildRequest(provider: ProviderType, apiKey = 'test-key') {
  const adapter = new AnthropicAdapter(provider)
  const baseUrl = provider === 'xiaomi-token-plan'
    ? 'https://token-plan-cn.xiaomimimo.com/anthropic'
    : provider === 'qwen-token-plan'
      ? 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages'
      : provider === 'zhipu-coding-team'
      ? 'https://open.bigmodel.cn/api/anthropic'
      : 'https://api.xiaomimimo.com/anthropic'

  return adapter.buildStreamRequest({
    baseUrl,
    apiKey,
    modelId: 'mimo-v2.5-pro',
    history: [],
    userMessage: 'ping',
    readImageAttachments: () => [],
  })
}

describe('AnthropicAdapter title requests', () => {
  test('Kimi 标题请求提供足够输出预算且不发送不兼容的 thinking 字段', () => {
    const adapter = new AnthropicAdapter('kimi-api')
    const request = adapter.buildTitleRequest({
      baseUrl: 'https://api.moonshot.cn/anthropic',
      apiKey: 'test-key',
      modelId: 'kimi-k2.6',
      prompt: '生成标题',
    })
    const body = JSON.parse(request.body) as Record<string, unknown>

    expect(body.max_tokens).toBeGreaterThanOrEqual(256)
    expect(body.thinking).toBeUndefined()
  })

  test('Anthropic 标题请求保留兼容模型的思考能力配置', () => {
    const adapter = new AnthropicAdapter('anthropic')
    const request = adapter.buildTitleRequest({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'test-key',
      modelId: 'claude-sonnet-4-5',
      prompt: '生成标题',
    })
    const body = JSON.parse(request.body) as Record<string, unknown>

    expect(body.max_tokens).toBe(50)
  })
})

describe('AnthropicAdapter headers', () => {
  test('xiaomi API uses api-key authentication', () => {
    const request = buildRequest('xiaomi')

    expect(request.headers['api-key']).toBe('test-key')
    expect(request.headers.Authorization).toBeUndefined()
    expect(request.headers['User-Agent']).toBeUndefined()
  })

  test('xiaomi token plan keeps bearer authentication with MyYoda User-Agent', () => {
    setAppVersion('9.9.9')

    const request = buildRequest('xiaomi-token-plan')

    expect(request.headers.Authorization).toBe('Bearer test-key')
    expect(request.headers['User-Agent']).toBe('MyYoda/9.9.9 (+https://github.com/GeoffBao/MyYoda)')
    expect(request.headers['api-key']).toBeUndefined()
  })

  test('qwen token plan uses the complete Anthropic endpoint with bearer authentication and MyYoda User-Agent', () => {
    setAppVersion('9.9.9')

    const request = buildRequest('qwen-token-plan')

    expect(request.url).toBe('https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages')
    expect(request.headers.Authorization).toBe('Bearer test-key')
    expect(request.headers['User-Agent']).toBe('MyYoda/9.9.9 (+https://github.com/GeoffBao/MyYoda)')
    expect(request.headers['x-api-key']).toBeUndefined()
  })

  test('zhipu team plan uses apiKey from JSON for model calls', () => {
    setAppVersion('9.9.9')

    const request = buildRequest(
      'zhipu-coding-team',
      '{"apiKey":"model-key","organization":"org","project":"proj"}',
    )

    expect(request.headers.Authorization).toBe('Bearer model-key')
    expect(request.headers['User-Agent']).toBe('MyYoda/9.9.9 (+https://github.com/GeoffBao/MyYoda)')
    expect(request.headers['api-key']).toBeUndefined()
  })
})
