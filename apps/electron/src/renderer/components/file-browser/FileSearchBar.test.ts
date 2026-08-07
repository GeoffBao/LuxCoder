import { describe, expect, it } from 'bun:test'
import type { FileIndexEntry } from '@myyoda/shared'
import { sortSearchResults } from './FileSearchBar'

function entry(path: string, name: string, type: FileIndexEntry['type'] = 'file'): FileIndexEntry {
  return { path, name, type, source: 'workspace' }
}

describe('sortSearchResults', () => {
  it('prioritizes prefix matches, directories, shorter paths, then name', () => {
    const sorted = sortSearchResults([
      entry('docs/guide.md', 'guide.md'),
      entry('src', 'src', 'dir'),
      entry('src/app.ts', 'app.ts'),
      entry('src/apple.ts', 'apple.ts'),
      entry('apple', 'apple', 'dir'),
    ], 'app')

    expect(sorted.map((item) => item.path)).toEqual([
      'apple',
      'src/app.ts',
      'src/apple.ts',
      'src',
      'docs/guide.md',
    ])
  })
})
