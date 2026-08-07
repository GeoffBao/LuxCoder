/**
 * 会话自定义分组服务
 *
 * 用户自建的会话分组（侧边栏「移动到分组」/「分组方式：自定义分组」），
 * 按工作区隔离存储在 ~/.myyoda/agent-workspaces/{slug}/session-groups.json。
 */

import { randomUUID } from 'node:crypto'
import { getSessionGroupsPath } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import { listAgentSessions, updateAgentSessionMeta } from './agent-session-manager'
import type { SessionGroup } from '@myyoda/shared'

function readGroups(workspaceSlug: string): SessionGroup[] {
  return readJsonFileSafe<SessionGroup[]>(getSessionGroupsPath(workspaceSlug)) ?? []
}

function writeGroups(workspaceSlug: string, groups: SessionGroup[]): void {
  writeJsonFileAtomic(getSessionGroupsPath(workspaceSlug), groups)
}

/** 列出指定工作区的所有自定义分组，按名称排序 */
export function listSessionGroups(workspaceSlug: string): SessionGroup[] {
  return readGroups(workspaceSlug).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** 创建一个新分组 */
export function createSessionGroup(workspaceSlug: string, name: string): SessionGroup {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('分组名称不能为空')

  const now = Date.now()
  const group: SessionGroup = { id: randomUUID(), name: trimmed, createdAt: now, updatedAt: now }
  const groups = readGroups(workspaceSlug)
  groups.push(group)
  writeGroups(workspaceSlug, groups)
  return group
}

/** 重命名一个分组 */
export function renameSessionGroup(workspaceSlug: string, id: string, name: string): SessionGroup {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('分组名称不能为空')

  const groups = readGroups(workspaceSlug)
  const target = groups.find((g) => g.id === id)
  if (!target) throw new Error('分组不存在')

  target.name = trimmed
  target.updatedAt = Date.now()
  writeGroups(workspaceSlug, groups)
  return target
}

/**
 * 删除一个分组
 *
 * 级联清空所有引用该分组的会话的 customGroupId，避免留下指向已删除分组的悬空引用。
 */
export function deleteSessionGroup(workspaceSlug: string, id: string): void {
  const groups = readGroups(workspaceSlug)
  const next = groups.filter((g) => g.id !== id)
  writeGroups(workspaceSlug, next)

  const affectedSessions = listAgentSessions().filter((session) => session.customGroupId === id)
  for (const session of affectedSessions) {
    updateAgentSessionMeta(session.id, { customGroupId: undefined })
  }
}
