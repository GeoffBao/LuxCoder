import { describe, expect, test } from 'bun:test'
import {
  parseReleaseVersion,
  compareReleaseSemver,
  isOlderThan,
  extractReleaseHeadline,
} from '../release-notes'

describe('parseReleaseVersion', () => {
  test('解析版本文件名', () => {
    expect(parseReleaseVersion('0.7.1.md')).toBe('0.7.1')
    expect(parseReleaseVersion('0.4.0.md')).toBe('0.4.0')
  })
})

describe('compareReleaseSemver', () => {
  test('降序：新版本在前', () => {
    expect(compareReleaseSemver('0.7.1', '0.7.0')).toBeLessThan(0)
    expect(compareReleaseSemver('0.6.9', '0.7.0')).toBeGreaterThan(0)
    expect(compareReleaseSemver('0.7.1', '0.7.1')).toBe(0)
  })

  test('正确处理跨位数版本号', () => {
    expect(compareReleaseSemver('0.10.0', '0.9.9')).toBeLessThan(0)
    expect(compareReleaseSemver('1.0.0', '0.99.99')).toBeLessThan(0)
  })

  test('短版本号按缺失段视为 0', () => {
    expect(compareReleaseSemver('0.7.0', '0.7')).toBe(0)
  })
})

describe('isOlderThan', () => {
  test('candidate 更旧时为 true（红点判定）', () => {
    expect(isOlderThan('0.6.9', '0.7.1')).toBe(true)
    expect(isOlderThan('0.7.1', '0.7.1')).toBe(false)
    expect(isOlderThan('0.7.2', '0.7.1')).toBe(false)
  })
})

describe('extractReleaseHeadline', () => {
  test('取第一个二级标题作为摘要', () => {
    const content = '# Yoda v0.7.1 更新\n\n## 品牌视觉：应用图标全面替换为最新素材\n\n- 详情...\n\n## 修复\n\n- 其他'
    expect(extractReleaseHeadline(content)).toBe('品牌视觉：应用图标全面替换为最新素材')
  })

  test('去除粗体/行内代码/链接等 markdown 标记', () => {
    const content = '# Title\n\n## **加粗** 与 `代码` 与 [链接](https://x.com)'
    expect(extractReleaseHeadline(content)).toBe('加粗 与 代码 与 链接')
  })

  test('超长摘要截断加省略号', () => {
    const content = `# Title\n\n## ${'很长的标题内容'.repeat(10)}`
    const result = extractReleaseHeadline(content)
    expect(result.length).toBe(36)
    expect(result.endsWith('…')).toBe(true)
  })

  test('没有二级标题时回退到首个正文行', () => {
    const content = '# Yoda v0.4.0 更新\n\n- 首个要点\n- 第二条'
    expect(extractReleaseHeadline(content)).toBe('首个要点')
  })

  test('空内容或只有一级标题时返回空串', () => {
    expect(extractReleaseHeadline('')).toBe('')
    expect(extractReleaseHeadline('# 只有标题')).toBe('')
  })
})
