import { describe, expect, it } from 'bun:test'
import type { FileIndexEntry } from '@myyoda/shared'
import { buildFileMentionTree } from './FileMentionList'

function entry(path: string, source: FileIndexEntry['source'], type: FileIndexEntry['type'] = 'file'): FileIndexEntry {
  return {
    name: path.split('/').pop() ?? path,
    path,
    type,
    source,
  }
}

describe('buildFileMentionTree', () => {
  it('keeps session and project entries with identical relative paths separate', () => {
    const tree = buildFileMentionTree([
      entry('src', 'workspace', 'dir'),
      entry('src/index.ts', 'workspace'),
      entry('src', 'session', 'dir'),
      entry('src/index.ts', 'session'),
    ])

    expect(tree.map((node) => `${node.source}:${node.treePath}`)).toEqual([
      'workspace:src',
      'session:src',
    ])
    expect(tree[0]?.children.map((node) => `${node.source}:${node.treePath}`)).toEqual(['workspace:src/index.ts'])
    expect(tree[1]?.children.map((node) => `${node.source}:${node.treePath}`)).toEqual(['session:src/index.ts'])
  })

  it('normalizes windows separators only for tree building while preserving mention paths', () => {
    const tree = buildFileMentionTree([
      entry('src\\nested', 'session', 'dir'),
      entry('src\\nested\\note.md', 'session'),
    ])

    expect(tree[0]?.treePath).toBe('src/nested')
    expect(tree[0]?.path).toBe('src\\nested')
    expect(tree[0]?.children[0]?.treePath).toBe('src/nested/note.md')
    expect(tree[0]?.children[0]?.path).toBe('src\\nested\\note.md')
  })
})
