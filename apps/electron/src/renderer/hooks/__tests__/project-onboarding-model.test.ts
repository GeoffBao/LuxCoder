import { describe, expect, test } from 'bun:test'
import { getProjectOnboardingStorageKey, shouldPromptProjectOnboarding } from '../project-onboarding-model.ts'

describe('getProjectOnboardingStorageKey', () => {
  test('按 workspaceId 生成稳定的 key', () => {
    expect(getProjectOnboardingStorageKey('ws-1')).toBe('myyoda:workspace:ws-1:projectOnboardingSeen')
  })
})

describe('shouldPromptProjectOnboarding', () => {
  test('零项目 + 未见过时应该弹', () => {
    expect(shouldPromptProjectOnboarding({
      workspaceId: 'ws-1',
      hasAnyProjectInWorkspace: false,
      alreadySeen: false,
    })).toBe(true)
  })

  test('工作区已有项目时不弹（不是首次场景）', () => {
    expect(shouldPromptProjectOnboarding({
      workspaceId: 'ws-1',
      hasAnyProjectInWorkspace: true,
      alreadySeen: false,
    })).toBe(false)
  })

  test('已经弹过一次后不再弹', () => {
    expect(shouldPromptProjectOnboarding({
      workspaceId: 'ws-1',
      hasAnyProjectInWorkspace: false,
      alreadySeen: true,
    })).toBe(false)
  })

  test('缺少 workspaceId 时不弹', () => {
    expect(shouldPromptProjectOnboarding({
      workspaceId: undefined,
      hasAnyProjectInWorkspace: false,
      alreadySeen: false,
    })).toBe(false)
  })
})
