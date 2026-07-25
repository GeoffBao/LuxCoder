import { describe, expect, test } from 'bun:test'
import { createFallbackTitle, sanitizeGeneratedTitle, stripContextWrappersForTitle } from './title-generation'

describe('标题生成辅助逻辑', () => {
  test('Given ChatGPT OAuth 无标题适配器 When 本地兜底 Then 使用首个有效行并限制长度', () => {
    const title = createFallbackTitle('\n\n## 帮我修复 OpenAI OAuth 标题生成失败的问题\n更多细节')

    expect(title).toBe('帮我修复 OpenAI OAuth 标题')
  })

  test('Given 模型返回带引号标题 When 清理 Then 去除包裹符号并限制长度', () => {
    const title = sanitizeGeneratedTitle('「OpenAI OAuth 标题修复」')

    expect(title).toBe('OpenAI OAuth 标题修复')
  })

  // 参考 craft-agents-oss 的 validateTitle：模型不遵守"只输出标题"指令时会带开场白，
  // 不剥离的话这句开场白会直接混进用户看到的标题里。
  test('Given 模型返回带中文开场白的标题 When 清理 Then 剥离开场白只留标题', () => {
    expect(sanitizeGeneratedTitle('标题：修复登录超时问题')).toBe('修复登录超时问题')
    expect(sanitizeGeneratedTitle('好的，标题是：优化侧边栏显示')).toBe('优化侧边栏显示')
  })

  test('Given 模型返回带英文开场白的标题 When 清理 Then 剥离开场白只留标题', () => {
    expect(sanitizeGeneratedTitle("Sure, here's the title: Fix login timeout")).toBe('Fix login timeout')
    expect(sanitizeGeneratedTitle('Title: Dark Mode Support')).toBe('Dark Mode Support')
  })

  test('Given 模型返回链式开场白 When 清理 Then 反复剥离到不再匹配为止', () => {
    expect(sanitizeGeneratedTitle('好的：标题：修复登录问题')).toBe('修复登录问题')
  })

  test('Given 模型用 Markdown 加粗包裹标题 When 清理 Then 去除加粗标记', () => {
    expect(sanitizeGeneratedTitle('**修复登录超时问题**')).toBe('修复登录超时问题')
  })

  test('Given 标题正文里本身含有冒号 When 清理 Then 不误伤（冒号前不是已知开场白就不剥离）', () => {
    expect(sanitizeGeneratedTitle('比例：如何计算')).toBe('比例：如何计算')
  })
})

describe('stripContextWrappersForTitle', () => {
  test('Given 消息前置 attached_files 包装块 When 剥离 Then 只保留用户手打的文字', () => {
    const raw = '<attached_files>\n/Users/eason/Desktop/screenshot.png\n</attached_files>\n\n看看这个报错'

    expect(stripContextWrappersForTitle(raw)).toBe('看看这个报错')
  })

  test('Given 消息前置 quoted_context 包装块 When 剥离 Then 只保留用户手打的文字', () => {
    const raw = '<quoted_context source="agent-history" label="foo.ts" message_id="abc" role="user">\n之前的内容\n</quoted_context>\n\n这段要怎么优化'

    expect(stripContextWrappersForTitle(raw)).toBe('这段要怎么优化')
  })

  test('Given 消息前置 quoted_file 包装块 When 剥离 Then 只保留用户手打的文字', () => {
    const raw = '<quoted_file path="/repo/src/index.ts">\nconst x = 1\n</quoted_file>\n\n这里为什么报错'

    expect(stripContextWrappersForTitle(raw)).toBe('这里为什么报错')
  })

  test('Given 没有任何包装块的普通消息 When 剥离 Then 原样返回', () => {
    expect(stripContextWrappersForTitle('今天天气如何')).toBe('今天天气如何')
  })

  test('Given 不剥离直接对带 attached_files 的消息取兜底标题 When 生成 Then 会把 XML 开头行误当成标题（复现 bug）', () => {
    const raw = '<attached_files>\n/Users/eason/Desktop/screenshot.png\n</attached_files>\n\n看看这个报错'

    expect(createFallbackTitle(raw)).toBe('<attached_files>')
  })

  test('Given 先剥离包装块再取兜底标题 When 生成 Then 得到用户真正想表达的标题', () => {
    const raw = '<attached_files>\n/Users/eason/Desktop/screenshot.png\n</attached_files>\n\n看看这个报错'

    expect(createFallbackTitle(stripContextWrappersForTitle(raw))).toBe('看看这个报错')
  })
})
