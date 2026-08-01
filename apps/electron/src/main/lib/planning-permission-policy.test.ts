import { describe, expect, test } from 'bun:test'
import { resolvePlanningDeletionPermission } from './planning-permission-policy'

describe('resolvePlanningDeletionPermission', () => {
  test('user + todo 删除在完全自动模式直接放行', () => {
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_todo', 'bypassPermissions', 'user')).toBe('allow')
  })

  test('user + 日程删除在完全自动模式直接放行', () => {
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_calendar_event', 'bypassPermissions', 'user')).toBe('allow')
  })

  test('user + 分组/标签/提醒删除需单次确认', () => {
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_group', 'bypassPermissions', 'user')).toBe('require-single-approval')
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_tag', 'bypassPermissions', 'user')).toBe('require-single-approval')
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_reminder', 'bypassPermissions', 'user')).toBe('require-single-approval')
  })

  test('自动任务与协作子会话始终拒绝删除', () => {
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_todo', 'bypassPermissions', 'automation')).toBe('deny-unattended')
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_reminder', 'bypassPermissions', 'delegation')).toBe('deny-unattended')
  })

  test('plan 模式 defer（由只读策略拒绝）', () => {
    expect(resolvePlanningDeletionPermission('mcp__planning__delete_group', 'plan', 'user')).toBe('defer-to-plan-mode')
  })

  test('非 planning 工具返回 not-planning-deletion', () => {
    expect(resolvePlanningDeletionPermission('Bash', 'bypassPermissions', 'user')).toBe('not-planning-deletion')
  })
})
