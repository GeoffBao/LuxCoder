import { describe, expect, mock, test } from 'bun:test'
import { CHAT_IPC_CHANNELS } from '@luxcoder/shared'
import type { WebContents } from 'electron'

const sendMock = mock(() => undefined)

// chat-service.ts 间接 import conversation-manager / attachment-service 等模块，
// 这些模块可能在加载时触碰 Electron API（对齐 channel-runtime-api-key.test.ts
// 的既有防御性做法，避免非 Electron 环境下 bun test 因缺失全局对象而在 import
// 阶段就崩溃）。
mock.module('electron', () => ({
  app: { isPackaged: true, getPath: () => '/tmp/luxcoder-test' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
  shell: { openExternal: async () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: class {},
}))

mock.module('./channel-manager', () => ({
  listChannels: () => [
    {
      id: 'claude-oauth-1',
      provider: 'anthropic-oauth',
      name: 'Claude Pro/Max',
      baseUrl: '',
      apiKey: '',
      models: [],
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  resolveChannelRuntimeApiKey: mock(async () => 'unused'),
}))

describe('Chat 模式 anthropic-oauth guard', () => {
  test('Given anthropic-oauth 渠道 When 发消息 Then 直接拒绝并引导切换 Code 模式，不解密 apiKey', async () => {
    const { sendMessage } = await import('./chat-service')
    const webContents = { send: sendMock } as unknown as WebContents

    await sendMessage(
      {
        conversationId: 'conv-1',
        userMessage: 'hi',
        messageHistory: [],
        channelId: 'claude-oauth-1',
        modelId: 'claude-sonnet-5',
      },
      webContents,
    )

    expect(sendMock).toHaveBeenCalledWith(
      CHAT_IPC_CHANNELS.STREAM_ERROR,
      expect.objectContaining({
        conversationId: 'conv-1',
        error: expect.stringContaining('Code 模式'),
      }),
    )
  })
})
