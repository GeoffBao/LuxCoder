import { describe, expect, test } from 'bun:test'
import { slugify } from '../slug'

describe('slugify', () => {
  test('转小写并用连字符折叠非字母数字', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
  })

  test('去除首尾连字符', () => {
    expect(slugify('  --Foo Bar--  ')).toBe('foo-bar')
  })

  test('限长 48 字符', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long)).toHaveLength(48)
  })

  test('空字符串返回空字符串', () => {
    expect(slugify('   ')).toBe('')
  })
})
