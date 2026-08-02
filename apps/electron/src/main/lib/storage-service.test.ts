import { describe, expect, test } from 'bun:test'
import { isWorkspaceMetadataDir } from './storage-boundaries'

describe('Workspace metadata cleanup boundaries', () => {
  test('Outbox 位于 workspace-files 下，整个 metadata 根不会被 session orphan 清理', () => {
    expect(isWorkspaceMetadataDir('workspace-files')).toBe(true)
    expect(isWorkspaceMetadataDir('Outbox')).toBe(false)
  })
})
