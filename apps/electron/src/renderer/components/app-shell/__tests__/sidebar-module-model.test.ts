import { describe, expect, test } from 'bun:test'
import {
  formatSidebarModuleCount,
  sidebarModuleCollapseKey,
} from '../sidebar-module-model'

describe('formatSidebarModuleCount', () => {
  test('99 及以下原样显示', () => {
    expect(formatSidebarModuleCount(0)).toBe('0')
    expect(formatSidebarModuleCount(1)).toBe('1')
    expect(formatSidebarModuleCount(99)).toBe('99')
  })

  test('超过 99 显示 "99+"', () => {
    expect(formatSidebarModuleCount(100)).toBe('99+')
    expect(formatSidebarModuleCount(1234)).toBe('99+')
  })
})

describe('sidebarModuleCollapseKey', () => {
  test('按 `${mode}:${moduleId}` 拼接', () => {
    expect(sidebarModuleCollapseKey('agent', 'projects')).toBe('agent:projects')
    expect(sidebarModuleCollapseKey('cowork', 'projects')).toBe('cowork:projects')
  })

  test('不同模式生成独立 key', () => {
    expect(sidebarModuleCollapseKey('agent', 'projects')).not.toBe(
      sidebarModuleCollapseKey('cowork', 'projects'),
    )
  })
})
