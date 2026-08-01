import { describe, expect, test } from 'bun:test'
import { buildRegenerateTitlePrompt, createFallbackTitle, extractAssistantMessageText, extractGenuineUserMessageText, isLowSignalMessage, sanitizeGeneratedTitle, selectSpreadMessages, shouldRegenerateTitleAtUserMessageCount, stripContextWrappersForTitle } from './title-generation'

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

describe('isLowSignalMessage', () => {
  test('Given 简短确认语 When 判断 Then 视为低信息量', () => {
    expect(isLowSignalMessage('好的')).toBe(true)
    expect(isLowSignalMessage('谢谢')).toBe(true)
    expect(isLowSignalMessage('ok')).toBe(true)
  })

  test('Given 带问号的简短消息 When 判断 Then 不视为低信息量（可能是真实提问）', () => {
    expect(isLowSignalMessage('为什么？')).toBe(false)
  })

  test('Given 有实质内容的长消息 When 判断 Then 不视为低信息量', () => {
    expect(isLowSignalMessage('帮我看看这个登录超时的问题')).toBe(false)
  })
})

describe('selectSpreadMessages', () => {
  test('Given 4 条以上用户消息 When 挑选 Then 取首条 + 约 2/3 处 + 末条', () => {
    const messages = ['最初想优化侧边栏显示', '中间的补充说明内容一', '中间的补充说明内容二', '中间的补充说明内容三', '发现其实是标题生成的问题', '最后确认修复方案']

    expect(selectSpreadMessages(messages)).toEqual(['最初想优化侧边栏显示', '发现其实是标题生成的问题', '最后确认修复方案'])
  })

  test('Given 3 条及以下用户消息 When 挑选 Then 全部保留', () => {
    expect(selectSpreadMessages(['第一条实质内容', '第二条实质内容'])).toEqual(['第一条实质内容', '第二条实质内容'])
  })

  test('Given 末尾是简短确认语 When 挑选 Then 先剥离确认语再取首尾', () => {
    const messages = ['最初想优化侧边栏显示', '中间的补充说明内容', '继续', '发现其实是标题生成的问题', '好的', '谢谢']

    const result = selectSpreadMessages(messages)

    expect(result).not.toContain('好的')
    expect(result).not.toContain('谢谢')
    expect(result[0]).toBe('最初想优化侧边栏显示')
    expect(result[result.length - 1]).toBe('发现其实是标题生成的问题')
  })

  test('Given 全部消息都是低信息量 When 挑选 Then 不过滤，原样取首尾', () => {
    expect(selectSpreadMessages(['好的', '谢谢', '继续'])).toEqual(['好的', '谢谢', '继续'])
  })

  test('Given 空数组 When 挑选 Then 返回空数组', () => {
    expect(selectSpreadMessages([])).toEqual([])
  })
})

describe('extractGenuineUserMessageText', () => {
  test('Given Phase 4 原始 SDKMessage 格式的用户消息 When 提取 Then 返回手打文本', () => {
    const message = { type: 'user', message: { content: [{ type: 'text', text: '我发现一个问题' }] } }

    expect(extractGenuineUserMessageText(message)).toBe('我发现一个问题')
  })

  test('Given Phase 4 格式的 tool_result 消息（type 同样是 user） When 提取 Then 返回 null（复现 bug：不应计入用户消息数）', () => {
    const message = {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'text', text: '工具输出' }] }] },
    }

    expect(extractGenuineUserMessageText(message)).toBeNull()
  })

  test('Given 旧格式 { role, content: string } When 提取 Then 直接返回 content', () => {
    expect(extractGenuineUserMessageText({ role: 'user', content: '旧格式消息' })).toBe('旧格式消息')
  })

  test('Given assistant 消息 When 提取 Then 返回 null', () => {
    expect(extractGenuineUserMessageText({ type: 'assistant', message: { content: [{ type: 'text', text: '回复' }] } })).toBeNull()
  })
})

describe('extractAssistantMessageText', () => {
  test('Given Phase 4 原始 SDKMessage 格式的助手消息 When 提取 Then 拼接所有 text 块', () => {
    const message = { type: 'assistant', message: { content: [{ type: 'text', text: '已修复' }, { type: 'tool_use', name: 'Bash' }] } }

    expect(extractAssistantMessageText(message)).toBe('已修复')
  })

  test('Given 旧格式 { role, content: string } When 提取 Then 直接返回 content', () => {
    expect(extractAssistantMessageText({ role: 'assistant', content: '旧格式回复' })).toBe('旧格式回复')
  })

  test('Given 用户消息 When 提取 Then 返回 null', () => {
    expect(extractAssistantMessageText({ type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } })).toBeNull()
  })
})

describe('shouldRegenerateTitleAtUserMessageCount', () => {
  test('Given first user message When checking trigger Then allows single-question title correction', () => {
    expect(shouldRegenerateTitleAtUserMessageCount(1)).toBe(true)
  })

  test('Given longer sessions When checking trigger Then uses progressive drift-correction points', () => {
    expect(shouldRegenerateTitleAtUserMessageCount(4)).toBe(true)
    expect(shouldRegenerateTitleAtUserMessageCount(8)).toBe(true)
    expect(shouldRegenerateTitleAtUserMessageCount(15)).toBe(true)
    expect(shouldRegenerateTitleAtUserMessageCount(26)).toBe(true)
  })

  test('Given non-trigger counts When checking trigger Then skips regeneration', () => {
    expect(shouldRegenerateTitleAtUserMessageCount(2)).toBe(false)
    expect(shouldRegenerateTitleAtUserMessageCount(6)).toBe(false)
    expect(shouldRegenerateTitleAtUserMessageCount(14)).toBe(false)
    expect(shouldRegenerateTitleAtUserMessageCount(27)).toBe(false)
  })
})

describe('buildRegenerateTitlePrompt', () => {
  test('Given 首尾用户消息与最新回复 When 构建 Prompt Then 包含全部消息与回复内容', () => {
    const prompt = buildRegenerateTitlePrompt(['最初想优化侧边栏', '后来发现是标题生成的问题'], '已定位到根因并修复')

    expect(prompt).toContain('最初想优化侧边栏')
    expect(prompt).toContain('后来发现是标题生成的问题')
    expect(prompt).toContain('已定位到根因并修复')
    expect(prompt).toContain('标题：')
  })
})

describe('sanitizeGeneratedTitle 数组兼容（OpenCode Go 推理模型）', () => {
  test('Given content 为内容块数组 When 清理标题 Then 提取 text 文本', () => {
    expect(sanitizeGeneratedTitle([{ type: 'text', text: '  修复登录超时  ' }] as never)).toBe('修复登录超时')
  })

  test('Given content 为字符串 When 清理标题 Then 行为不变', () => {
    expect(sanitizeGeneratedTitle('优化侧边栏显示')).toBe('优化侧边栏显示')
  })

  test('Given 非文本内容 When 清理标题 Then 返回 null', () => {
    expect(sanitizeGeneratedTitle(null)).toBeNull()
    expect(sanitizeGeneratedTitle([{ type: 'tool_call', id: 'x' }] as never)).toBeNull()
  })
})
