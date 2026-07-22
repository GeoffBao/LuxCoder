import { describe, expect, test } from 'bun:test'
import {
  isLegacyCoworkMode,
  isOverlayActiveView,
  normalizeAppModeForUi,
  shouldShowWorkViewInCode,
} from '../code-main-view-model'

describe('normalizeAppModeForUi / isLegacyCoworkMode', () => {
  test('cowork 归一为 agent，并标记为遗留模式', () => {
    expect(normalizeAppModeForUi('cowork')).toBe('agent')
    expect(isLegacyCoworkMode('cowork')).toBe(true)
  })

  test('chat / agent / scratch 保持原样', () => {
    expect(normalizeAppModeForUi('chat')).toBe('chat')
    expect(normalizeAppModeForUi('agent')).toBe('agent')
    expect(normalizeAppModeForUi('scratch')).toBe('scratch')
    expect(isLegacyCoworkMode('agent')).toBe(false)
  })
})

describe('shouldShowWorkViewInCode', () => {
  test('agent 模式 + work 视图 + conversations → 显示 Work 视图', () => {
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'work',
      activeView: 'conversations',
    })).toBe(true)
  })

  test('agent 模式默认 session 视图不显示', () => {
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'session',
      activeView: 'conversations',
    })).toBe(false)
  })

  test('automations / agent-skills 覆盖视图优先，让位', () => {
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'work',
      activeView: 'automations',
    })).toBe(false)
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'work',
      activeView: 'agent-skills',
    })).toBe(false)
  })

  test('projects 不再作为覆盖视图（Hub 已移除）；agent-experts 仍覆盖', () => {
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'work',
      activeView: 'projects',
    })).toBe(false)
    expect(shouldShowWorkViewInCode({
      appMode: 'agent',
      codeMainView: 'work',
      activeView: 'agent-experts',
    })).toBe(false)
  })

  test('非 agent 模式不经过此判定（遗留 cowork 由启动迁移处理）', () => {
    expect(shouldShowWorkViewInCode({
      appMode: 'cowork',
      codeMainView: 'work',
      activeView: 'conversations',
    })).toBe(false)
    expect(shouldShowWorkViewInCode({
      appMode: 'chat',
      codeMainView: 'work',
      activeView: 'conversations',
    })).toBe(false)
  })
})

describe('isOverlayActiveView', () => {
  test('isOverlayActiveView 识别三类覆盖视图（projects Hub 已退役）', () => {
    expect(isOverlayActiveView('conversations')).toBe(false)
    expect(isOverlayActiveView('automations')).toBe(true)
    expect(isOverlayActiveView('agent-skills')).toBe(true)
    expect(isOverlayActiveView('projects')).toBe(false)
    expect(isOverlayActiveView('agent-experts')).toBe(true)
  })
})
