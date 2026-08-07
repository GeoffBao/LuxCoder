import { describe, expect, test } from 'bun:test'
import type { FileEntry } from '@myyoda/shared'
import { classifyOutboxFile, groupOutboxFilesByType } from './outbox-file-grouping'

function file(name: string): FileEntry {
  return { name, path: `/outbox/${name}`, isDirectory: false }
}

function dir(name: string): FileEntry {
  return { name, path: `/outbox/${name}`, isDirectory: true }
}

describe('classifyOutboxFile', () => {
  test('按扩展名归类到对应分组', () => {
    expect(classifyOutboxFile('report.md')).toBe('document')
    expect(classifyOutboxFile('cover.PNG')).toBe('image')
    expect(classifyOutboxFile('export.csv')).toBe('data')
    expect(classifyOutboxFile('deck.pptx')).toBe('presentation')
    expect(classifyOutboxFile('script.py')).toBe('code')
  })

  test('未知或缺失扩展名归入其他', () => {
    expect(classifyOutboxFile('README')).toBe('other')
    expect(classifyOutboxFile('archive.7z')).toBe('other')
    expect(classifyOutboxFile('.gitignore')).toBe('other')
  })
})

describe('groupOutboxFilesByType', () => {
  test('按固定顺序分组，跳过空分组', () => {
    const buckets = groupOutboxFilesByType([
      file('notes.md'),
      file('chart.png'),
      file('data.csv'),
    ])
    expect(buckets.map((b) => b.group)).toEqual(['document', 'image', 'data'])
    expect(buckets[0]!.entries).toHaveLength(1)
  })

  test('目录条目不参与分组', () => {
    const buckets = groupOutboxFilesByType([dir('assets'), file('notes.md')])
    expect(buckets).toHaveLength(1)
    expect(buckets[0]!.group).toBe('document')
  })

  test('全部为目录或空输入时返回空数组', () => {
    expect(groupOutboxFilesByType([])).toEqual([])
    expect(groupOutboxFilesByType([dir('assets')])).toEqual([])
  })
})
